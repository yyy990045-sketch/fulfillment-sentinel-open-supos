# 评委快速部署与验收 · Docker Compose

本流程只针对 open supOS Community Edition `V1.5.0.0-M`、官方部署仓库 commit `a36787c81d6c2848bb6dc89d649643f0b0119023`，Ubuntu 24.04 / `linux/amd64`。工业数据来自随包模拟事件，平台 EMQX、Node-RED、UNS 当前值和履约哨兵是实际运行的服务。至少 4 vCPU、8 GiB；建议 16 GiB。需要 Docker Engine、Compose v2、Node.js ≥22.5、npm 和可联网拉取容器镜像与 npm 依赖的网络。

## 00 获取项目

本仓库对应 2026-10-13 已验收 Compose 候选，不包含后续本地 Stage B。执行：

```sh
git clone https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos.git
cd fulfillment-sentinel-open-supos
```

也可下载仓库源码 ZIP，解压后进入含 package.json 的目录；不要从历史开发仓库覆盖此版本。

以下为 Ubuntu/Linux Shell 命令，Node.js/npm 需已安装，使用 `node --version` 和 `npm --version` 确认版本。平台安装和应用源码目录不同，操作前确认工作目录。

## 01 环境要求

使用**独立 Docker Engine**，不要与已有演示或生产平台共用容器、网络、数据库、Volume、Keycloak 或端口。先读出 `docker info --format '{{.ID}}'`，确认它是要使用的隔离 Engine。宿主机下列示例端口可按实际空闲值更换：平台 18088、MQTT 11883、应用 13410。不要把业务操作接口直接暴露到公网。

## 02 安装 open supOS

```sh
git clone https://gitee.com/supos-community-edition/supos-ce-deploy.git
cd supos-ce-deploy
git checkout a36787c81d6c2848bb6dc89d649643f0b0119023
```

编辑官方仓库自带 `.env`：选择 `OS_RESOURCE_SPEC=1`（4C8G），将 `VOLUMES_PATH` 指向**本隔离 Engine** 的独立数据目录，并设定空闲的 `ENTRANCE_PORT`、`OS_MQTT_TCP_PORT` 及 `ENTRANCE_DOMAIN`。本机评审可用 `127.0.0.1`；按官方安装流程交互选择所需 profiles（本次仅九个核心服务），不要默认增加可选服务。需要远程访问时按官方说明配置网络与访问控制。执行：

```sh
bash bin/doctor.sh
bash bin/install.sh
docker compose -f docker-compose-4c8g.yml ps
```

应看到 backend、nginx、nodered、emqx、postgresql、tsdb、keycloak、portainer、chat2db 九个核心服务。记下实际 Docker 网络名（`docker network ls`）。

## 03 人工导入 Node-RED Flow

使用本仓库的全新 clone 或源码解压目录，在源码根目录找到 `deploy/nodered-j2-flow.json`。登录**隔离平台**的 Node-RED Editor，Import 到空白 Flow，检查 broker 为该平台内部 `emqx:1883` 或其实际地址，确认 `/source/j2/*` 与 `/supos/J2_*` 未被其他业务使用，只 Deploy 新导入节点。它有 8 个 MQTT 输入、8 个函数和 8 个 MQTT 输出。**导入是人工步骤，脚本不会自动部署 Flow。** 标签名称可仍为“流程 1”，不能只凭标签或容器 Running 判断八条路径可用。当前 Preflight 按 broker `emqx:1883` 核验，使用其他地址时不能直接宣称 `FLOW_READY=PASS`。

## 04 初始化五个 UNS 模型

仅在新建、未承载其他业务文件的隔离平台运行一次。以下在发布候选源码根目录执行；`SUPOS_DOCKER_NETWORK` 必须换成第 02 步实际平台网络名。

```sh
export SUPOS_DOCKER_NETWORK=supos_default_network
docker run --rm --network "$SUPOS_DOCKER_NETWORK" \
  -v "$PWD/deploy:/work:ro" node:24-bookworm-slim node /work/provision-uns.mjs
```

脚本通过当前版本原生 OpenAPI 创建 `/supos/` 和五个时序型文件。既有文件需人工核对，不要重复运行创建命令；字段见 [UNS 清单](docs/UNS-BOOTSTRAP.md)。此步骤不证明 TSDB 历史持久化。

## 05 构建并启动履约哨兵

仍在发布候选源码根目录。项目名、端口和网络必须与其他应用隔离；AI 密钥可留空。

```sh
export DEMO_COMPOSE_PROJECT=fulfillment-sentinel-review-r2
export APP_PORT=13410 APP_BIND_ADDRESS=127.0.0.1
export APP_IMAGE=fulfillment-sentinel-open-supos:r2
export SUPOS_DOCKER_NETWORK=supos_default_network
export J2_MQTT_URL=mqtt://emqx:1883
mkdir -p artifacts
docker compose -p "$DEMO_COMPOSE_PROJECT" -f docker-compose.yml -f deploy/compose.open-supos.yml config
docker compose -p "$DEMO_COMPOSE_PROJECT" -f docker-compose.yml -f deploy/compose.open-supos.yml build app
docker compose -p "$DEMO_COMPOSE_PROJECT" -f docker-compose.yml -f deploy/compose.open-supos.yml up -d --no-deps app
```

容器内 `backend:8080` 与 `nodered:1880` 是该平台默认服务地址。若不同，设置 `SUPOS_BOOTSTRAP_API` 和 `DEMO_NODERED_URL` 后重新创建本应用容器。应用默认只绑定宿主机回环。当前主演示会话的 MQTT 连接不支持账号密码；需要鉴权的目标平台不能直接宣称完整主链通过。

## 06 只读预检

```sh
npm run demo:preflight
```

输出 Docker Engine ID、Compose 项目、平台地址、MQTT 地址、应用端口以及七项状态。`FLOW_READY=PASS` 要求 Node-RED **已部署图**中八条输入→函数→输出与随包规则一致；业务消息真实到达要由第 08 步证明。若 Admin GET 不可读，输出 `NOT_VERIFIED`，不能把容器 Running 当作通过。播种前 `CASE_READY=NOT_INITIALIZED` 是预期状态；AI 未配置为 `AI_OPTIONAL=WARN`，不阻断确定性主链。

## 07 明确目标后准备演示

**人工核对**第 06 步输出确实属于隔离 Engine，再把显示值逐一填入下列变量，不要用命令自动抄写当前 Engine ID。以下尖括号是占位符：

```sh
export DEMO_EXPECT_DOCKER_ID='<预检输出的 Docker Engine ID>'
export DEMO_EXPECT_COMPOSE_PROJECT="$DEMO_COMPOSE_PROJECT"
export DEMO_EXPECT_PLATFORM_URL='http://backend:8080'
export DEMO_EXPECT_MQTT_URL='mqtt://emqx:1883'
export DEMO_EXPECT_APP_PORT="$APP_PORT"
export DEMO_ACTION_ACK="$DEMO_EXPECT_DOCKER_ID/$DEMO_COMPOSE_PROJECT"
npm run demo:prepare
```

若预检显示案例已存在，命令会停下。确认可以重置**该隔离 App 的内存案例**后，显式设置 `DEMO_ALLOW_EXISTING_CASE_RESET=YES` 再执行。`prepare` 使用已存在的内存重置接口，随后发布包内 8 条模拟 RAW，并核对 `100/96/96/100`、`FULFILLMENT_STATE_CONFLICT`、四源 07:00Z 进度及平台 UNS 当前值。它不会在页面访问、刷新或容器启动时自动运行。

## 08 自动验证完整闭环

```sh
npm run demo:verify
```

验证先检查初始冲突，再通过应用业务接口确认方案（WMS 仍为 100），调用现有模拟仓库执行业务接口发布 WMS96 RAW，核对新 canonical 事件、`REVALIDATED_CLOSED`、ERP100/WMS96、客户剩余 4 件，以及平台原生 UNS 当前值。结果写到 `artifacts/demo-verify-*.json`；日志不含凭据。再次演示须先重新运行第 07 步，不能重复发送旧事件冒充重置。

## 09 浏览器访问产品

打开 `http://127.0.0.1:$APP_PORT/`（将变量替换成实际端口），查看履约工作台、open supOS 运行和验证中心。顶部“模拟演示”说明工业来源不是工厂真实数据。AI 未配置时可用演示协同内容，但不能称作 live AI。UNS **当前值**可验证本次数据到达，不等于 TSDB 历史持久化。

## 10 停止与回滚

```sh
docker compose -p "$DEMO_COMPOSE_PROJECT" -f docker-compose.yml -f deploy/compose.open-supos.yml stop app
docker compose -p "$DEMO_COMPOSE_PROJECT" -f docker-compose.yml -f deploy/compose.open-supos.yml start app
```

应用重启后健康接口恢复，但 live 案例状态只在内存中：`product-view` 在重新播种前返回 503；再次确认目标后执行第 07 步恢复 CONFLICT。不要使用 `down -v`、`prune`，也不要停原演示平台。若预检失败，先核对网络/端口、Node-RED 部署图、UNS 五文件和平台连接；若 Docker Hub 临时拉取失败，保留错误并重试相同构建命令，不做未记录补丁。
