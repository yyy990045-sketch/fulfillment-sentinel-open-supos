# 独立 open supOS Compose 复现边界

R2 的唯一评委操作顺序和命令见根目录 [JUDGE_QUICK_START.md](../JUDGE_QUICK_START.md)。本文件记录 R1 独立环境中已确认的事实，避免把手工步骤或模拟数据写成自动、真实工厂数据。

## 平台版本与隔离

2026-10-08 使用 Ubuntu 24.04 独立 Docker Engine、open supOS Community Edition `V1.5.0.0-M`、官方部署仓库 commit `a36787c81d6c2848bb6dc89d649643f0b0119023` 和 4C8G Compose。九个核心服务为 backend、nginx、nodered、emqx、postgresql、tsdb、keycloak、portainer、chat2db。原 Docker Desktop 演示平台及 Volume 没有参与。新的评审环境必须自行配置独立平台数据根、网络、端口和凭据。

## 交付材料与手工环节

`deploy/nodered-j2-flow.json` 含八个 MQTT 输入、八个规范化函数和八个 MQTT 输出。评审必须**人工导入**隔离 Node-RED Editor，检查 broker/topic 后 Deploy；应用 Compose 不自动改 Flow。R1 中导入到原空白“流程 1”，标签未更名，Node-RED Admin GET `/flows` 返回 26 个已部署节点。R2 Preflight 对照随包函数代码及连接图进行只读核对，完整端到端转换由 Demo Verify 证实。

`deploy/provision-uns.mjs` 使用该版本原生 `/open-api/uns/folder` 与 `/open-api/uns/file` 建立五个时序型文件；字段见 [UNS-BOOTSTRAP.md](UNS-BOOTSTRAP.md)。它在干净平台运行一次，不是反复执行的播种脚本。当前值由原生 `/open-api/uns/file/current/batchQuery/byPath` 查询。文件创建参数 `persistence:false`；这份证明不覆盖 TSDB 历史持久化。

`deploy/demo-seed.json` 是 ERP100、MES96、QMS96、WMS100 和四源 07:00Z 进度共八条模拟 RAW。R2 的 `npm run demo:prepare` 先核对目标 Engine/项目/平台/Broker/端口和重置授权，再用现有内存重置接口和 `deploy/seed-runtime.mjs` 发布。R2 的 `npm run demo:verify` 通过应用正常业务接口完成确认、WMS96 来源更新及关闭，并从平台 UNS 读取 ERP100/WMS96。

## 重复运行与重启

每轮完整闭环后，下一轮必须重新显式运行 `demo:prepare`，不能把重复发布旧事件当成安全重置。应用容器重启后健康检查可恢复，但内存会话为空，`product-view` 在重新播种前返回 503；确认仍是隔离目标后重新 Prepare 恢复冲突。Node-RED Flow 和 UNS 文件属于隔离平台，App 重启不自动重建它们。

工业来源事实为 seeded 演示数据。实际链路经过隔离平台的 EMQX、Node-RED、UNS 当前值与履约哨兵。Compose 运行不等于 open supOS 应用管理原生安装；AI 未配置也不阻断确定性业务判断。
