# Agent 安装与运维手册

本 CT-531 手册适用于 Ubuntu 22.04 或满足公开安全边界的 Linux 主机上的 CT-AIComm Agent 签名发布包。生产操作必须由具名操作员从可信控制台以 root 执行。发布签名私钥、控制面凭据、端点清单以及含客户数据的诊断输出不得进入公开仓库。

## 安装

1. 将 `ct-aicomm-agent-release.tar.gz` 及其单独发布的 SHA-256 摘要传入主机。
2. 通过第二可信渠道比对压缩包摘要。
3. 解压并检查 `share/SHA256SUMS`、Ed25519 签名、SBOM 和来源证明。
4. 执行预检、安装、配置和诊断：

```bash
tar -xzf ct-aicomm-agent-release.tar.gz
cd ct-aicomm-agent-release
sudo install/preflight.sh
sudo install/install-package.sh --no-start
sudoedit /etc/ct-aicomm-agent/agent.env
sudo systemctl enable --now ct-aicomm-agent.service
sudo install/diagnose.sh
```

首次必须使用 `CT_AGENT_MODE=observe_only`。只有在 Agent 身份、控制端点、已批准选择器策略、回滚状态和维护窗口均确认后，才能进入执行模式。

systemd 单元会先通过特权 `ExecStartPre` 仅向 Agent 专用组授予 bpffs 根目录的穿越权限，并创建 `/sys/fs/bpf/ct-aicomm-agent`，然后再降权到专用服务账号。bpffs 根目录仍只允许 root 读写，Agent 只能写入自己的受限 pin 命名空间。如果该命名空间准备失败，必须将其视为安装失败；不得改为 root 身份长期运行服务。

## 升级

验证完成前保留上一版本压缩包。升级器先验证新签名包并保留当前安装，重启服务并检查健康；失败时自动恢复上一签名版本。

```bash
cd new-ct-aicomm-agent-release
sudo install/upgrade-package.sh
sudo install/diagnose.sh
```

不得绕过签名、摘要、预检或健康检查失败。旧发布包和 `/var/lib/ct-aicomm-agent/install.manifest` 应随故障记录保留。

## 诊断

`diagnose.sh` 检查托管文件、安装摘要、专用服务用户、systemd 状态和 bpffs，不打印配置值或凭据。操作员还应在受控环境检查：

```bash
sudo journalctl -u ct-aicomm-agent.service --since -30min
sudo systemctl status ct-aicomm-agent.service
sudo bpftool prog show
sudo bpftool map show
```

对外提供日志前必须移除主机名、地址、令牌、拓扑、模型路径、Map 键和客户标识。

## 紧急恢复

破窗命令会停止自动执行、请求恢复已确认基线、禁用服务，并记录操作员与原因；它不会自动恢复执行模式。

```bash
sudo install/emergency-recover.sh --actor operator-id --reason incident-ticket-id
sudo install/diagnose.sh
```

若命令失败，应隔离主机与控制面、保留 `/var/lib/ct-aicomm-agent`，按平台变更流程恢复获批网络基线并升级处理。在路由状态被独立确认前，不得使用 `uninstall.sh --force`。

## 卸载

正常卸载先恢复路由并保留配置。只有满足证据与配置留存要求后才能彻底清除。

```bash
sudo install/uninstall.sh
sudo install/uninstall.sh --purge
```

## 验收记录

应记录压缩包 SHA-256、发布清单 SHA-256、Agent 身份、主机指纹、操作员、时间、预检与诊断结果、回滚就绪状态、最终服务状态和全部例外。安装成功不等于已证明生产可用性或性能。
