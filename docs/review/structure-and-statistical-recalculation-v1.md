# Independent review structure and statistical recalculation v1

[中文](structure-and-statistical-recalculation-v1.zh-CN.md)

CT-618 records limited review work against one exact CT-616 engagement. It requires the CT-617 declared-records-only gate to be eligible, an active time-limited share bound to the assigned review lead, the exact Passport version and checksum-verified delivery, and a statistical-recalculation or supervised-reexecution engagement level.

## Structure checklist

The reference implementation fails closed before creating a record unless all seven checks pass:

1. the delivery checksum set and canonical rebuild are valid;
2. the engagement binds the exact Passport and delivery;
3. the CT-617 independence gate is eligible on its declared records;
4. an active share names the assigned review lead and reviewer organization;
5. the fixed `ct-passport-statistics-v1` profile is present;
6. attempted, included, excluded, and failed samples close exactly; and
7. independent results cover the exact delivered statistic set.

A failed structural prerequisite is an error, not a partial pass. No checklist may be created by directly supplying caller-selected pass values.

## Independent recalculation

`recalculateIndependentReviewStatistics()` reads the checksum-verified `samples.csv` and `observations.json` offline. It independently applies the declared IEEE-754 rounding, nearest-rank percentile method, sample order, and unit catalog. The result includes sample counts and one sample-derived value per observation.

The assigned review lead supplies the outputs from the declared recalculation implementation. CT-618 binds that implementation identifier, version, runtime, and exact result set to the record. Implementation identity is self-declared; the SDK does not attest the process, binary, host, or operator.

## Tolerance and difference register

For `exact` engagements, every non-zero difference is outside tolerance. For `declared-thresholds`, every delivered metric must have exactly one matching rule. Absolute tolerance uses the normalized metric unit; relative tolerance uses percent. A zero reference value can satisfy relative tolerance only with another exact zero.

Each statistic is classified as `exact`, `within-tolerance`, or `outside-tolerance`. Every non-exact result creates an immutable difference entry containing expected and recalculated values, absolute and relative deltas, the applied rule, and a deterministic explanation. The summary outcome is `consistent` when all results are exact or within declared tolerance, otherwise `deviation`. A deviation is preserved as a finding; it is never silently converted into a failure-free record.

## Trust boundary

An active share record is required, but CT-618 does not authenticate the named principal or externally verify export authorization. The CT-617 gate remains based on declared records and is not certification of reviewer independence. CT-618 performs structural checks and statistical comparison only. It does not rerun the workload, reproduce a historical environment, issue an opinion, alter Passport status, adjudicate an SLA, establish a performance conclusion, or issue certification.

[CT-619](./supervised-reexecution-and-environment-differences-v1.md) adds a separately fingerprinted later-execution record, supervision window, event-log reference, and environment difference register. It still never represents that later run as historical-state reproduction.

All checked-in examples are synthetic. A `consistent` result means only that the submitted recalculation agrees with the authorized sample package under the declared method and tolerance.

## Run offline

```bash
node --test tests/review-structure-recalculation.test.mjs
node examples/review/structure-statistical-recalculation-synthetic.mjs
```

Neither command requires credentials, private infrastructure, or external network access.
