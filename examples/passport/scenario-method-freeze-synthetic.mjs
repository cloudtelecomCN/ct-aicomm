import {
  PASSPORT_FREEZE_ERROR_CODES,
  assertPassportRunFreeze,
  createPassportReplacementRun,
  createPassportRunPlan,
  createPassportScenarioMethodFreeze,
  startPassportRun,
  verifyPassportRunBinding,
  verifyPassportScenarioMethodFreeze
} from "../../packages/link-evidence-passport/index.mjs";

const hash = (value) => `sha256:${value.repeat(64)}`;
const authorizationScope = {
  visibility: "shared",
  purpose: "Offline synthetic link-evidence-passport contract test.",
  recipients: ["organization-synthetic-reviewer"],
  expires_at: "2027-10-23T08:00:00.000Z"
};

const freezeInput = {
  freeze_id: "freeze-synthetic-link-a-b",
  version: "1.0.0",
  tenant_id: "tenant-synthetic-alpha",
  created_by: "principal-synthetic-author",
  created_at: "2026-10-23T08:00:00.000Z",
  authorization_scope: authorizationScope,
  scope_ref: {
    object_type: "scope",
    object_id: "scope-synthetic-link-a-b",
    version: "1.0.0",
    tenant_id: "tenant-synthetic-alpha"
  },
  method_ref: {
    object_type: "method",
    object_id: "method-synthetic-link-v1",
    version: "1.0.0",
    tenant_id: "tenant-synthetic-alpha"
  },
  scenario: {
    sites: [
      { site_id: "site-synthetic-b", role: "destination", region: "synthetic-west" },
      { site_id: "site-synthetic-a", role: "source", region: "synthetic-east" }
    ],
    direction: "unidirectional",
    protocol: {
      protocol_id: "protocol-synthetic-quic",
      version: "draft-synthetic-1",
      profile: "datagram-disabled"
    },
    workload: {
      workload_class: "inference",
      name: "synthetic-ttft-workload",
      version: "fixture-1",
      origin: "synthetic",
      configuration_fingerprint: hash("c")
    }
  },
  method_template: {
    template_id: "method-template-synthetic-ttft",
    version: "1.0.0",
    tool: {
      name: "ct-bench-synthetic-fixture",
      version: "1.0.0",
      artifact_fingerprint: hash("a")
    },
    parameters: [
      { name: "request_timeout_ms", value: 30000, unit: "ms" },
      { name: "external_network_access", value: false, unit: null }
    ],
    sampling: { target_count: 20, interval_ms: 100, warmup_count: 2 },
    exclusion_rules: [
      { rule_id: "exclude-synthetic-warmup", description: "Exclude the two declared synthetic warm-up samples." }
    ],
    statistics: [
      { metric: "ttft_ms", aggregations: ["count", "mean", "p95"] }
    ],
    environment_prerequisites: ["Node.js 22 or later with external network access disabled."]
  },
  boundary: {
    data_origin: "synthetic",
    limitations: ["No network request, customer endpoint, or measured performance is included."],
    performance_claim_allowed: false
  }
};

const freeze = createPassportScenarioMethodFreeze(freezeInput);
const plan = createPassportRunPlan({
  run_id: "passport-run-synthetic-001",
  version: "1.0.0",
  tenant_id: freeze.tenant_id,
  created_by: "principal-synthetic-runner",
  created_at: "2026-10-23T08:05:00.000Z",
  authorization_scope: authorizationScope,
  freeze,
  planned_window: {
    starts_at: "2026-10-23T08:10:00.000Z",
    ends_at: "2026-10-23T08:20:00.000Z"
  }
});
const started = startPassportRun({
  plan,
  version: "1.0.1",
  started_at: "2026-10-23T08:10:00.000Z"
});
const originalBinding = assertPassportRunFreeze({ run: started, freeze });

const changedFreeze = createPassportScenarioMethodFreeze({
  ...freezeInput,
  version: "1.1.0",
  created_at: "2026-10-23T08:11:00.000Z",
  method_template: {
    ...freezeInput.method_template,
    sampling: { ...freezeInput.method_template.sampling, target_count: 40 }
  }
});

let changedParameterRejected = false;
let newRunRequired = false;
try {
  assertPassportRunFreeze({ run: started, freeze: changedFreeze });
} catch (error) {
  changedParameterRejected = true;
  newRunRequired = error.code === PASSPORT_FREEZE_ERROR_CODES.newRunRequired;
}

let sameRunIdRejected = false;
try {
  createPassportReplacementRun({
    previous_run: started,
    freeze: changedFreeze,
    run_id: started.run_id,
    version: "1.0.0",
    created_by: "principal-synthetic-runner",
    created_at: "2026-10-23T08:12:00.000Z",
    authorization_scope: authorizationScope,
    planned_window: {
      starts_at: "2026-10-23T08:30:00.000Z",
      ends_at: "2026-10-23T08:40:00.000Z"
    }
  });
} catch (error) {
  sameRunIdRejected = error.code === PASSPORT_FREEZE_ERROR_CODES.newRunIdRequired;
}

const replacement = createPassportReplacementRun({
  previous_run: started,
  freeze: changedFreeze,
  run_id: "passport-run-synthetic-002",
  version: "1.0.0",
  created_by: "principal-synthetic-runner",
  created_at: "2026-10-23T08:12:00.000Z",
  authorization_scope: authorizationScope,
  planned_window: {
    starts_at: "2026-10-23T08:30:00.000Z",
    ends_at: "2026-10-23T08:40:00.000Z"
  }
});
const replacementBinding = assertPassportRunFreeze({ run: replacement, freeze: changedFreeze });

console.log(JSON.stringify({
  schema_version: "1.0.0",
  data_origin: freeze.boundary.data_origin,
  performance_claim_allowed: freeze.boundary.performance_claim_allowed,
  freeze_integrity_verified: verifyPassportScenarioMethodFreeze(freeze).content_fingerprint === freeze.content_fingerprint,
  run_binding_integrity_verified: verifyPassportRunBinding(started).content_fingerprint === started.content_fingerprint,
  started_run_bound: originalBinding.matched,
  changed_parameter_rejected: changedParameterRejected,
  new_run_required: newRunRequired,
  same_run_id_rejected: sameRunIdRejected,
  replacement_run_created: replacement.run_id !== started.run_id && replacementBinding.matched,
  previous_run_unchanged: started.freeze_ref.content_fingerprint === freeze.content_fingerprint,
  site_direction_protocol_workload_frozen: Boolean(freeze.scenario.sites.length === 2 && freeze.scenario.protocol.protocol_id),
  method_template_frozen: Boolean(freeze.method_template.template_id),
  external_network_used: false,
  certification_issued: false
}));
