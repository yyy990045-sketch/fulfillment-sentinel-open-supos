export type Source = "ERP" | "MES" | "QMS" | "WMS";
export const sources: Source[] = ["ERP", "MES", "QMS", "WMS"];
export type Phase = "quality" | "decision" | "execution" | "recheck" | "closed";
export type Order = {
  id: string; customer: string; product: string; due: string; priority: string;
  quantities: [number, number, number | null, number]; phase: Phase;
  line: string; lot: string; owner: string;
};
export const DEMO_DATA: Order[] = [
  { id: "SO-IND-001", customer: "华东自动化", product: "工业控制器", due: "10 月 08 日", priority: "高优先级", quantities: [100, 96, 96, 100], phase: "decision", line: "LINE-01", lot: "LOT-IND-001", owner: "陈晓 · 履约负责人" },
  { id: "SO-IND-002", customer: "海川设备", product: "传感器组件", due: "10 月 09 日", priority: "常规", quantities: [120, 120, null, 120], phase: "quality", line: "LINE-02", lot: "LOT-IND-002", owner: "李宁 · 质量负责人" },
  { id: "SO-IND-003", customer: "远洲制造", product: "驱动模组", due: "10 月 10 日", priority: "常规", quantities: [80, 72, 72, 80], phase: "execution", line: "LINE-03", lot: "LOT-IND-003", owner: "王晨 · 仓库负责人" },
  { id: "SO-IND-004", customer: "江南精工", product: "控制模块", due: "10 月 11 日", priority: "常规", quantities: [60, 60, 60, 60], phase: "closed", line: "LINE-04", lot: "LOT-IND-004", owner: "周敏 · 履约负责人" },
];
export const phaseLabels: Record<Phase, string> = {
  quality: "等待质量数据", decision: "需要调整发货计划", execution: "等待仓库执行", recheck: "等待重新核对", closed: "已完成复核",
};
export const mappings: Record<Source, { raw: string[]; canonical: string[]; topic: string; input: string }> = {
  ERP: { raw: ["business_key", "required_qty", "due_at", "order_line_ref"], canonical: ["businessKey", "requiredQty", "dueAt", "orderLineRef"], topic: "/supos/J2_ERP_OrderLine", input: "/source/j2/erp/order-line" },
  MES: { raw: ["production_order_ref", "completed_qty", "production_lot_ref", "order_line_ref"], canonical: ["productionOrderRef", "completedQty", "productionLotRef", "orderLineRef"], topic: "/supos/J2_MES_Production", input: "/source/j2/mes/production" },
  QMS: { raw: ["quality_lot_ref", "released_qty", "production_lot_ref", "event_time"], canonical: ["qualityLotRef", "releasedQty", "productionLotRef", "sourceTime"], topic: "/supos/J2_QMS_Quality", input: "/source/j2/qms/quality" },
  WMS: { raw: ["shipment_line_ref", "execution_committed_qty", "source_order_line_ref", "event_time"], canonical: ["shipmentLineRef", "executionCommittedQty", "sourceOrderLineRef", "sourceTime"], topic: "/supos/J2_WMS_Shipment", input: "/source/j2/wms/shipment" },
};
export const objects = [
  { name: "OrderLine", label: "客户订单行", source: "ERP" as Source, ref: "SO-IND-001 / LINE-01", relation: "orderLineRef", updated: "10:31:02" },
  { name: "ProductionOrder", label: "生产工单", source: "MES" as Source, ref: "WO-IND-001", relation: "productionLotRef", updated: "10:31:04" },
  { name: "ProductionLot", label: "生产批次", source: "MES" as Source, ref: "LOT-IND-001", relation: "productionLotRef", updated: "10:31:04" },
  { name: "QualityLot", label: "质量批次", source: "QMS" as Source, ref: "QL-IND-001", relation: "sourceOrderLineRef", updated: "10:31:05" },
  { name: "ShipmentLine", label: "发运单行", source: "WMS" as Source, ref: "SL-IND-001", relation: "关联至客户订单行", updated: "10:31:08" },
];
export const platformEvents = [
  { time: "10:31:09", source: "履约哨兵", text: "业务规则评估完成", detail: "履约差异已进入业务工作台。", topic: mappings.WMS.topic },
  { time: "10:31:08", source: "UNS", text: "发运模型实例已更新", detail: "WMS 事实：executionCommittedQty = 100。", topic: mappings.WMS.topic },
  { time: "10:31:05", source: "Node-RED", text: "质量事实已规范化", detail: "QMS 事实：releasedQty = 96。", topic: mappings.QMS.topic },
  { time: "10:31:04", source: "Node-RED", text: "生产事实已规范化", detail: "MES 事实：completedQty = 96。", topic: mappings.MES.topic },
  { time: "10:31:02", source: "EMQX", text: "订单事件已交付 Source Flow", detail: "ERP 事实：requiredQty = 100。", topic: mappings.ERP.input },
  { time: "10:30:58", source: "UNS", text: "来源进度模型已推进", detail: "四源进度覆盖同一判断时间。", topic: "/supos/J2_SourceProgress" },
];
export const sourceFlows = sources.flatMap(source => [
  { source, kind: "业务事实", input: mappings[source].input, output: mappings[source].topic, normalize: "字段与关系规范化" },
  { source, kind: "来源进度", input: `/source/j2/progress/${source.toLowerCase()}`, output: "/supos/J2_SourceProgress", normalize: "来源时间规范化" },
]);
export const scenarios = [
  { label: "来源未齐", result: "等待质量数据更新", reason: "QMS 尚未覆盖判断时间。来源齐备后再比较履约数量。", checks: [true, false, false], tone: "wait", relation: "质量来源进度尚未到达" },
  { label: "订单关联错误", result: "当前记录无法关联到同一笔订单", reason: "ERP 与 MES 指向不同订单，不能进入数量判断。", checks: [false, true, false], tone: "risk", relation: "orderLineRef 不一致" },
  { label: "履约冲突", result: "发货计划超过当前可放行数量 4 件", reason: "来源与关系已齐备，仓库计划超出质量可放行范围。", checks: [true, true, true], tone: "risk", relation: "质量与发运事实允许比较" },
  { label: "执行完成", result: "当前履约状态已完成复核", reason: "新的仓库执行事实与质量放行一致，原订单承诺继续保留。", checks: [true, true, true], tone: "done", relation: "新 WMS 事实触发重新核对" },
];
