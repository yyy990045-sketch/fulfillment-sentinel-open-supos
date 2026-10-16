# 部署与恢复

## 要求

Node.js ≥22.5（使用 node:sqlite）；npm；支持 WebGL 的桌面浏览器。Docker Engine + Compose v2 为可选路径。
真实主案例另需 open supOS、EMQX MQTT、Node-RED 与相应 UNS 模型；应用不内嵌平台安装包。
已验证平台部署仓库：supos-community-edition/supos-ce-deploy，commit a36787c81d6c2848bb6dc89d649643f0b0119023；EMQX 实际 5.8.4，Node-RED 4.0.8 的 supOS 镜像。按其当前官方 README/bin/install.sh 部署到自己选定的数据盘或 Ubuntu 主机，保护现有容器与持久化。

已观察 open supOS backend 镜像 tag 为 26082608；它是镜像标签，不推定为平台语义版本。源码发行包不依赖开发机现有容器或镜像缓存。

## 本地展示

在发行根目录执行：

```sh
npm install
npm run build
npm run demo:judge
npm run demo
```

访问 localhost:3410。构建后也可 npm start。停止本地进程 Ctrl+C；重新运行原启动命令即可。
Node 不自动读取 .env：用当前 shell 环境变量或 node --env-file=.env dist/src/public/server.js；不要在聊天/日志打印配置值。
无真实 Runtime：四个 seeded 案例、模型画布、Source Flow、验证实验和 demo AI 可浏览。002–004 seeded 交互可演示；主案例的真实处置不可离线推进。demo:judge 生成本地 SQLite/manifest，不能冒充 canonical 实时会话。

## 接入自己的真实 Runtime

1. 建立隔离的演示命名空间与五模型，topics 见 docs/UNS.md；不要向生产业务 topics 发送演示数据。
2. Node-RED Editor 导入 deploy/nodered-j2-flow.json。它只含原 J2 的八条路径和一个脱敏 broker config，不含 smoke flow / 凭据 / 其他流程。
3. 修改导入的 broker 为部署环境实际 EMQX 地址/端口（例如容器网络内部 emqx:1883），确认没有节点 ID 冲突；Deploy 仅新导入 Flow，不覆盖现有 Flow。
4. 设置服务器 J2_MQTT_URL 为自己可达的 broker URL。CLI verifier 支持 J2_MQTT_USERNAME/PASSWORD；当前 Product session 未传递该两项。有鉴权 Runtime 不能据此宣称主应用可用，不要关闭现有 broker 鉴权。
5. 配置 AI_API_KEY、AI_MODEL，按需 AI_BASE_URL、AI_TIMEOUT_MS、AI_JSON_SCHEMA。未配置或 guard 拒绝使用 demo AI。
6. 启动应用，按 docs/DEMO.md 先建立 canonical 订阅再发布初始 RAW。现有服务状态在内存，重启需要重新 seed。

## Docker 应用

从 .env.example 复制本地 .env 并填写自己的配置；秘密文件保持 Git ignored。
docker-compose.yml 从环境读取 MQTT/AI 变量；MQTT URL 在容器中必须可达，localhost 指容器本身。

```sh
docker compose build
docker compose up -d
docker compose stop app
docker compose start app
docker compose restart app
```

仅应用项目，端口回环 3410；不要停止/删除其他项目容器，不使用 prune 或 down -v。
读 manifest 使用 J2_ARTIFACT_DIR（默认 ./artifacts，只读 bind），内存 live 会话不依赖它。无自定义 base image，不依赖开发机历史 overlay 镜像。
构建包含前端/后端与本地演示生成。镜像保留第三方许可副本。
若安装依赖/拉镜像网络不可用，保留原错误；本说明不把 Docker 全新构建当本轮已实测。

## 检查与恢复

GET /api/health 确认服务；GET /api/v2/demo/judge/manifest 确认本地演示；GET /api/v2/demo/fulfillment/product-view 确认真实来源（未就绪返回 503）。
在隔离 Runtime 上可运行 npm run open-supos:verify 和 npm run open-supos:verify:lineage-negative；它们会发布模拟 RAW 并写 ./artifacts，不是只读健康检查。
恢复到新 Ubuntu：安装 Node 或 Docker、解压干净发行包、配置自己的 open supOS/Flow/env、构建启动并重新 seed。凭据重新提供，不迁移开发机 WSL 或私人路径。
