# 当前 Integration-R1 接线

主案例 GET /api/v2/demo/fulfillment/product-view 从真实 canonical 会话读取，前端不本地修改来源数量。002–004 保持 seeded 状态。
POST /api/copilot/brief 输入 caseId，服务器构建 ProductView context；返回通过 guard 的结果后前端记录 source=live。失败使用 source=demo。
POST /api/v2/demo/fulfillment/confirm-disposition 只确认内部方案；simulate-wms-execution 发布 RAW WMS96 与四源进度；reset 只清理会话内存。
服务器从 canonical WMS96、已授权方案与共同水位推导 CLOSED，动画不执行关闭。

实际 MQTT 路径 RAW → EMQX → Node-RED J2 八路径 → /supos/J2_* → Sentinel。RAW/canonical 通过业务引用、来源时间与数量关联；canonical ID 为适配内容派生，不是上游统一 UUID。
运行事件动画为真实交付回放，不测量实时网络延时。
凭据使用自己的服务端环境变量，部署步骤见 ../DEPLOYMENT.md，演示来源见 DEMO.md。没有携带开发机配置或绝对路径。
真实 Runtime 使用模拟工业输入；TSDB 与真实工厂数据未验证。
