# CT-DSL versioning and compatibility

CT-DSL uses Semantic Versioning for the package and schema release metadata. The document field `version: 1` identifies the major wire format and remains stable throughout the `1.x.x` line.

- Patch releases clarify validation or documentation without changing accepted documents.
- Minor releases may add optional properties or broaden accepted values.
- Major releases may add requirements, remove properties, narrow values, or otherwise reject a document accepted by the previous major version.

The compatibility checker treats removed properties, newly required properties, narrowed enums, changed constants or types, stricter unknown-property handling, and narrowed numeric ranges as breaking. CI validates all committed v1 examples against the reference validator and exercises both compatible and breaking schema changes.
