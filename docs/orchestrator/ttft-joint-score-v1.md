# TTFT joint score v1

CT-515 ranks only eligible candidates using five explicit dimensions: queue pressure, measured network quality, declared geography penalty, declared cost, and health. Version 1 uses fixed weights of 30%, 30%, 15%, 15%, and 10% respectively. Every component is normalized against policy ceilings rather than the current candidate set, so adding another candidate cannot silently change an existing score.

Lower scores are preferred. The network component combines measured RTT, packet loss, and available bandwidth; queue pressure combines waiting and running requests. Geography and cost must be supplied by versioned governance and commercial evidence. Missing evidence is rejected rather than filled with a default. Ineligible candidates retain their elimination reasons and receive no score.

The result includes all raw inputs, normalized components, weights, policy version, final score, and a deterministic fingerprint. Exact ties use the stable candidate ID. This is a deterministic ranking function, not a claim that the score itself is predicted or measured TTFT; CT-516 exposes the complete explanation object.
