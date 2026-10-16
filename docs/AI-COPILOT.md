# AI Copilot

## 已有接口与输入

POST /api/copilot/brief 接收 {caseId}；服务器只允许当前 live 主案例。
src/ai/copilot/context.ts 从服务器 ProductView 构建事实、lineage、时间覆盖、确定性结果和处置状态。
AI 不读取 RAW MQTT，不写 ERP/MES/QMS/WMS，不授予审批，不自动关闭 Case。
工业事实及判断由来源与 Runtime / Judge 确定；AI 负责解释、总结、候选建议与销售/生产/质量/仓库协同说明。

## Provider 与结构

服务端环境变量 AI_API_KEY、AI_MODEL 必需；AI_BASE_URL 可覆盖兼容 chat-completions 的服务地址。
AI_TIMEOUT_MS 可选，1000–60000 毫秒；AI_JSON_SCHEMA 可选，off/none/false 关闭 response_format。
密钥只放私有环境变量，不打包进浏览器。未配置时接口返回 available=false。
输出为结构化 JSON：summary、reasoningSummary、recommendedAction、coordination、evidenceRefs、limitations。
前端统一 CopilotBrief 额外记录 available、source=live|demo、caseId，页面无需因数据源更换而重写。

## Guard 与降级

已有 schema 与 validator 检查字段、证据引用、允许数量、不支持的事实、当前阶段一致性。
CONFLICT 可建议内部执行上限；WAITING 不重复批准；CLOSED 的 recommendedAction.quantity 必须为 null，仍保留客户原要求与剩余需求。
来源或时间不足时只给等待与协调，不把缺失事实推成执行数量。
Provider 拒绝 response_format 时既有实现可用纯 prompt 输出约束重试一次；其结果仍需通过 guard。
请求错误、不可用、输出 guard 拒绝时前端使用已批准 demo adapter，source=demo。降级不是 live AI 成功。
模型输出可能被拒绝，当前不承诺每次演示均得到 live 结果，也没有新增自动重试/Agent/RAG。

## 演示操作

工作台打开 AI 协同建议，查看 loading、局部结果、Evidence Sheet 和跨部门 Sheet。
证据 Sheet 展示已验证来源；确认内部方案、真实来源更新、重新验证仍属于既有 Runtime 流程。
示例主案例 100/96/96/100；内部关闭为 100/96/96/96，客户原订单不变。
