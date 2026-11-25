# Qwen-Agent adapter status

[中文](README.zh-CN.md)

Status: **deferred; no stable lifecycle adapter is published**.

Qwen-Agent supports MCP and tool calling, but the public material reviewed does not establish a stable, general pre/post tool lifecycle event with call identity, timing, result/error, transport metadata, and provenance. Avoid monkey-patching agent internals as a supported integration. Revisit after Qwen-Agent exposes or documents a versioned hook/export contract; until then, use a customer-owned wrapper only if it can capture every required field without guessing.

This status is not a claim that Qwen-Agent lacks all logging or tracing. It means CT-AIComm has not verified a stable source contract sufficient for a reusable evidence adapter.

