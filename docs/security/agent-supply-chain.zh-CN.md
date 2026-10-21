# Agent 供应链

CT-529 发布包严格包含四个受摘要约束的制品：`ct-aicomm-agent`、`ct_selector.bpf.o`、`ct-aicomm-agent.spdx.json` 和 `provenance.json`。`SHA256SUMS` 使用离线 Ed25519 发布密钥签名。生产安装必须同时提供签名、公钥、SBOM 和来源证明；缺失、多余、被修改或未签名的制品都会在安装前被拒绝。

`scripts/audit-agent-dependencies.mjs` 扫描 Agent 控制面和发布脚本的运行时导入；当前实现仅允许 Node.js 内建模块和仓库内相对模块，不含第三方运行时依赖。升级器先保留上一份已签名安装，只有新服务通过健康检查后才删除备份；失败时自动恢复旧版本。自定义健康检查只允许用于隔离根目录测试，不能替代生产主机上的 systemd 检查。

确定性的 SPDX 2.3 生成器清点 Agent 与控制协议源码；in-toto/SLSA v1 声明将三个生成制品绑定到完整 Git 提交和构建者身份。安装器把签名元数据与运行时共同保存，并在仅 root 可读的状态清单中记录摘要。

systemd 单元使用专用 `ct-aicomm-agent` 账户运行，仅保留 `CAP_BPF`、`CAP_NET_ADMIN` 和 `CAP_PERFMON`。命名空间、设备、内核模块、控制组、时钟、进程、地址族、系统调用和文件系统均受限制。`upgrade.sh` 只接受另一个已验证发布包，在健康检查通过前保留上一签名版本，任何失败都会恢复旧版本。

未签名开发模式只允许用于测试的替代根目录，明确禁止用于 `/`。GitHub Actions 依赖按周检查更新；供应链工作流验证合法签名可安装、篡改制品被拒绝、安装生命周期和升级回滚边界。
