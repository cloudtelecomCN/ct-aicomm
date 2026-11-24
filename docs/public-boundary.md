# Public and proprietary product boundary

## Public layer

The public repository defines stable integration contracts: schemas, read-only API descriptions, connector interfaces, conformance checks, and synthetic examples. These artifacts help third parties integrate without receiving the production implementation.

## CT-AIComm Enterprise proprietary layer

The following remain proprietary and are not distributed from this repository:

- decision, ranking, scoring, optimization, and calibration algorithms;
- weights, thresholds, private rules, and benchmark-derived tuning data;
- Orchestrator routing, approval execution, traffic control, and rollback implementations;
- Agent Control, eBPF, production connectors, and customer-tool execution;
- multi-tenant authorization, billing, deployment, and operations implementations;
- customer, partner, raw PoC, topology, and restricted evidence material.

Public contracts may describe inputs and outputs, but they must not reveal how proprietary decisions are computed or executed.

## Claims boundary

Schema conformance is not a performance result. A synthetic example is not a measured run. A recommendation is not execution authorization. A recorded identity claim is not identity certification. A recorded compliance fact is not legal certification.
