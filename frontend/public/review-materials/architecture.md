# 当前架构

## 十二个实际边界

| 阶段 | 当前实现与职责 |
| --- | --- |
| Source Systems | 演示 ERP/MES/QMS/WMS 来源事实，不声称接入真实工厂 |
| RAW MQTT | /source/j2 的四条业务及四条进度路径；RAW 发布侧保留来源字段 |
| open supOS EMQX | 接收来源事件，提供 MQTT 传输；凭据由部署者管理 |
| Node-RED normalization | 八条 MQTT in → function → MQTT out 路径；真实映射导出于 deploy/nodered-j2-flow.json |
| UNS / canonical | 五个 J2 模型及引用关系，见 UNS.md |
| Sentinel Runtime | canonical-live-runtime 与 adapter 订阅 /supos/J2_*；不订阅 RAW 做判断 |
| Deterministic decision | canonical-live-judge 复用 src/demo/judge/contract.ts 的 evaluate；先关系、来源及时间，再数量约束 |
| AI Copilot | 从服务器 ProductView 生成受事实约束的解释、建议与协调内容 |
| Disposition | product-session 内部 DEMO_POLICY_DUAL_ROLE 处置；确认不改变 WMS |
| Source update | simulate-wms-execution 发布 RAW WMS96 及四源进度；事实必须从 canonical 回来 |
| Revalidation | 已授权 + 新 WMS96 + 共同水位覆盖交期加一小时，服务器重新 evaluate 并推导关闭 |
| Frontend spaces | 履约工作台、open supOS 运行、验证中心；运行内含数据流、UNS、Source Flow |

## 事实与权限

来源系统持有业务事实；Node-RED 提供标准化与引用；Runtime 解析 lineage 并保留观测；Judge 形成确定性结果。
AI 输入由已验证 ProductView 构建，输出接受 schema、数量和状态 guard。AI 不作为事实记录、审批记录或关闭条件。
人工确认仅创建内部处置。主案例数量、来源进度、关闭结果均读取服务器，不由动画写入。
当前不是独立的人工复核 API：服务器观察到条件成立后自动复核，页面展示该结果。

## 关联与时间

ERP.orderLineRef = MES.orderLineRef；MES.productionLotRef = QMS.productionLotRef；ERP.orderLineRef = WMS.sourceOrderLineRef。
缺失、歧义或不匹配先停止判断，不能靠数量相等推断身份。
共同水位取四源 sourceProgressAt 的最小值，需覆盖 dueAt + 1 小时。sourceTime 是业务事实时间，接收时间与进度时间分别保留。

## 实现与可复用边界

frontend/src/features/judge/pages：React 19、Tailwind、shadcn 源码组件、Motion、Three.js 场景与证据交互。
src/public/server.ts：静态发行页面及现有 ProductView / Copilot / 演示处置端点。
src/integrations/open-supos：canonical contract、映射、lineage、MQTT session、ProductView。
src/ai/copilot：provider、context、schema、guard。src/demo/judge：冻结的确定性契约与本地演示。
src/simulator 与 solution-packs：仿真及可复用包；保留已有实现，不增加通用框架。

当前 live 会话只服务 SO-IND-001，内存观测重启丢失。002–004 与验证实验为独立 seeded 状态。
改来源适配可复用 canonical 判断边界，但不等于任意工厂零配置接入。
TSDB 持久化、生产鉴权、真实客户部署不在已验证范围。
