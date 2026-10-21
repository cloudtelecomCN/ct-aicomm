# 贡献者测试环境

[English](test-environment.md)

公开贡献者测试环境用于在不需要凭据、私有基础设施、GPU 节点或生产端点的情况下复跑 CT-AIComm 契约验证。它只使用 Node.js 内置模块和仓库内夹具，因此无需安装第三方依赖。

## 环境要求

- Node.js 22 或更高版本；公开 CI 使用 Node.js 24。
- 只有运行完整仓库测试时才需要 Git。
- Docker 为可选项。

## 本地运行

```sh
npm test
```

可用测试档位：

```sh
npm run test:contracts
npm run test:scenarios
npm run test:full
node scripts/run-contributor-tests.mjs --list
```

运行器只向子进程传递少量允许的环境变量，丢弃凭据和部署变量，并预加载外网阻断器。本机回环地址仍可用于本地夹具；所有非回环 DNS、HTTP、HTTPS、TCP 和 TLS 请求都会在建立连接前失败。

## 容器运行

```sh
docker build -f containers/contributor/Dockerfile -t ct-aicomm-contributor .
docker run --rm --network none --read-only --tmpfs /tmp ct-aicomm-contributor --profile all
```

镜像不安装仓库依赖，并以非特权 `node` 用户运行。上述运行参数在进程内阻断器之外增加第二层网络边界。

## 证据边界

所有内置场景都使用合成夹具。测试通过只证明公开契约、示例和已声明的安全边界在仓库内一致，不属于生产实测证据，也不能用于性能声明。真实 POC 证据仍须经过环境冻结、来源、隐私和独立审核门禁。

机器可读环境契约见 [`specs/contributor/test-environment-v1.json`](../../specs/contributor/test-environment-v1.json)。
