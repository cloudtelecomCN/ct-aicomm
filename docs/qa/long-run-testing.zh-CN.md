# 长稳测试门禁

CT-581 是证据门禁，不能用短时测试推导长稳结论。它包含三个彼此独立的阶段：

| 阶段 | 最短时长 | 含义 |
| --- | ---: | --- |
| `preflight` | 240 秒 | 验证负载、主机监控、Agent 心跳、失败计数和证据管道。 |
| `seven_day` | 604,800 秒 | 双节点实测环境的首个发布门禁。 |
| `thirty_day` | 2,592,000 秒 | 扩展运维门禁，不能由 7 天结果自动推导。 |

## 冻结边界

不可变 manifest 绑定完整 Git commit、环境指纹、模型、节点与端点别名、负载分层、阈值，以及 Prompt 集、TTFT 采集器、长稳运行器、主机监控器、Agent 运行时和 eBPF 对象的 SHA-256 指纹。冻结实验窗口必须覆盖整个阶段。运行地址、凭据和原始样本始终保留在受限环境中，不得出现在公开 manifest 或回执内。

Agent `0.1.x` 明确限定为只观测模式。本门禁可以证明真实 eBPF 程序持续加载和附着，并且没有无法解释的重启或资源增长；它不代表已经启用强制执行或自主流量重定向。

## 执行手册

在所有实测节点安装已签名的 Agent 包。计时开始前，以 root 身份执行真实内核生命周期检查：

```bash
agent/install/test-kernel-runtime.sh \
  /usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent \
  /usr/local/lib/ct-aicomm-agent/lib/ct_selector.bpf.o
```

创建不可变 manifest，输出路径不能预先存在：

```bash
node scripts/create-soak-manifest.mjs \
  --stage=seven_day \
  --started-at=2026-01-01T00:00:00.000Z \
  --source-commit=<完整的40位commit> \
  --environment=<受限环境文件.json> \
  --prompts=<受限Prompt文件.jsonl> \
  --agent=/usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent \
  --bpf=/usr/local/lib/ct-aicomm-agent/lib/ct_selector.bpf.o \
  --collector=packages/ttft-collector/collector.mjs \
  --runner=scripts/run-soak-stage.mjs \
  --monitor=scripts/soak_monitor.py \
  --output=<受限运行目录>/manifest.json
```

每个声明节点分别启动一个可续跑的主机监控器：

```bash
python3 scripts/soak_monitor.py \
  --manifest=<受限运行目录>/manifest.json \
  --node-alias=node-a \
  --output=<受限运行目录>/node-a
```

在控制节点启动负载。端点值只作为运行时参数，并且必须留在受限配置中：

```bash
node scripts/run-soak-stage.mjs \
  --manifest=<受限运行目录>/manifest.json \
  --environment=<受限环境文件.json> \
  --prompts=<受限Prompt文件.jsonl> \
  --agent=/usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent \
  --bpf=/usr/local/lib/ct-aicomm-agent/lib/ct_selector.bpf.o \
  --collector=packages/ttft-collector/collector.mjs \
  --monitor=scripts/soak_monitor.py \
  --endpoint=endpoint-a=<受限地址> \
  --endpoint=endpoint-b=<受限地址> \
  --output=<受限运行目录>/workload
```

只有负载和每个节点监控器都生成完成记录后，才能生成公开回执：

```bash
node scripts/finalize-soak-stage.mjs \
  --manifest=<受限运行目录>/manifest.json \
  --workload-windows=<受限运行目录>/workload/workload-windows.jsonl \
  --workload-completion=<受限运行目录>/workload/completed.json \
  --node-observations=node-a=<受限运行目录>/node-a/observations.jsonl \
  --node-completion=node-a=<受限运行目录>/node-a/completed.json \
  --node-observations=node-b=<受限运行目录>/node-b/observations.jsonl \
  --node-completion=node-b=<受限运行目录>/node-b/completed.json \
  --output=<受限运行目录>/public-receipt.json
```

最终器会先校验完成记录和日志哈希，再执行门禁。日志缺失或乱序、样本超出时间窗口、Agent 心跳陈旧、服务非活动、PID 或启动 ID 变化、服务重启、制品漂移、失败率超标、TTFT 漂移以及资源持续增长，都会按失败处理。

## 当前状态

首轮短时负载完成 10,240/10,240 次请求，覆盖 160 个拓扑、重复轮次与并发分层。有效请求窗口约 244 秒，外围 GPU 与进程 CPU 监控约 485 秒，两端推理服务重启数均为 0。[公开回执](../../evidence/quality/ct-581-a10-soak-preflight-20261022.json)仍明确标记为 `partial`：该轮早于完整的 Agent RSS 与不可变完成记录管道，且 7 天和 30 天门禁均未通过。
