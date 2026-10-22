# Evidence Core 对象模型 v1

[English](object-model-v1.md)

CT-601 定义 CT-AIComm 各证据产品共享的公开、中立对象词汇。链路证据护照、复核、SLA、调度、驻留和公开基准工作流使用同一交换边界，不再维护彼此不兼容的数据模型。

规范性契约是 [`specs/evidence/evidence-object-v1.schema.json`](../../specs/evidence/evidence-object-v1.schema.json)。该文件使用 JSON Schema Draft 2020-12，每次校验一个对象。

## 信任边界

通过 Schema 只能证明文档具有声明的结构，不能证明：

- 测量确实发生；
- 观测准确；
- 复核者具有独立性；
- 导出已得到权威服务授权；
- 策略结论正确；
- 产品、组织、链路或环境获得认证。

这些结论还需要运行上下文、授权、完整性验证、复核和客户验收。仓库内示例均为确定性合成夹具，不允许据此作出性能声明。

## 公共信封字段

每个对象都包含以下字段。对象 ID 使用相同规则，但保留 `scope_id`、`run_id` 等不同名称。

| 字段 | 类型 | 含义 |
|---|---|---|
| `schema_version` | 字符串 | 契约版本；v1 固定为 `1.0.0`。 |
| `object_type` | 枚举 | 九类对象之一。 |
| 对象专用 ID | 字符串 | 在租户和对象类型范围内稳定的标识。 |
| `version` | SemVer 字符串 | 此对象的不可变版本。 |
| `tenant_id` | 字符串 | 文档声明的租户边界；服务仍须执行权威授权。 |
| `created_by` | 字符串 | 文档声明的创建主体。 |
| `created_at` | UTC 时间 | 以 `Z` 结尾的创建时间。 |
| `authorization_scope` | 对象 | 预期可见性、用途、接收者和到期时间；不是访问令牌。 |

每个对象及嵌套结构都设置 `additionalProperties: false`。未知字段会被拒绝，不会被静默保留；新增字段必须发布带版本的 Schema。

## 对象词典

### Scope

冻结被检查的问题，包括站点、逻辑端点、方向、用途、有效时间和工作负载类别。单向 Scope 不能推出双向结论。

### Method

冻结工具及制品指纹、类型化参数、采样计划、排除规则、统计项和环境前提。实质方法变化必须产生新版本。

### Run

记录一次计划及实际执行窗口、固定版本的 Scope 与 Method、环境指纹、工作负载来源、时钟条件、结束状态和退出原因。失败及取消运行也必须保留。

### Observation

记录指标值、单位、观测位置、样本量、来源、质量、聚合方式和限制。`measured`、`synthetic`、`inferred`、`declared` 相互独立，不能自动提升证据等级。

### Artifact

描述按内容寻址的日志、配置、方法文件、报告或样本文件，记录媒体类型、SHA-256 指纹、大小、逻辑存储位置、密级和派生引用。存储位置本身不代表访问授权。

### EvidenceVersion

把 Scope、Method、Run、Observation 和 Artifact 的固定版本封装成已封存清单，并记录适用边界、来源、限制、五个独立状态轴、封存时间和内容指纹。

五个状态轴如下：

| 状态轴 | 取值 |
|---|---|
| 测量有效性 | `sufficient`、`partial`、`invalid`、`unknown` |
| 内容完整性 | `passed`、`failed`、`unverifiable` |
| 独立复核 | `not-reviewed`、`in-progress`、`consistent`、`deviation`、`uncertain` |
| 新鲜度 | `valid`、`expiring`、`expired`、`unknown` |
| 策略决定 | `accepted`、`rejected`、`manual-review` |

任何一个状态轴都不是万能“通过章”。[CT-602](status-and-lifecycle-v1.zh-CN.md) 定义生命周期及允许的状态转换；CT-601 只冻结词汇。

### Review

把复核人、组织、关系披露、精确 EvidenceVersion、复核范围、方法、发现、结论和时间绑定在一起。账户不同不等于组织独立。

### PolicyDecision

把特定消费方的决定与证据事实分开，固定规则版本及指纹、证据输入、结果、理由和决定时间。

### ExportGrant

记录指定资源的接收者、用途、JSON Pointer 字段范围、到期时间、水印和授权状态。权威服务仍必须认证接收者并检查最新撤销状态。

## 引用规则

每个 `objectReference` 都固定 `object_type`、`object_id`、`version` 和 `tenant_id`。消费方必须拒绝：

- 缺少版本或使用浮动版本的引用；
- 指向其他租户的引用；
- 与字段要求不匹配的对象类型；
- 内容指纹与封存清单不一致的对象；
- 按权威状态已经撤销、替代、过期或未授权的对象。

跨对象和权威状态检查属于 CT-602 至 CT-607；JSON Schema 本身不能证明这些条件。

## 版本规则

1. `schema_version` 遵循语义化版本；破坏字段或含义的变更升级主版本。
2. `version` 标识一个不可变业务对象版本。引用内容、语义、授权范围或受保护字段改变时必须产生新版本。
3. 引用必须固定精确版本，禁止 `latest` 和无版本引用。
4. 替代关系不能删除旧版本，也不会自动继承旧复核。
5. 未知字段直接拒绝；实验字段必须使用单独版本的 Schema，不能临时追加属性。
6. 时间使用 UTC；数值观测必须携带明确单位。

## 合成夹具

[`examples/evidence/v1/`](../../examples/evidence/v1/) 下的九个示例组成一个一致的合成对象图，不包含客户名称、可路由端点、凭据、私有拓扑或真实生产测量结果。

合成 `EvidenceVersion` 特意把内容完整性标记为 `unverifiable`。CT-601 定义字段，[CT-603](content-integrity-v1.zh-CN.md) 现已提供复算后的内容指纹、规范 manifest 和离线验证器；消费者仍需把成功验证写入生命周期事件，内容完整性轴才能进入 `passed`。
