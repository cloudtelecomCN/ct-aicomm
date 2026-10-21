import { createHash } from "node:crypto";
import { buildCandidateSet } from "../orchestrator/candidate.mjs";
import { buildDecisionExplanation } from "../orchestrator/decision-explanation.mjs";
import { rankCandidates, TTFT_JOINT_SCORE_POLICY_V1 } from "../orchestrator/ttft-joint-score.mjs";
import { collectTtft } from "../ttft-collector/collector.mjs";
import { freezeEnvironment } from "./environment-freeze.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildJointOptimizationPlan({ environment, prompts, policyRevision, minimumSamples = 200, repetitions = 3 }) {
  const frozen = freezeEnvironment(environment);
  if (environment.evidence_origin !== "measured") fail("measured_environment_required", "joint optimization requires a measured frozen environment");
  if (!Array.isArray(prompts) || !prompts.length) fail("prompt_dataset_empty", "at least one versioned prompt is required");
  if (!Number.isInteger(policyRevision) || policyRevision < 1) fail("policy_revision_invalid", "a positive applied data-plane policy revision is required");
  if (!Number.isInteger(minimumSamples) || minimumSamples < 1 || !Number.isInteger(repetitions) || repetitions < 1) fail("sample_policy_invalid", "sample counts must be positive integers");
  for (const prompt of prompts) if (!prompt?.id || !prompt?.prompt || !prompt?.class) fail("prompt_invalid", "every prompt requires id, class, and prompt");

  const concurrencyLevels = environment.load_profile.concurrency;
  const requests = [];
  while (requests.length < minimumSamples) {
    const sequence = requests.length;
    const prompt = prompts[sequence % prompts.length];
    const stratum = Math.floor(sequence / prompts.length);
    requests.push(Object.freeze({
      sequence: sequence + 1,
      repetition: Math.floor(stratum / concurrencyLevels.length) % repetitions + 1,
      concurrency: concurrencyLevels[stratum % concurrencyLevels.length],
      prompt_id: prompt.id,
      prompt_class: prompt.class,
      prompt: prompt.prompt
    }));
  }
  const body = {
    schema_version: "1.0.0",
    group: "joint_optimization",
    route_policy: "joint_instance_and_network_selection",
    network_policy: "ebpf_redirect",
    score_policy_version: TTFT_JOINT_SCORE_POLICY_V1.version,
    policy_revision: policyRevision,
    environment_fingerprint: frozen.environment_fingerprint,
    prompt_dataset_sha256: environment.prompt_dataset.sha256,
    minimum_samples: minimumSamples,
    repetitions,
    concurrency_levels: concurrencyLevels,
    requests
  };
  return Object.freeze({ ...body, plan_sha256: digest(body) });
}

export async function runJointOptimizationPlan({
  plan,
  instances,
  model,
  sourceRegion,
  metricsProvider,
  networkProvider,
  routeByCandidate,
  costByCandidate,
  geographyPenaltyByRegion,
  scorePolicy = TTFT_JOINT_SCORE_POLICY_V1,
  apiKey,
  fetchImpl,
  collect = collectTtft,
  now = () => new Date()
}) {
  if (plan?.group !== "joint_optimization" || plan.route_policy !== "joint_instance_and_network_selection" || plan.network_policy !== "ebpf_redirect") fail("joint_plan_invalid", "a joint instance and eBPF network plan is required");
  if (!Array.isArray(instances) || instances.length < 2) fail("instance_set_invalid", "at least two discovered instances are required");
  if (typeof metricsProvider !== "function" || typeof networkProvider !== "function") fail("evidence_provider_missing", "metrics and network evidence providers are required");
  if (!routeByCandidate || instances.some(({ id }) => !routeByCandidate[id])) fail("route_mapping_missing", "every candidate requires a versioned logical eBPF route");

  const samplesBySequence = new Map();
  const decisions = [];
  for (let repetition = 1; repetition <= plan.repetitions; repetition++) {
    for (const concurrency of plan.concurrency_levels) {
      const stratum = plan.requests.filter((request) => request.repetition === repetition && request.concurrency === concurrency);
      for (let offset = 0; offset < stratum.length; offset += concurrency) {
        const window = stratum.slice(offset, offset + concurrency);
        const generatedAt = now();
        const evidence = await Promise.all(instances.map(async (instance) => ({ instance, metrics: await metricsProvider(instance, generatedAt), network: await networkProvider(instance, generatedAt) })));
        const candidates = buildCandidateSet(evidence.map(({ instance, metrics, network }) => ({ instance, metrics, network, requestedModel: model, sourceRegion, now: generatedAt })));
        const reservations = new Map(instances.map(({ id }) => [id, 0]));
        const selections = window.map((request) => {
          const reservedCandidates = candidates.map((candidate) => ({ ...candidate, load: { ...candidate.load, running_requests: candidate.load.running_requests + reservations.get(candidate.candidate_id) } }));
          const ranked = rankCandidates(reservedCandidates, { costByCandidate, geographyPenaltyByRegion, policy: scorePolicy });
          const decisionId = `joint-${String(request.sequence).padStart(6, "0")}`;
          const decision = buildDecisionExplanation({
            decisionId,
            rankedCandidates: ranked,
            constraints: [
              { id: "measured_candidate_evidence", kind: "hard", status: "passed", description: "Candidate load, health, and network evidence are measured before selection." },
              { id: "versioned_ebpf_route", kind: "hard", status: "passed", description: `All candidate routes use applied data-plane policy revision ${plan.policy_revision}.` }
            ],
            generatedAt,
            evidenceReferences: evidence.map(({ instance, metrics, network }) => `${instance.id}:${metrics.collected_at}:${network.collected_at}`)
          });
          if (!decision.selected_candidate_id) fail("no_eligible_candidate", "no eligible instance exists; execution remains fail-static");
          reservations.set(decision.selected_candidate_id, reservations.get(decision.selected_candidate_id) + 1);
          const selected = instances.find(({ id }) => id === decision.selected_candidate_id);
          const route = routeByCandidate[selected.id];
          decisions.push(Object.freeze({ decision_id: decision.decision_id, explanation_fingerprint: decision.explanation_fingerprint, repetition, concurrency, request_sequences: [request.sequence], selected_candidate_id: selected.id, route_id: route.route_id, policy_revision: plan.policy_revision, reservation_depth: reservations.get(selected.id), candidates: decision.candidates }));
          return { request, selected, route };
        });
        const measured = await Promise.all(selections.map(async ({ request, selected, route }) => ({
          sequence: request.sequence,
          sample: await collect({ endpoint: route.logical_endpoint, model, prompt: request.prompt, environmentFingerprint: plan.environment_fingerprint, apiKey, fetchImpl, sampleId: `joint-${String(request.sequence).padStart(6, "0")}` }),
          selected,
          route
        })));
        for (const result of measured) samplesBySequence.set(result.sequence, result.sample);
      }
    }
  }

  const samples = plan.requests.map(({ sequence }) => samplesBySequence.get(sequence));
  const failures = samples.filter((sample) => !sample.outcome.success);
  const decisionBySequence = new Map(decisions.flatMap((decision) => decision.request_sequences.map((sequence) => [sequence, decision])));
  const body = {
    schema_version: "1.0.0",
    status: samples.length >= plan.minimum_samples ? "collected" : "incomplete",
    data_origin: "measured",
    group: plan.group,
    route_policy: plan.route_policy,
    network_policy: plan.network_policy,
    score_policy_version: plan.score_policy_version,
    policy_revision: plan.policy_revision,
    plan_sha256: plan.plan_sha256,
    environment_fingerprint: plan.environment_fingerprint,
    sample_count: samples.length,
    success_count: samples.length - failures.length,
    failure_count: failures.length,
    failure_sample_ids: failures.map((sample) => sample.sample_id),
    assignments: plan.requests.map(({ sequence, repetition, concurrency, prompt_id, prompt_class }) => {
      const decision = decisionBySequence.get(sequence);
      return { sample_id: `joint-${String(sequence).padStart(6, "0")}`, repetition, concurrency, prompt_id, prompt_class, selected_candidate_id: decision.selected_candidate_id, route_id: decision.route_id, policy_revision: decision.policy_revision };
    }),
    decisions,
    samples
  };
  return Object.freeze({ ...body, batch_sha256: digest(body) });
}
