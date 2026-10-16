# 部署与恢复

评委请先按 [JUDGE_QUICK_START.md](JUDGE_QUICK_START.md) 的 01–10 步执行。该流程对应 open supOS Community Edition `V1.5.0.0-M`、官方部署 commit `a36787c81d6c2848bb6dc89d649643f0b0119023`、Ubuntu 24.04 / `linux/amd64`。从发布候选源码根目录运行，不依赖开发机旧目录或镜像缓存；首次构建需要联网获取 Node 基础镜像与 npm 依赖。

## 两种运行形态

- **本地产品展示**：Node.js ≥22.5，`npm install && npm run build && npm run demo:judge && npm run demo`，打开 `http://localhost:3410/`。这一模式有 seeded 页面，不构成真实 open supOS 链路验收。
- **标准 Compose 评审**：独立 open supOS 平台 + 人工导入随包 Node-RED Flow + 原生 OpenAPI 创建五个 UNS 文件 + 独立 App Compose。`npm run demo:preflight` 只读，`npm run demo:prepare` 明确授权后播种，`npm run demo:verify` 通过实际应用业务接口与平台当前值核对完整闭环。

本项目 Compose 只部署履约哨兵 App，不包含整套 open supOS 安装包。`deploy/supos-app/` 是待验证的应用管理候选元数据，不能以 Compose 通过冒充平台原生应用安装或发布。

## 变量与连接

`.env.example` 列出变量名，实际值由评审在隔离主机的 Shell 设置；不要将带密钥的 `.env` 放入交付 ZIP。常用值为：

| 变量 | 作用 |
| --- | --- |
| `DEMO_COMPOSE_PROJECT` | 本应用独立 Compose 项目名，供三个 `demo:*` 命令定位容器 |
| `APP_PORT`, `APP_BIND_ADDRESS`, `APP_IMAGE` | 宿主机端口、监听地址和本地镜像标签 |
| `SUPOS_DOCKER_NETWORK` | 目标 open supOS Compose 网络实际名称 |
| `J2_MQTT_URL` | 应用容器可达的 EMQX 地址，通常 `mqtt://emqx:1883` |
| `SUPOS_BOOTSTRAP_API`, `DEMO_NODERED_URL` | 容器内平台与 Node-RED 地址，默认 `http://backend:8080`、`http://nodered:1880` |
| `DEMO_EXPECT_*`, `DEMO_ACTION_ACK` | 写操作前人工确认 Engine ID、项目、目标和端口；值来自预检输出 |
| `DEMO_ALLOW_EXISTING_CASE_RESET` | 已有案例时显式设置 `YES`，仅重置本 App 内存会话 |
| `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | 可选 AI；未配置仅 `WARN`，不阻断确定性业务流程 |

当前 live 产品会话不支持 MQTT username/password。若目标 Broker 强制鉴权，不要关闭鉴权来通过验收；报告当前目标不兼容。若 Node-RED Admin GET `/flows` 不开放，预检输出 `FLOW_READY=NOT_VERIFIED`，不会凭容器 Running 宣称八条路径已部署。

## 安全边界

`npm run demo:preflight` 只读：检查 Docker Compose 容器、HTTP 健康、平台 API、MQTT 连接、Node-RED 已部署图、五个 UNS 文件和当前值、案例状态及 AI 配置；不播种、不写 UNS、不发布业务事件、不重启容器。UNS 原生 `POST /open-api/uns/file/current/batchQuery/byPath` 是查询接口，不修改文件。

`npm run demo:prepare` 在授权后调用已有 `/reset`，只清空本 App 内存观测、处置与水位，再发布 8 条包内模拟 RAW 并核对冲突、四源进度及 UNS 当前值。直接运行 `deploy/seed-runtime.mjs` 也必须提供 `DEMO_RESET_AUTHORIZED=YES`；推荐只通过 `demo:prepare` 执行，因为它还核对目标 Engine/项目/网络/端口。重复旧事件不等于重置。

`npm run demo:verify` 要求初始状态为 100/96/96/100 的冲突案例；它通过正常业务接口确认内部 96 件方案，再通过现有模拟仓库执行接口向 RAW 发布 WMS96 与四源进度。由 EMQX、Node-RED 转换、UNS 当前值和服务器判定形成 `REVALIDATED_CLOSED`。报告保存事件 ID、来源时间、水位、HTTP、状态和平台值到 `artifacts/demo-verify-*.json`；不打印密钥。

## 重启与故障处理

仅操作本应用：

```sh
docker compose -p "$DEMO_COMPOSE_PROJECT" -f docker-compose.yml -f deploy/compose.open-supos.yml stop app
docker compose -p "$DEMO_COMPOSE_PROJECT" -f docker-compose.yml -f deploy/compose.open-supos.yml start app
npm run demo:preflight
```

App 健康接口应恢复 200；`product-view` 在重新播种前应返回 503，不是假 CLOSED。确认仍处于同一隔离 Engine 后重新 `npm run demo:prepare`。不增加数据库，也不宣称内存业务状态跨重启持久化。

常见失败：

- `APP_HEALTHY=FAIL`：核对 App 容器、端口绑定和启动日志。
- `MQTT_READY=FAIL`：核对隔离网络与 Broker 地址；不要改原平台鉴权。
- `FLOW_READY=FAIL/NOT_VERIFIED`：人工核对新导入 Flow、Broker、八条路径和 Node-RED Admin GET；Node-RED 容器 Running 不足以证明路径。
- `UNS_READY=FAIL`：核对五文件名称、字段与原生当前值 API；不要在已有业务平台重复创建。
- `CASE_READY=NOT_INITIALIZED`：完成目标确认后运行 `demo:prepare`。若播种结果不符，保留原始错误，不直接改内存、数据库或 Judge。
- `AI_OPTIONAL=WARN`：AI 未配置，确定性主链应仍可验证；演示 AI 不称 live。

模拟工业数据不代表真实工厂。UNS 当前值可证明本轮消息到达平台文件；创建参数 `persistence:false`，本轮仍未验证 TSDB 历史持久化。停止/回滚只停止 App，不执行 `down -v`、`prune`，不删除平台容器、镜像或 Volume。
