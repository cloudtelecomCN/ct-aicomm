# CT-Advisor 规模与成本公式 v1

版本 `1.0.0` 定义 CT-Advisor 公开、确定性的规模与成本计算层。它针对一个明确声明的候选资源形态估算一项 AI 推理工作负载，不发现实时库存、不测量性能、不预留容量，也不执行采购。

## 输入纪律

每个数值输入均包含区间、规范单位、来源引用，以及一个明确状态：

- `provided`：使用所提供区间计算。
- `unknown`：向结果传播缺失路径，绝不填入所谓行业默认值。
- `not_applicable`：只允许用于约定的可选成本字段；仅因调用方明确排除了该成本，才按零处理。

计算器拒绝额外字段、错误单位、非有限区间、网络用量与单价适用性不一致，以及可用显存小于等于零等输入。未请求成本分析时，成本模型可设为 `null`。

## 规模公式

| 指标 | 公式 |
| --- | --- |
| `weight_memory_gib` | 参数量 x 每参数字节 x（1 + 额外开销）/ 2^30 |
| `kv_cache_memory_gib` | 活跃上下文 x 并发数 x 每 token KV 字节 / 2^30 |
| `workload_memory_gib` |（权重显存 + KV 显存）x（1 + 余量）|
| `usable_memory_per_gpu_gib` | GPU 显存 x 利用比例 - 运行时预留 |
| `memory_gpu_count` | ceil（工作负载显存 / 单 GPU 可用显存）|
| `required_output_tokens_per_second` | 请求速率 x 单请求输出 token x（1 + 余量）|
| `throughput_gpu_count` | ceil（所需输出速率 / 声明的单 GPU 输出速率）|
| `recommended_gpu_count` | max（显存所需 GPU 数，吞吐所需 GPU 数）|

区间运算采取保守边界：所有非负运算都保留上下界。声明的单 GPU 吞吐是带来源的输入，不是 CT-AIComm 的性能声明。

## 成本公式

成本计算覆盖实例、网络出流量、存储、支持、其他声明成本、折扣、税费和月度 token 量。`blended_cost_per_million_tokens` 用月度总成本除以输入与输出 token 总和。v1 没有提供成本分摊规则，因此不会伪装成独立的输入 token 或输出 token 单价。

每项结果都包含公式标识、规范单位、完整输入路径和缺失输入路径。规范化输入与计算结果分别生成确定性的 SHA-256 指纹。

## 可复现样例

`examples/advisor/sizing-cost-fixed-input-v1.json` 明确标记为合成数据。`examples/advisor/sizing-cost-fixed-expected-v1.json` 固定其预期哈希和关键数值。运行：

```bash
node --test tests/advisor-sizing-cost.test.mjs
```

## 产品边界

- 所有输出都是估算，不是报价或容量预留。
- 结果不构成实时库存、基准、可用性或性能声明。
- 计算不授权部署、采购、路由或任何执行动作。
- 未知数据保持未知；只有显式 `not_applicable` 成本输入才按零处理。
- 输入与输出 token 的独立经济性需要后续版本提供明确、可复核的成本分摊方法。
