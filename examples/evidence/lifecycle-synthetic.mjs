import { readFile } from "node:fs/promises";
import { projectEvidenceStatus, replayEvidenceLifecycle } from "../../packages/evidence-lifecycle/index.mjs";

const fixture = JSON.parse(await readFile(new URL("./lifecycle/history.synthetic.json", import.meta.url), "utf8"));
const snapshot = replayEvidenceLifecycle(fixture.initial_snapshot, fixture.events);
const projection = projectEvidenceStatus(snapshot);

console.log(JSON.stringify({
  schema_version: fixture.schema_version,
  data_origin: fixture.data_origin,
  performance_claim_allowed: fixture.performance_claim_allowed,
  final_lifecycle_state: projection.lifecycle_state,
  blocking_conditions: projection.blocking_conditions,
  single_status_allowed: projection.single_status_allowed,
  certification_issued: projection.certification_issued
}, null, 2));
