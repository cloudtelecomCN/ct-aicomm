# 厂商中立的基础设施数据接入

[English](README.md)

本适配包把客户侧导出的数据整理成厂商中立、只读的观测批次。不包含厂商 SDK、凭据、API 调用、云资源开通、设备写入、流量控制、排序或商业决策逻辑。

## “覆盖”的定义

`profiles.mjs` 为当前 CT-AIComm 企业适配计划中的每个组织和产品组登记了可接受的输入格式及仍需取得的验证材料。可接受格式只说明本映射器能够读取该格式，不表示厂商产品会输出这种格式，也不表示已完成在线集成或厂商认证。

当前共用输入轨道：

- `gnmi-json-ietf`：客户侧 gNMI 采集器已将获准通知转换为 JSON-IETF 数据；
- `prometheus`：客户侧采集器/Exporter 已规范化指标样本；
- `otlp-json`：客户侧 OpenTelemetry Collector 已导出获准的 Span/指标；
- `cloud-resource-normalized-json`：客户侧云连接器已规范化只读资源清单/指标；
- `vendor-normalized-json`：客户/集成商导出器按下述显式记录格式生成数据；
- `agent-call-evidence-v1` / `mcp`：工具调用证据使用独立的 Agent 调用适配器。

本包不会发起网络连接。客户侧导出器负责身份认证、端点白名单、限流、重试、区域路由和数据驻留。

## 规范化观测批次

```js
import { adaptVendorSnapshot, verifyVendorSnapshotFingerprint } from "./index.mjs";

const batch = adaptVendorSnapshot({
  profile_id: "nvidia",
  source: {
    protocol: "prometheus",
    name: "dcgm-exporter",
    version: "4.5.0-synthetic",
    source_ref: "cluster:demo/gpu-exporter",
    export_fingerprint: `sha256:${"a".repeat(64)}`
  },
  observed_at: "2026-11-25T10:00:00.000Z",
  data_origin: "synthetic",
  limitations: ["合成样例；未查询任何 GPU。"],
  records: [{
    resource_ref: "gpu:node-01/0",
    metric: "gpu.utilization_pct",
    value: 0,
    unit: "%",
    recorded_at: "2026-11-25T10:00:00.000Z",
    aggregation: "last",
    sample_count: 1
  }]
});

if (!verifyVendorSnapshotFingerprint(batch)) throw new Error("指纹不匹配");
```

示例值均为合成数据。`export_fingerprint` 由来源方提供，本映射器不会独立认证它。每个指标名称和单位必须由客户侧导出器明确映射；代码不会猜测换算关系或指标含义。

## 覆盖范围

完整双语厂商矩阵见[企业适配覆盖计划](../../docs/enterprise-adapter-coverage.zh-CN.md)。配置档覆盖网络设备商（中兴、华为、烽火、锐捷、新华三）、中国云厂商、三大运营商、系统集成商、可观测厂商、Agent/MCP 平台、加速器厂商、NVIDIA、AWS/Azure 中国区生态及 AXON Networks。

## 真实连接器的后续验收

每个产品都要固定具体型号/版本/API/Exporter，取得获授权的只读样例，记录指标名称和单位，并先准备合成样例。完成核验前，配置档保持“需样例验证”。不得把凭据或敏感原始载荷写入仓库或证据批次。

