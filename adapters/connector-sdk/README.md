# Connector interface

`index.mjs` defines the public adapter contract for candidate discovery and metric collection. It normalizes returned records and supports deterministic contract tests.

The interface does not contain CT-AIComm Enterprise ranking, scoring, route selection, authorization, traffic execution, rollback, private credentials, or customer configuration.
