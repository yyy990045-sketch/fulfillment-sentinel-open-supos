# Fulfillment Sentinel / 履约哨兵

面向制造业跨系统履约冲突的工业 App，基于 **open supOS UNS** 关联 ERP、MES、QMS、WMS 的业务事实，提供确定性判断、人工处置、来源更新后的重新验证，以及受事实约束的 AI 协同说明。

用于 2026 上海开源软件应用创新大赛 open supOS 工业 App 开发方向。项目仓库：[https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos](https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos)。

**版本范围：** 本分支是 2026-10-16 可见闭环展示修订版，以 2026-10-13 已验收 Docker Compose 候选为基础，改进工作台依据与执行对照、事件回放和验证场景交互。已重新构建并完成隔离平台真实闭环与浏览器检查，见[本次修订验收](docs/visible-workflow-validation.md)。服务端业务代码、Judge、UNS、Flow、Docker 部署和依赖保持不变；不包含后续本地 M1 Stage A / Stage B 的可信来源及单实例持久化增强。

**主案例：** 客户要 100 件，生产完成 96 件、质量放行 96 件，仓库计划执行 100 件。系统识别超出可放行数量的 **4 件**。
人工确认内部按 96 件处置，**不改变仓库事实**；只有新 WMS96 来源事件经过 open supOS 并通过重新验证，内部冲突才能关闭。客户订单仍为 100 件，剩余 4 件需求保留。

[评委快速部署](JUDGE_QUICK_START.md) · [部署与恢复](DEPLOYMENT.md) · [验收证据](docs/release-validation.md) · [发布审计](PUBLIC_RELEASE_AUDIT.md)

## 01. 项目概览 / Project Overview

产品包含三个空间：履约工作台、open supOS 运行、验证中心。工作台负责处置；运行空间显示数据流、UNS 实例和 Source Flow；验证中心展示来源缺失、身份错误、冲突与复核关闭。
技术栈：React 19、TypeScript、Tailwind CSS、shadcn/ui 源码组件、lucide-react、Motion、Three.js；服务端为 Node.js、MQTT 与确定性 Judge。主要演示尺寸 Desktop 1440×900。

## 02. 工业问题 / Industrial Problem

单个系统的记录可能各自正确，但不代表同一订单可以按仓库计划执行。判断前必须确认业务身份、来源完整性和共同时间范围，不能只比较四个数字，不能用审批代替来源更新。

## 03. 核心能力 / Core Capabilities

- 八条来源处理路径：四条事实、四条进度，随包提供 RAW → canonical 映射。
- 五个 UNS 模型、订单/生产/质量/发运引用关系、四源共同水位。
- 确定性判断、内部方案确认、等待来源执行、重新验证。
- AI 解释与销售/生产/质量/仓库协同；依据可查，AI 不持有关闭权。
- 只读 Preflight、安全 Demo Prepare、真实平台 Demo Verify 和重启恢复说明。

## 04. 系统架构 / System Architecture

```text
模拟 ERP / MES / QMS / WMS → RAW MQTT /source/j2/*
→ open supOS EMQX → Node-RED 规范化 → UNS canonical /supos/J2_*
→ Sentinel Runtime / lineage / 时间覆盖 → 确定性 Judge
→ 人工确认 → 等待来源执行 → Revalidation
                   ↘ AI 协同说明（可选，不改变事实）
```

完整职责见 [ARCHITECTURE](docs/ARCHITECTURE.md)。前端动画是已观测事件回放，不是网络延时测量或独立关闭机制。

## 05. open supOS 接入 / Integration

已验证目标：**Community Edition V1.5.0.0-M**，官方部署 commit `a36787c81d6c2848bb6dc89d649643f0b0119023`，Ubuntu 24.04 / linux/amd64 / Docker Compose。
App Compose 不安装整套平台。八条 Node-RED 路径需**人工导入并 Deploy**；五个 UNS 文件用 [provision-uns.mjs](deploy/provision-uns.mjs) 在干净隔离平台初始化一次。
配置见 [Compose overlay](deploy/compose.open-supos.yml)、[环境变量模板](.env.example)、[UNS 初始化](docs/UNS-BOOTSTRAP.md)。

## 06. UNS 数据模型 / Data Models

| canonical 模型 | 来源 | 主要事实 |
| --- | --- | --- |
| J2_ERP_OrderLine | ERP | requiredQty、订单行、交期 |
| J2_MES_Production | MES | completedQty、工单、生产批次 |
| J2_QMS_Quality | QMS | releasedQty、质量记录、生产批次引用 |
| J2_WMS_Shipment | WMS | executionCommittedQty、发运行、原订单行引用 |
| J2_SourceProgress | 四源分别报告 | sourceProgressAt、sourceSystem |

MES 订单行回指 ERP，QMS 批次回指 MES，WMS 发运行回指 ERP，不错误串联为质量批次下级。
视图的 OrderLine / ProductionOrder / ProductionLot / QualityLot / ShipmentLine 不是这五个 canonical 文件的一一对应；详见 [UNS 与 lineage](docs/UNS.md)。

## 07. 判断与复核 / Decision and Revalidation

```text
CONFLICT 100 / 96 / 96 / 100
→ 人工确认内部 96 件方案
WAITING  100 / 96 / 96 / 100（审批不改 WMS）
→ WMS96 RAW → EMQX → Node-RED → canonical / UNS
CLOSED   100 / 96 / 96 / 96（ERP100 和剩余需求4保留）
```

共同水位为四源 sourceProgressAt 的最小值，须覆盖交期 **+1 小时**；事实时间、接收时间与来源进度分开。来源未齐或身份错误时停止数量判断。
已授权且新事实与时间条件成立后，服务器自动复核；不是页面或 AI 关闭。规则见 [Judge Contract](docs/judge-contract.md)。

## 08. AI 边界 / AI Copilot Boundaries

`POST /api/copilot/brief` 接收 `{caseId}`，由服务器 ProductView 构建上下文，输出经过 schema、证据、数量与阶段 guard。
AI 不写来源系统、不审批、不决定事实、不自动关闭。未配置、请求失败或 guard 拒绝时，主链照常运行，前端明确使用 `source="demo"`，不能称 live AI。
密钥仅放服务器环境；配置见 [AI-COPILOT](docs/AI-COPILOT.md)。本轮复现不调用付费模型。

## 09. 快速开始 / Quick Start

需要 Node.js ≥22.5（主机 CLI 24.20.0；Docker 官方基础镜像 24.21.0）、npm、联网获取依赖及支持 WebGL 的桌面浏览器。在源码根目录：

```sh
npm ci
npm run build
npm run demo:judge
HOST=127.0.0.1 npm start
```

访问 `http://127.0.0.1:3410/`。无 Runtime 的 seeded 展示不是完整平台闭环；SO-IND-001 的处置需要 MQTT，002–004 与验证实验为独立 seeded 场景。
获取本仓库后执行上述命令：

```sh
git clone https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos.git
cd fulfillment-sentinel-open-supos
```

完整平台链路请继续按下面的 Docker Compose 指南部署；本地 seeded 展示不能替代平台验收。

## 10. Docker Compose 部署 / Deployment

按 [JUDGE_QUICK_START](JUDGE_QUICK_START.md) 十步执行：环境 → 官方平台 → 人工 Flow → 五模型 → App → Preflight → 授权 Prepare → Verify → 浏览器 → 停止/恢复。
项目名、端口、网络和平台数据目录必须隔离。App 默认绑定回环；首次拉取平台/Node 镜像和 npm 依赖需网络，不是全离线包。
新平台至少 4 vCPU/8 GiB，建议 16 GiB。配置限制见 [DEPLOYMENT](DEPLOYMENT.md)。

## 11. 演示验证 / Demo Verification

在已按快速指南启动的隔离环境、源码根目录：

```sh
npm run demo:preflight
# 按指南核对并显式设置 DEMO_EXPECT_* / DEMO_ACTION_ACK
npm run demo:prepare
npm run demo:verify
```

Preflight 不播种、不发布业务事件、不改 Flow/UNS、不重启。Prepare 授权后 reset 本 App 内存并发布 8 条模拟 RAW，已有案例需另授权重置。
Verify 走实际业务接口与平台当前值查询，报告写入 `artifacts/demo-verify-*.json`。再次演示和重启后需显式 Prepare；详见 [DEMO](docs/DEMO.md)。

## 12. 验收证据 / Test Evidence

本候选 2026-10-13 已用原 Dockerfile 构建新 App，并完成一次实际平台闭环：CONFLICT → 人工确认（WMS100不变）→ 新 WMS96 RAW/canonical → REVALIDATED_CLOSED。平台 UNS 当前 ERP100/WMS96，剩余需求4。COMPOSE_REPRODUCTION_PASS=true，GITHUB_RELEASE_CANDIDATE_READY=true；这是本轮新证据，不借用 R2 历史 PASS。

隔离 Engine 既有代理仍未修改。本轮经官方 digest核验后加载已缓存 Node linux/amd64 基础层，再正常构建（非旧 App镜像）；未缓存环境仍需联网。详见 [网络恢复](docs/network-recovery.md)。

本候选从校验通过的 R2 ZIP 提取，复现结果见 [release-validation](docs/release-validation.md)。本地 Judge A–E 与真实平台闭环分开，不以 build 代替 Runtime 验收。

```text
SIMULATED_INDUSTRIAL_DATA=true
REAL_FACTORY_DATA=false
COMPOSE_STANDARD_INSTALL_PASS=true
COMPOSE_END_TO_END_PASS=true
COMPOSE_REPRODUCTION_PASS=true
GITHUB_RELEASE_CANDIDATE_READY=true
OPEN_SUPOS_TSDB_HISTORY_PERSISTENCE_VERIFIED=false
APP_MANAGER_NATIVE_INSTALL_PASS=false
SOURCE_BASELINE=PUBLIC_CANDIDATE_20261013
LATEST_STAGE_B_INCLUDED=false
```

`tests/copilot-ai.test.ts` 是保留的 Vitest 测试源码；R2 未包含 Vitest 或 npm test，本轮不新增框架，不声称该测试已执行。可运行入口为 demo:judge、demo:preflight、demo:prepare、demo:verify。
Judge CLI 的历史提示 `npm run evidence:verify` 不在本发行脚本中，请用上述现有入口。

## 13. 已知限制 / Known Limitations

- live 主会话固定 SO-IND-001，App 重启后内存案例丢失，需明确重新播种。
- live MQTT 不支持用户名/密码（CLI verifier 支持），不要关闭目标 Broker 鉴权来过验收。
- UNS 当前值已核验；模型 persistence:false，TSDB 历史未验证。
- deploy/supos-app 和 Dockerfile.supos 是 v4alpha1 候选材料，不代表原生安装、启用、发布通过。
- 演示写接口仅有浏览器 Origin 检查、无生产鉴权，不得暴露公网或连接生产 Broker。见 [SECURITY](SECURITY.md)。
- 不宣称真实工厂、客户接受短发、商业 ROI、任意版本兼容或每次 live AI 必然成功。

## 14. 路线图 / Roadmap

来源适配、多案例、生产鉴权和持久化为后续方向，不是已交付能力；见 [ROADMAP](ROADMAP.md)。

## 15. 贡献 / Contributing

见 [CONTRIBUTING](CONTRIBUTING.md)、[OPEN_SOURCE_GOVERNANCE](OPEN_SOURCE_GOVERNANCE.md)。公开发布需 Owner 授权，采用干净新历史，不公开旧私有仓库、不混城市配送项目。
保留 R2 真实目录 frontend/、src/、deploy/、docs/、scripts/、tests/、third_party/，不重构业务。

## 16. 许可 / License

本项目采用 Apache License 2.0 开源。正文见 [LICENSE](LICENSE)，第三方组件保留原许可、归属与 NOTICE，见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)、[依赖清单](docs/dependency-licenses.json)。不将本项目许可覆盖到平台镜像整体。
