# 发布候选最终复现记录

日期：2026-10-13（Asia/Shanghai）。本轮完成新候选的一次真实闭环；未创建仓库、push、merge 或改动原 Docker Desktop 演示环境。

## 基线与范围

R2 ZIP SHA-256：`e77183b4bfabed990fb45ec12a0fa5dd25e47093a2beeaa9481333784d903be7`。213 个受保护文件与 R2 字节一致，见 [源码匹配](release-evidence/r2-source-match.json)。未改业务、Judge、UNS、Flow、前端、Dockerfile、Compose 或依赖。

目标：open supOS Community Edition V1.5.0.0-M，部署 commit `a36787c81d6c2848bb6dc89d649643f0b0119023`；Ubuntu 24.04、linux/amd64、Docker Engine 29.1.3、Compose 2.40.3。主机 CLI Node 24.20.0；官方基础镜像 Node 24.21.0。

使用此前独立建立的 Ubuntu Engine 平台，复用其中已验证的八条 Flow 和五个 UNS 文件，不重新安装平台或覆盖模型。App 是新项目 `fulfillment-sentinel-public-rc1`，新镜像 `fulfillment-sentinel-open-supos:public-rc1`，回环端口 13415。Docker Engine ID 经人工核对；未输出认证值。原演示平台完全未写入。

## 网络定位与恢复

- 宿主机 Registry 直连返回 401（正常鉴权挑战），Auth 直连重测返回 200；首次 Auth 曾超时，不能据一次失败认定全站故障。
- Engine 的 systemd 代理 TCP 连接超时；Registry/Auth 经该代理均无法连接。default BuildKit 使用 docker driver，metadata 解析继承 daemon 故障；没有证据证明独立的 BuildKit 或 Docker Hub 全站故障。
- **未修改全局代理、未重启 daemon。** 不宣称该代理已修复。
- 官方 `docker.io/library/node:24-bookworm-slim` 原引用 digest：`sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`。经 Docker Hub 直连核对 amd64 manifest、config 和架构，再逐个 SHA-256 校验 containerd 中已有的五个基础层。
- 将这些**官方基础层**重构为 Docker image archive 并 `docker load`，恢复本地 Node tag。没有使用旧 App 的层当基础镜像。Docker load 转换 manifest 格式产生不同的本地 manifest digest；config digest 和五个 rootfs diff ID 与官方完全相同，不能把转换后的 digest冒充官方 registry digest。
- 随后使用原 Dockerfile 正常 build，实际执行 `npm run build` 和 `npm run demo:judge`；npm ci 层使用已有 Docker 缓存，之前候选根目录 npm ci 也实际通过。没有跳过 build。

证据：[网络分层](release-evidence/final-network.json)、[基础镜像身份](release-evidence/final-official-base-loaded.json)、[构建与 HTTP](release-evidence/final-build.json)。未缓存镜像的第三方仍需正常 Docker Hub/npm 网络；本源码 ZIP 不是离线镜像包。恢复过程见 [网络恢复说明](network-recovery.md)。

## 实际命令

在发布候选源码根目录执行，CLI Node 已在 PATH：

```sh
export DEMO_COMPOSE_PROJECT=fulfillment-sentinel-public-rc1
export APP_PORT=13415 APP_BIND_ADDRESS=127.0.0.1
export APP_IMAGE=fulfillment-sentinel-open-supos:public-rc1
export SUPOS_DOCKER_NETWORK=supos_default_network
export J2_MQTT_URL=mqtt://emqx:1883
mkdir -p artifacts
docker compose -p "$DEMO_COMPOSE_PROJECT" -f docker-compose.yml -f deploy/compose.open-supos.yml config
docker compose -p "$DEMO_COMPOSE_PROJECT" -f docker-compose.yml -f deploy/compose.open-supos.yml build app
docker compose -p "$DEMO_COMPOSE_PROJECT" -f docker-compose.yml -f deploy/compose.open-supos.yml up -d --no-deps app
curl -fsS http://127.0.0.1:13415/api/health
node scripts/demo-delivery.mjs preflight
# 按 JUDGE_QUICK_START 人工核对并填写 DEMO_EXPECT_* / DEMO_ACTION_ACK
node scripts/demo-delivery.mjs prepare
node scripts/demo-delivery.mjs verify
node scripts/demo-delivery.mjs preflight
curl -fsS -H 'Content-Type: application/json' -d '{"caseId":"SO-IND-001"}' http://127.0.0.1:13415/api/copilot/brief
```

上轮候选根目录 npm ci/build/demo:judge/config 成功；本轮 Docker 内 build 与 Judge 再次实际执行。缓存命中仅说明 Docker 复用对应层，不声称重新联网安装。

## 新候选真实结果

| 检查 | 本轮结果 | 实际证据 |
| --- | --- | --- |
| Docker 原文件构建 | PASS | 新 public-rc1 镜像导出；build 与 Judge 实际执行 |
| 启动 / 健康 | PASS | `/api/health` HTTP 200，`ok:true` |
| 初始只读 Preflight | PASS | 平台、App、MQTT、八 Flow、五 UNS 均 PASS；新 App 案例尚未初始化 |
| 授权 Prepare | PASS | 发布 8 条模拟 RAW；CONFLICT 100/96/96/100；水位 07:00Z |
| 人工方案确认接口 | PASS | WAITING_FOR_EXECUTION_VERIFICATION；WMS 仍100 |
| 新 WMS96 真实链路 | PASS | RAW 经 EMQX、已部署 Node-RED 到 canonical，观察到新 WMS canonical event |
| 自动重新验证 | PASS | REVALIDATED_CLOSED 100/96/96/96；水位08:00Z |
| 平台原生 UNS 当前值 | PASS | ERP100，WMS96，客户剩余需求4 |
| AI 不可用 | PASS | 未配密钥，AI_NOT_CONFIGURED；不阻断此前完整主链；未调用模型 |
| 三条页面路由 | PASS | `/`、`/runtime`、`/validation` 均 HTTP200；浏览器打开实际 CLOSED 工作台，ERP100/当前96/剩余4可见 |

脱敏实际响应：[Preflight](release-evidence/final-preflight-initial.json)、[Prepare](release-evidence/final-prepare.json)、[Verify](release-evidence/final-verify.json)、[Closed](release-evidence/final-preflight-closed.json)、[AI](release-evidence/final-ai-unavailable.json)。原始日志在候选外保存，公开响应仅移除本机绝对路径、Engine/container标识。

本轮一次闭环不是重跑 R2 三轮。没有本轮浏览器刷新或服务重启验收，不借用历史结果；R2 2026-10-08 重启/三轮记录仅为历史事实。没有修改全局代理、平台配置、原 Volume 或原演示服务。

## 结论与停止边界

```text
COMPOSE_REPRODUCTION_PASS=true
GITHUB_RELEASE_CANDIDATE_READY=true
GITHUB_PUBLICATION_COMPLETE=false
```

实际模拟工业数据通过真实平台服务链路；不宣称真实工厂、TSDB 历史、生产安全或原生 App Manager 安装。可以申请 Owner 批准公开本干净源码候选，尚未公开任何仓库。
