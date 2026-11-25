# Agent 调用证据桥接合同

[English](README.md)

该轻量公共映射库把外部工具/Agent 调用记录转换为 CT-AIComm Agent 调用证据 1.0.0。它只负责字段映射和指纹生成，不是调度器、身份验证器、策略引擎或运行时执行器。

## 必须观测到的字段

- 调用目标与请求载荷（只在内存中计算指纹，不写入输出）；
- 稳定调用 ID、协议版本、传输方式、开始/结束时间、耗时和结果状态；
- 明确的数据来源标记：`synthetic` 或 `measured`；
- 来源、运行时和记录器的名称、版本及制品指纹；
- 只有来源明确提供的身份与授权声明才允许映射。

缺少必需数据时会报错。未包含请求/响应载荷的 OTel Span，必须由上游提供可与原始载荷独立绑定的指纹合同；不能把整条 Span 或无关属性的哈希冒充请求指纹。

## OTel GenAI + MCP 桥接

`../otel-genai/index.mjs` 接收一条已完成调用的 OTLP JSON Span。它读取 `gen_ai.tool.name` 和可选的 `gen_ai.tool.call.id`，并要求显式 `ct_aicomm.*` 桥接属性。这些自定义属性是 CT-AIComm 桥接合同，不代表 OpenTelemetry、Eino、WeKnora 或其他框架原生输出这些字段。

当前映射要求调用参数和成功响应在内存中可访问，以便计算载荷指纹；不会把原始内容放进输出。它会拒绝状态未设置、缺少 MCP 协议版本或传输方式的 Span。失败调用只保存规范化错误码，不保存原始错误文本。

## 示例

```js
import { adaptAgentCallEvidence, verifyAgentCallEvidenceFingerprint } from "./index.mjs";

const record = adaptAgentCallEvidence({
  event: { target_name: "lookup", request: { query: "synthetic" }, response: { count: 0 } },
  capture: {
    evidence_id: "evidence-example-001", call_id: "call-example-001",
    protocol_version: "2025-11-25", transport: "stdio",
    started_at: "2026-11-25T10:00:00.000Z", completed_at: "2026-11-25T10:00:00.025Z",
    duration_ms: 25, status: "succeeded", data_origin: "synthetic", source_kind: "application_log",
    runtime: { name: "example-runtime", version: "0.0.0-synthetic", artifact_fingerprint: `sha256:${"a".repeat(64)}` },
    recorder: { name: "example-recorder", version: "0.1.0", artifact_fingerprint: `sha256:${"b".repeat(64)}` }
  }
});
if (!verifyAgentCallEvidenceFingerprint(record)) throw new Error("fingerprint mismatch");
```

示例值均为合成数据。指纹只能证明指纹生成后记录未被修改，不能证明来源真实、调用已授权或结果最优。
