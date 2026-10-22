# 链路证据护照契约

[English](README.md)

本零依赖包实现 CT-609 场景方法冻结、CT-610 本地导入与强制运行预检、CT-611 观测归一与质量标记，以及 CT-612 不可变封存、精确替代链、到期、替代和撤销公开契约。

公开能力包括：

- 创建和验证场景方法冻结记录；
- 创建运行计划并验证内容指纹；
- 创建和验证不保留路径、原始载荷与凭据的本地导入记录；
- 评估授权、时钟、预算、并发和停止条件五项预检；
- 只允许通过仍在有效期内的预检启动运行；
- 校验运行是否仍绑定原冻结记录，以及用新 `run_id` 创建替代运行；
- 通过 `observation.mjs` 创建和验证规范观测记录。
- 通过 `versioning.mjs` 创建和验证封存版本与替代版本；
- 通过 `versioning.mjs` 创建和验证到期、替代、撤销终态事件，并投影版本状态。

受保护内容包括源站点和目标站点、方向、协议、工作负载配置、精确的 Evidence Core
Scope 与 Method 引用、工具制品、参数、采样、排除规则、统计项和环境前提。运行进入
`started` 后，如冻结指纹发生变化，验证器返回 `passport_new_run_required`；替代运行必须
使用不同的 `run_id`，并记录前序运行引用。

只有精确计划和冻结已经完成本地导入，且授权、时钟、预算、并发和硬停止条件全部通过并仍
保持新鲜，运行才能进入 `started`。失败检查会生成不可变的失败预检记录，运行仍保持
`planned`；公开 SDK 不提供绕过预检的启动入口。

本包不访问网络，不执行流量，不采集测量，不认证身份，不提供存储，也不签发认证。
验证通过只说明输入记录的结构和内容完整性。

规范观测记录使用闭合样本账和 Evidence Core 规范单位，由规则派生质量状态，并为实测、
合成、推断和声明分别使用专用来源结构；不能仅修改标签来提升或合并来源。

封存护照版本按来源分组绑定精确观测。替代版本把独立复核重置为 `not-reviewed`，根据
自身封存时间推导新鲜度截止时间，并且不继承策略接受状态。即使终态事件未送达，到期
投影也会默认失效；替代和撤销使用追加式终态事件，不修改封存源。

运行合成场景：

```bash
node examples/passport/scenario-method-freeze-synthetic.mjs
node examples/passport/local-import-preflight-synthetic.mjs
node examples/passport/observation-normalization-synthetic.mjs
node examples/passport/sealing-versioning-synthetic.mjs
```
