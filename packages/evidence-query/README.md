# Evidence Query SDK

[中文](README.zh-CN.md)

This zero-dependency CT-608 module defines the portable, read-only query layer
for public Evidence Core projections. It validates records, applies deterministic
filters and cursor pagination, requires exact versions, creates status views,
and builds transport-neutral `GET` request descriptors.

```js
import {
  buildEvidenceQueryRequest,
  getEvidenceQueryRecord,
  queryEvidenceRecords
} from "./index.mjs";
```

The SDK accepts only records whose `visibility` is `public`. Unknown fields are
rejected, and tenant IDs, principals, storage locators, credentials, endpoints,
and contact fields are outside the public projection. It does not authenticate a
caller, authorize private evidence, discover a production service, sign a
response, or issue certification.

`buildEvidenceQueryRequest()` never performs network I/O and never creates a
write request. A deployment must select its own server URL, authentication,
authorization, rate limits, retention, and storage controls. A current HTTP
cache entry means response freshness only, not evidence validity.
