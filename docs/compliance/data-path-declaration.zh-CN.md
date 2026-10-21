# 数据路径声明 v1

[English](data-path-declaration.md)

CT-557 为一个工作负载修订定义与厂商无关的数据路径声明，精确记录地域、定向边界、加密控制和处理者。该契约只描述运营方的声明并保护文件完整性；声明验证通过不证明流量真实经过该路径，也不证明法律依据充分。

## 稳定字段语义

| 字段 | v1 中的固定含义 |
|---|---|
| `tenant_id` | 声明所属租户。文件中出现该字段不等于租户身份已经认证。 |
| `workload_id` / `revision` | 不可变的工作负载声明身份；上下文验证要求精确匹配。 |
| `data_categories` | 运营方定义的类别 ID，并使用固定分级：`public`、`internal`、`confidential` 或 `restricted`。 |
| `ordered_region_ids` | 数据路径的定向顺序；每个声明地域恰好出现一次。 |
| `regions` | 与厂商无关的地域，包含法域代码、厂商地域和路径角色。法域代码采用 ISO 3166-1/2 形式，但验证器不宣称完成官方代码库查询。 |
| `boundaries` | 每对相邻地域必须有且只有一个定向边界。法域变化必须同时声明 `cross_jurisdiction: true`、`jurisdiction` 类型和不透明的 `transfer_basis_ref`。 |
| `encryption` | 明确记录传输中与静态加密；控制或密钥引用不得包含密钥材料。 |
| `processors` | 控制者、处理者和子处理者，包含目的、数据类别、地域、父级关系及可选协议引用。 |
| `declaration_fingerprint` | 对规范化声明正文计算的 SHA-256 指纹。 |

语义验证器还会检查 ID 唯一性、完整路径边、地域引用、法域一致性、集合规范排序、处理者父级环、全部数据类别与处理/存储地域的处理者覆盖，以及加密字段一致性。JSON Schema 负责封闭结构和固定词表，语义验证器负责 JSON Schema 难以可靠表达的跨字段关系。

## JSON 与 YAML 配置

规范示例同时提供 [JSON](../../examples/compliance/synthetic-data-path-declaration.json) 和 [YAML](../../examples/compliance/synthetic-data-path-declaration.yaml)。`.yaml` 文件有意采用 JSON-compatible YAML 1.2 配置，以保持离线验证确定性，并禁止依赖解析器行为的标签、锚点、别名和隐式标量转换。使用方也可以用可信 YAML 1.2 解析器读取普通 YAML，再把得到的纯对象交给语义验证器。

```bash
node scripts/validate-data-path-declaration.mjs examples/compliance/synthetic-data-path-declaration.json
node scripts/validate-data-path-declaration.mjs examples/compliance/synthetic-data-path-declaration.yaml \
  --tenant tenant-synthetic \
  --workload workload-inference-synthetic \
  --revision 1
```

不提供期望上下文时，结果明确返回 `context_verified: false`。第二条命令把租户、工作负载和修订号与调用方提供的权威上下文比较，只有精确匹配才返回 `context_verified: true`。

## 公开契约

- Schema：[`../../specs/compliance/data-path-declaration-v1.schema.json`](../../specs/compliance/data-path-declaration-v1.schema.json)
- 参考实现：[`../../packages/compliance/data-path-declaration.mjs`](../../packages/compliance/data-path-declaration.mjs)
- 类型声明：[`../../packages/compliance/data-path-declaration.d.ts`](../../packages/compliance/data-path-declaration.d.ts)
- 离线 CLI：[`../../scripts/validate-data-path-declaration.mjs`](../../scripts/validate-data-path-declaration.mjs)
- 合成 JSON 示例：[`../../examples/compliance/synthetic-data-path-declaration.json`](../../examples/compliance/synthetic-data-path-declaration.json)
- 合成 YAML 示例：[`../../examples/compliance/synthetic-data-path-declaration.yaml`](../../examples/compliance/synthetic-data-path-declaration.yaml)

## 保证边界

验证通过只证明声明结构封闭、内部关系一致、内容未被篡改；提供期望上下文时，还证明它与指定租户、工作负载和修订号一致。它不证明网络观测、处理者身份、法律充分性、审批、法规符合性或认证。CT-558 现已通过[审计包 v1](audit-package.zh-CN.md)把声明与独立审批、执行、回滚和校验和证据打包。
