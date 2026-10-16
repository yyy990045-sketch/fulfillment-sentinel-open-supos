# Docker Compose 评审路径实测

日期：2026-10-08。输入为隔离的模拟工业事件，不是真实工厂数据。目标环境是正在运行的 open supOS Docker Compose 实例；没有重建、迁移或重置平台服务。

## 已执行

- 从当前发行源码独立构建应用镜像，并以 `fulfillment-sentinel-review` Compose 项目启动 App。应用加入现有 supOS 网络，HTTP 健康接口返回 200。
- 向 `/source/j2/*` 演示 topic 发布 `deploy/demo-seed.json` 中四条事实和四条来源进度。App 从 canonical topic 观察到 ERP 100、MES 96、QMS 96、WMS 100；业务关联为 `RESOLVED`，共同水位为 `2026-03-01T07:00:00Z`，结果为 `FULFILLMENT_STATE_CONFLICT`。
- 确认内部处置后，状态为 `WAITING_FOR_EXECUTION_VERIFICATION`，WMS 仍为 100。
- 模拟仓库发布新 RAW WMS96 和来源进度后，App 观察到 ERP 100、MES 96、QMS 96、WMS 96，共同水位 `2026-03-01T08:00:00Z`，状态为 `REVALIDATED_CLOSED`。事件记录保留旧 WMS100 与新 WMS96。
- 单独构建 `Dockerfile.supos` 镜像并在 `/apps/yyy990045-sketch-fulfillment-sentinel/` 前缀下打开页面、`runtime` 子路由及健康接口。

## 验证边界

这证明当前代码在现有标准 Compose 版 open supOS 的 EMQX、Node-RED、canonical topic 和独立 App 容器之间跑通模拟数据闭环。Node-RED J2 Flow 已存在于该实例；**全新评审环境仍须按 DEPLOYMENT.md 导入并配置 Flow**，本轮没有在全新 Ubuntu 上冷安装平台。

`deploy/supos-app/` 的元数据参照官方部署仓库现有应用示例；本轮没有在 open supOS 应用管理 UI 导入、安装或发布。因此应用管理兼容性仍为未验证。AI 服务为可选配置，本轮 Compose 复现没有调用模型；历史 live AI 记录不等于新环境自动可用。

应用演示接口没有生产鉴权，不应直接暴露公网。当前主会话不支持 MQTT 用户名/密码；目标 broker 有鉴权时需另行适配，不能关闭平台安全策略来通过演示。
