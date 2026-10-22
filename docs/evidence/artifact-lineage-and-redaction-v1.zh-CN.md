# 制品血缘与脱敏派生 v1

[English](artifact-lineage-and-redaction-v1.md)

状态：CT-605 公开契约。本契约记录一个受限、私有的 Evidence Core
`Artifact` 如何派生为另一个公开 `Artifact`。记录公开说明哪些源内容字段被隐藏或
转换，以及这些处理如何影响公开复核，但不会把私有源值复制到公开记录中。

## 契约

源对象和公开对象继续使用 Evidence Core `Artifact`。公开制品必须使用新的不可变
身份、分类为 `public`，并在 `derived_from` 中包含私有源制品的精确版本引用。两个
对象必须属于同一租户。

`ArtifactDerivationRecord` 固定以下内容：

- 源制品和公开制品的精确版本引用；
- 两个对象的规范对象指纹及字节内容指纹；
- 有外部锚点、带版本的脱敏策略指纹；
- 每个已披露隐藏或转换字段的有序 JSON Pointer；
- 确定性摘要和机器可读的公开复核限制；
- 覆盖完整记录的规范指纹。

记录明确不包含制品存储地址、源内容字节、隐藏值、替换值、凭据或签名私钥。

## 脱敏动作与复核影响

| 动作 | 公开含义 | 复核影响 |
| --- | --- | --- |
| `remove` | 删除源字段。 | 无法公开检查源值。 |
| `mask` | 只保留非敏感结构。 | 无法公开检查源值。 |
| `pseudonymize` | 替换源身份。 | 未经单独授权不能关联公私身份。 |
| `generalize` | 发布粒度更粗的值。 | 公开复核粒度降低。 |
| `aggregate` | 汇总多个源值。 | 无法检查每个源样本。 |

每条声明只包含源 JSON Pointer、动作、类别和原因代码。未知字段会被拒绝，因此调用方
不能误把 `source_value` 或 `replacement_value` 加进公开记录。

## 两级验证

`inspectArtifactDerivationRecord(record)` 可用于公开环境。它验证记录指纹、确定性摘要、
动作与影响映射以及信任边界，但不会声称已经取得两个制品。

`verifyArtifactDerivationRecord({ record, sourceArtifact, derivedArtifact,
expectedPolicyFingerprint })` 用于已授权复核环境。它还会重新计算两个 Artifact 的对象
指纹、验证精确 `derived_from` 关系，并可校验调用方提供的策略锚点。即使该验证通过，
也不表示已经读取或验证制品内容字节；内容字节仍需单独授权和完整性校验。

## 示例

运行零依赖合成场景：

```sh
node examples/evidence/derivation-synthetic.mjs
```

夹具不含客户数据，也不作真实性能声明。检查通过不等于源真实性、发布授权、法律批准、
独立复核或认证。
