# Evidence lifecycle v1

[中文](README.zh-CN.md)

This zero-dependency package implements the CT-602 Evidence Core lifecycle and
five-axis transition rules. It does not store tenant state, authenticate an
actor, deliver downstream events, or issue a certification.

```js
import {
  createEvidenceLifecycleSnapshot,
  transitionEvidenceLifecycle,
  projectEvidenceStatus
} from "./index.mjs";
```

Every event carries complete `from` and `to` snapshots for all five status
axes. `published` therefore cannot hide invalid measurement, failed integrity,
missing independent review, expired evidence, or a rejected policy decision.
Terminal lifecycle states are append-only and cannot return to an active state.

See [the bilingual lifecycle specification](../../docs/evidence/status-and-lifecycle-v1.md),
the [event schema](../../specs/evidence/evidence-lifecycle-event-v1.schema.json),
and the [synthetic history](../../examples/evidence/lifecycle/history.synthetic.json).
