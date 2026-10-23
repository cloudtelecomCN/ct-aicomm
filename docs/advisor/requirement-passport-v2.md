# CT-Advisor Requirement Passport 2.0

Requirement Passport 2.0 turns a task brief into versioned, machine-readable decision inputs. It is a public interoperability contract, not a customer record store. The public repository contains only schemas, field definitions, validation code, and synthetic fixtures.

## Contract set

- `specs/advisor/requirement-field-registry-v2.schema.json` defines the field-registry format.
- `examples/advisor/requirement-field-registry-v2.json` binds fields to all published task templates.
- `specs/advisor/requirement-passport-v2.schema.json` defines one portable Passport version.
- `packages/advisor/requirement-passport.mjs` validates template fields, types, units, source metadata, completeness, and frozen digests.
- `examples/advisor/synthetic-requirement-passports-v2.json` contains one synthetic frozen Passport for every task template.

## Field semantics

Every field carries a value status, typed value, canonical unit, constraint class, source kind, confidence, and observation time. `unknown` and `not_applicable` are explicit states and use `null`; validators never invent a replacement value. A template profile declares required and optional fields without changing the common Passport object.

Source kinds are `measured`, `vendor_published`, `customer_quoted`, `customer_declared`, `modeled`, `inferred`, `synthetic`, and `unknown`. A source label describes provenance; it does not by itself prove authenticity or accuracy.

## Freeze and verification

A draft may remain incomplete and has no digest. Freezing requires every template-required field to be present with `status=provided`. The digest is SHA-256 over the canonical Passport projection, including task binding, revision, normalized field order, recorder class, timestamps, and safety boundaries. Changing any frozen value, unit, source, or constraint invalidates the digest.

Editing after a freeze must create a later draft revision. It never rewrites the frozen version. Private implementations must retain immutable versions and derive organization scope from authenticated server-side context.

## Boundaries

A Passport records requirements for decision support. It does not authorize procurement, deployment, traffic changes, or execution. Synthetic fixtures cannot support a performance claim, and the contract does not certify source truth, regulatory compliance, availability, price, or inventory.
