# Link Evidence Passport sharing, revocation, and buyer decision v1

[中文](sharing-revocation-and-buyer-decision-v1.zh-CN.md)

CT-615 adds governed handoff records to the CT-614 offline delivery package. A
publisher can bind one exact Passport version and one exact delivery to one
named recipient for a limited time. The recipient can request supplemental
evidence by category, and a publisher or operator can respond with immutable
artifact references. The recipient can then record its own accepted or rejected
decision.

Buyer acceptance is a buyer-scoped business decision. It does not change
platform evidence status, independent-review status, freshness, policy status,
the underlying Passport, or any certification state.

## Record model

| Record | Purpose | Immutable boundary |
|---|---|---|
| `passport_share_grant` | Binds one recipient to an exact Passport and verified delivery until `expires_at` | Contains no bearer secret and proves neither identity nor export authorization |
| `passport_share_revocation` | Stops future use before expiry | Append-only; never edits the grant or Passport |
| `passport_supplement_request` | Lists missing method, environment, lineage, exclusion, or authorization context | Contains a request only, not raw evidence |
| `passport_supplement_response` | Closes every requested item with `provided` or `unavailable` | Embeds hash references only, never raw artifact bytes |
| `passport_buyer_decision` | Records one final `accepted` or `rejected` result for the recipient | Captures evidence and share snapshots without changing them |

Every record is canonicalized and protected by a `sha256:` content fingerprint.
References include object type, object id, semantic version, tenant, and exact
content fingerprint. Unknown fields, duplicate entries, reference drift, and
fingerprint drift fail closed.

## Share lifetime

A grant starts at its creation instant and must expire after that instant. It
cannot start before the verified delivery exists, outlive the Passport version,
or outlive the Passport authorization scope. Access is active only while both
the grant and the exact Passport version are active.

Expiry is derived from time, so a missing timer event cannot keep access open.
A valid revocation takes effect at its recorded instant. At most one append-only
revocation is accepted for a share. Requests, responses, and new decisions after
expiry, revocation, or Passport invalidation fail closed.

The public record is not a bearer URL, token, session, authentication result, or
authorization service. A deployment must enforce recipient authentication and
delivery access separately.

## Supplemental evidence

The request record must name the exact recipient; the SDK validates this binding
but does not authenticate the caller. Each request item has a stable id and one
category. A response must close every item exactly once.
For a `provided` item, `artifact_ref` is required; for `unavailable`, it must be
`null`.

An artifact reference proves only which immutable bytes were named. It does not
deliver those bytes or authorize their export. CT-606 export authorization and
its audit ledger remain separate and must be evaluated before any protected
artifact is transferred.

Likewise, publisher, operator, and buyer ids are structural record fields. The
SDK does not authenticate those principals or decide whether they hold the named
role. A deployment must provide that authority context outside this package.

An accepted decision may reference requests only when each one has a complete
response. A rejected decision may record unresolved gaps as part of the buyer's
reasoning.

## Buyer decision boundary

One share accepts at most one final buyer decision. The record includes:

- the exact buyer, share, Passport, and supplemental references;
- the active-share snapshot at the decision instant;
- the active sealed Passport lifecycle and status axes at that instant;
- decision-specific reason codes and a human note; and
- constant-false fields for platform mutation, inherited review, performance
  claims, and certification.

A later share revocation or Passport expiry does not erase the historical buyer
decision. Projection returns both values independently: the recorded buyer
decision and the current access/evidence state. An old acceptance therefore
cannot be interpreted as current access, current freshness, policy acceptance,
independent verification, SLA adjudication, or certification.

## Offline example

Run the zero-network synthetic scenario with Node.js 22 or newer:

```bash
node examples/passport/sharing-buyer-acceptance-synthetic.mjs
```

The example creates a supplemental request with two hash-referenced responses,
an accepted decision followed by revocation, and a separate rejected decision.
The output demonstrates that the historical acceptance remains recorded while
current access is closed and the platform evidence status remains unchanged.

The public implementation and types are:

- `packages/link-evidence-passport/sharing.mjs`
- `packages/link-evidence-passport/sharing.d.ts`
- `specs/passport/passport-sharing-v1.schema.json`

All repository fixtures are synthetic. They are not measured production
performance, an identity assertion, an export authorization, an independent
review, an SLA ruling, or a certification.
