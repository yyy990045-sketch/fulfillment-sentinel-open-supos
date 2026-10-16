# 演进规划

这是方向和审议顺序，不承诺日期、团队规模或客户落地。

## V1：当前发行版

已实现多源模拟履约事实、五个 canonical UNS 模型、lineage/共同水位/约束判断、内部 disposition、来源更新与 revalidation、grounded AI 集成及三空间前端。
SO-IND-001 已完成真实 Runtime 链验证；002–004 为 seeded 场景。实时会话当前固定主案例、使用内存，生产鉴权和 TSDB 持久化不在完成范围。

## V1.1：近期扩展

- 通过 src/integrations 与 connectors 增加 ERP/MES/QMS/WMS 来源适配，先保留统一 canonical 边界。
- 基于 src/demo/judge 与 manufacturing-fulfillment 增加履约 invariant，使用来源完整性与身份错误案例约束新判断。
- 利用现有 runtime events / traceability 改进重放与可观测性，区分接收时间、来源时间与覆盖水位。
- 在已有 policy / disposition 扩展点实现可配置 Case policy，并评估多案例与安全鉴权；不直接扩硬编码主会话。

## V2：更长期

- 基于 src/solution-packs 的 manifest 与 bindings 形成可复用工业方案包。
- 来源适配与 UNS mapping 包按工厂版本交付，明确字段、关系和时间契约。
- 在保持外部订单责任的前提下扩展剩余需求、补产和履约生命周期覆盖。

新工作通过 feature request 明确输入、工业影响、truth boundary 与复现证据，维护者确定优先级。
