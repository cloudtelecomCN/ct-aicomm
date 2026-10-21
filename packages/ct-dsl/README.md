# CT-DSL package

`@cloudtelecom/ct-dsl` is the dependency-free reference validator for CT-DSL policy documents. Version `1.0.0` validates the public v1 contract and exposes a conservative compatibility checker for future schema releases.

```js
import { assertValidPolicy } from "./packages/ct-dsl/index.mjs";
assertValidPolicy(policy);
```

The source package is released from this repository. It is not currently published to a package registry. See the [versioning and compatibility policy](../../docs/ct-dsl/versioning.md).
