# 多端点规模测试

CT-534 Phase 2 使用 `buildScalePlan`、`runScalePlan` 和 `summarizeScaleBatch`，在同一冻结环境中比较单端点拓扑与声明的多端点拓扑。计划文件只包含稳定别名；运行时 URL、凭据、主机名和私网细节仅在执行时注入，并保留在受限证据中。

执行器按拓扑、重复轮次和并发分层进行有界并行。失败与缺失尝试都会计入结果；吞吐量按成功请求计算，TTFT 分位数只使用成功收到首个内容片段的样本。完整运行生成权限受限的 `plan.json`、`batch.json`、`summary.json` 和 `SHA256SUMS`。

```bash
node scripts/run-scale-experiment.mjs \
  --environment=/restricted/environment.json \
  --prompts=examples/bench/ct-ttft-prompts-v1.jsonl \
  --endpoint=node-a=http://127.0.0.1:8000 \
  --endpoint=node-b=http://10.0.0.2:8000 \
  --topology=single-endpoint:node-a \
  --topology=all-endpoints:node-a,node-b \
  --concurrency=1,8,32,64 \
  --samples=64 \
  --repetitions=2 \
  --output=/restricted/scale-run
```

首轮冻结双 A10 测试完成 1,024/1,024 次请求。在并发 64 时，双端点拓扑记录到 366.20 个成功请求/秒和 177.55 ms P95 TTFT；单端点拓扑为 198.83 个成功请求/秒和 326.32 ms P95 TTFT。[公开回执](../../evidence/architecture/ct-534-a10-scale-20261022.json)将这些数字绑定到受限原始证据的哈希。

这些测量只适用于当次冻结的模型、软件、Prompt、拓扑和网络，不构成生产容量评级、可用性 SLO、线性扩展证明，也不能外推到其他加速器或地域。单端点组固定使用一个指定端点，因此结果也包含运行期间可能存在的端点差异。
