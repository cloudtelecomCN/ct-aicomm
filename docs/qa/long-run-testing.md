# Long-run stability gate

CT-581 uses three explicitly separate stages. A short preflight validates the workload, evidence pipeline, resource sampling, and failure accounting. A seven-day run is the first release gate. A thirty-day run is the extended operations gate. Passing an earlier stage never implies that a later stage passed.

Every stage must freeze the model, software, topology, prompts, load strata, and collection code. It must retain failed and missing attempts, service restart counts, resource trends, health probes, and checksums for restricted raw evidence. An unexplained process restart, sustained resource growth, missing observation, or evidence-integrity failure prevents passage.

The first short preflight completed 10,240 of 10,240 attempts across 160 topology, repetition, and concurrency strata. Its active request window was approximately 244 seconds; surrounding GPU and process-CPU monitoring covered approximately 485 seconds, and both inference services reported zero restarts. The [public receipt](../../evidence/quality/ct-581-a10-soak-preflight-20261022.json) is intentionally marked `partial` because neither the seven-day nor the thirty-day duration has been run.
