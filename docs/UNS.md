# UNS 业务语义与 lineage

## 实际 canonical 模型

| 模型 / topic 尾段 | 来源事实 | 实际标准化字段 |
| --- | --- | --- |
| J2_ERP_OrderLine | 客户订单行 | businessKey, orderLineRef, requiredQty, dueAt |
| J2_MES_Production | 生产工单与批次 | productionOrderRef, orderLineRef, productionLotRef, completedQty, state |
| J2_QMS_Quality | 质量记录 | qualityLotRef, productionLotRef, releasedQty |
| J2_WMS_Shipment | 发运行 | shipmentLineRef, sourceOrderLineRef, executionCommittedQty |
| J2_SourceProgress | 每个来源的覆盖进度 | sourceSystem, eventType, sourceProgressAt |

完整 topic 是 /supos/ 加模型名称。每条模型记录还含 businessKey、sourceTime、timeStamp、quality。
UI 的 OrderLine / ProductionOrder / ProductionLot / QualityLot / ShipmentLine 是五个业务对象；MES 一个 canonical 模型投影出工单与批次，SourceProgress 单独承载时间证据。两组“五个”不可混称。

## 主案例实际引用

ERP:SO-IND-001:LINE-01 ← MES:WO-IND-001 → MES:LOT-IND-001 ← QMS:QI-IND-001。
WMS:SHIP-IND-001 回指 ERP:SO-IND-001:LINE-01，不是质量批次的下级。

- MES.orderLineRef 指向 ERP.orderLineRef。
- QMS.productionLotRef 指向 MES.productionLotRef。
- WMS.sourceOrderLineRef 指向 ERP.orderLineRef。

这些引用形成同一业务身份；缺失、错误或多义关系会使 lineage 为不可判断。字段改名本身不证明关系成立。
四源 SourceProgress 提供判断时点完整性；数量必须在同一身份、共同时间边界下比较。

## 实际映射

| 来源字段 | 标准字段 |
| --- | --- |
| required_qty | requiredQty |
| completed_qty | completedQty |
| released_qty | releasedQty |
| execution_committed_qty | executionCommittedQty |
| order_line_ref | orderLineRef |
| production_lot_ref | productionLotRef |
| source_order_line_ref | sourceOrderLineRef |
| event_time | sourceTime |
| source_progress_at | sourceProgressAt |

全部八条路径的原函数见 deploy/nodered-j2-flow.json；不是按展示示意字段重写。
确认处置后 ShipmentLine 仍 100；收到新 canonical WMS96 后才变化，历史 WMS100 保留于当前会话事件。
canonical 事件 ID 由适配内容派生；RAW 与 canonical 以业务键、引用、来源时间、数量关联，不声称上游提供同一全局 UUID。
Inspector 可查看实例、值、时间、映射、关联目标与 topic。没有 TSDB 持久化验证。
