# Public architecture

```text
Integrators
    |
    v
Public schemas + read-only API + connector contracts
    |
    v
Enterprise boundary (not included)
    |
    +-- decision and scoring core
    +-- routing and execution plane
    +-- tenant authorization and operations
    +-- private evidence and calibration data
```

The public layer is deliberately implementation-independent. It supplies interoperability and offline verification contracts while preserving the proprietary implementation boundary.
