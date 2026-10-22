# 证据内容完整性 v1

状态：CT-603 公开契约。本文定义 Evidence Core 包的确定性指纹和离线验证，
不定义签名权威、授权、独立复核或认证。

## 受保护包

一个包是只包含以下内容的平面目录：

- `manifest.json`：对象精确身份、角色、大小、字节校验和和规范对象指纹；
- `SHA256SUMS`：`manifest.json` 与每个已声明对象的字节校验和；
- 每个受保护 Evidence Core 对象对应一个规范格式 JSON 文件。

`protected_scope` 固定为 `entire-json-object`。每个字段、嵌套值、数组成员和
文件字节都受保护。缺少文件和出现未声明的额外文件都会导致验证失败。

## 指纹分层

1. `object_fingerprint` 是单个 JSON 对象 RFC 8785 规范形式的 SHA-256；原始
   `sha256` 同时保护精确 UTF-8 字节。
2. `content_fingerprint` 是 Scope、Method、Run、Observation 和 Artifact
   身份及对象指纹的聚合 SHA-256；它与文件位置无关，且必须等于
   `EvidenceVersion.content_fingerprint`。
3. `manifest_fingerprint` 保护完整 manifest 主体，包括每个对象描述符和聚合
   内容指纹。
4. `SHA256SUMS` 保护 manifest 和对象文件的精确序列化字节。

Review、PolicyDecision 和 ExportGrant 由 manifest 保护，但不改变
EvidenceVersion 内容指纹。它们是下游记录，不是测量或声明证据内容的输入。

## 离线验证

```bash
node scripts/verify-evidence-content.mjs examples/evidence/v1
node scripts/verify-evidence-content.mjs examples/evidence/v1 \
  --expected-manifest sha256:<可信-manifest-指纹>
```

CLI 使用 `realpath`，拒绝符号链接和子目录，要求文件集合完全一致，并且不访问
网络。第二种方式还会比对从固定 Git 提交、签名发布、透明日志或其他独立渠道
取得的可信 manifest 指纹。

## 威胁边界

完整性不等于真实性。

普通 SHA-256 只能发现相对于既有校验值的修改。如果攻击者能同时重写全部对象、
manifest 和 `SHA256SUMS`，就能生成新的内部一致包。要发现这种攻击，必须用
`--expected-manifest` 比对保存在不可信包之外的指纹。CT-603 不宣称提供签名或
可信身份。

验证成功只表示：

- 已声明字节和对象身份与 manifest 一致；
- 各层指纹内部一致；
- 提供外部锚点时，该锚点一致。

它不能证明测量真实发生、数据真实、复核人独立、政策批准使用或已经签发认证。

## 稳定错误

模块导出 `EVIDENCE_CONTENT_INTEGRITY_ERROR_CODES`。重要错误包括不安全或重复
路径、非规范 JSON、对象身份不一致、对象校验和或指纹不一致、内容或 manifest
指纹不一致、校验集合不一致和外部锚点不一致。

## 合成样例

`examples/evidence/v1` 是确定性合成数据，不包含客户端点、生产工作负载、外部
网络测量或性能声明。可用以下命令重新生成：

```bash
node examples/evidence/generate-content-integrity-synthetic.mjs
```
