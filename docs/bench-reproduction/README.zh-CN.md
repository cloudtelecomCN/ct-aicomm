# CT-Bench 复现与证据规范

CT-Bench 为通信测量定义稳定的证据包。证据包包含：

- `report.json`：方法版本、明确的数据来源、完整环境、环境指纹、样本策略与聚合指标。
- `raw-samples.csv`：稳定的原始样本字段，包括保留的失败样本。
- `SHA256SUMS`：导出制品的校验和。

规范 CSV 表头为：

```text
sample_id,ttft_ms,connection_setup_ms,success,failure_code
```

失败样本必须保留，并包含机器可读的 `failure_code`；成功样本必须包含非负的 `ttft_ms`。合成运行与真实测量可以使用同一 schema，但必须通过 `data_origin` 强制区分。

本目录公开报告 schema、环境 schema 和明确标注的合成示例。该示例不代表真实网络性能。可执行打包工具将在源代码完成公开发布审查后加入本仓库。
