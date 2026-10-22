# 链路证据护照交付包与离线验算 v1

[English](delivery-package-and-offline-verification-v1.md)

CT-614 将一个已经封存的 CT-612 护照版本整理为可携带、受校验和保护的交付包。另一环境无需连接 CT-AIComm 服务，即可使用交付的 JSON 与 CSV 复算指定统计与人读摘要。

## 交付文件

| 文件 | 用途 |
|---|---|
| `manifest.json` | 精确护照、运行、冻结、来源、统计配置、制品摘要和声明边界 |
| `passport-version.json` | 已封存的不可变护照版本 |
| `previous-version.json` | 当前版本为替代版本时对应的精确前序版本 |
| `run.json` | 护照版本引用的已启动运行绑定 |
| `freeze.json` | 冻结的场景与方法 |
| `observations.json` | 当前版本精确引用的归一化观测 |
| `samples.csv` | 用于复算的纳入、排除和失败样本行 |
| `SUMMARY.md` | 确定性生成的人读统计与限制摘要 |
| `VERIFY.md` | 本地验算条件与命令 |
| `SHA256SUMS` | 交付包内其他所有文件的 SHA-256 |

当封存版本含 `previous_version_ref` 时，前序版本文件为必需文件。交付包不允许嵌套路径、符号链接或解析到所选目录之外的文件。

## 统计配置

`ct-passport-statistics-v1` 固定以下规则：

- 按观测 ID、序号和样本 ID 排序；
- 每个尝试样本只能属于 `included`、`excluded` 或 `failed` 之一；
- 失败代码与阶段、排除规则及 CT-611 五项样本计数必须完全闭合；
- 纳入样本使用观测的源单位及 CT-611 单位转换目录；
- `mean` 按有序纳入值计算，`p50`、`p95`、`p99` 使用最近秩方法；
- 数值按 IEEE-754 binary64 的 15 位有效数字稳定化；
- 只接受 `raw`、`count`、`mean`、`min`、`max`、`p50`、`p95` 和 `p99`；
- 复算的源值与归一值必须和封存观测精确一致。

验算器随后重新生成 `SUMMARY.md`，并要求字节级完全一致。修改摘要、删除失败样本、改变数值或加入未声明文件，都会默认失败。

## 离线验算

在本公开仓库的检出版本中使用 Node.js 22 或更高版本：

```bash
node scripts/verify-passport-delivery.mjs <delivery-directory>
```

该命令不需要凭据、私有端点或外部网络。合成场景在一个交付包中验证两项统计：

```bash
node examples/passport/delivery-package-synthetic.mjs
```

公共 SDK 位于 `packages/link-evidence-passport/delivery.mjs`。
`createPassportDeliveryPackage()` 确定性生成内存文件，
`verifyPassportDeliveryPackage()` 独立重建清单、统计、摘要和校验和集合。

## 安全与证据边界

验算成功仅证明交付字节内部一致，并能按冻结算法复现声明的统计和摘要；它不验证主体身份、不证明导出已经授权、不证明独立复核、不构成真实生产性能证明、不裁决 SLA，也不签发认证。CT-606 授权记录与后续 CT-615 分享决定保持独立。

仓库中的全部样例均为合成数据，不得作为真实测量性能对外表述。
