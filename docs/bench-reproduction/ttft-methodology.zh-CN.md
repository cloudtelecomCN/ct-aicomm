# TTFT 实验方法 v1

机器可读方法位于 [`../../specs/bench/ttft-methodology-v1.json`](../../specs/bench/ttft-methodology-v1.json)，版本化 Prompt 集位于 [`../../examples/bench/ct-ttft-prompts-v1.jsonl`](../../examples/bench/ct-ttft-prompts-v1.jsonl)。

实验比较四组：保持现状的基线、仅实例选择、仅网络路径、联合优化。每组比较期间固定模型制品、Prompt、生成参数、运行时版本、硬件、并发度和测试窗口。

预热请求不计入测量。所有正式请求均须保留。失败请求计入成功率但不进入延迟分位数，并必须携带失败代码。禁止事后删除异常值。结果报告 p50、p95、p99、效应量和 95% Bootstrap 置信区间；置信区间包含零时不得宣称性能提升。

合成观测与真实测量不得聚合。性能退化和无提升结果与正向结果遵守相同的证据发布规则。
