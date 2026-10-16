/**
 * J2 Canonical Live Runtime —— 冻结契约常量。
 *
 * 只服务本次真实 open supOS Runtime 接线（§6/§7）。
 * 不修改 UNS_TOPIC_PREFIXES，不把 "supos" 加入全局 connector 白名单：
 * 本模块是**独立的 canonical live 通道**，与 legacy/industrial UNS 式子平行存在。
 */

/** 真实 canonical topics（J2 Node-RED flow 06159bb21ff3a699 的输出）。 */
export const CANONICAL_TOPICS = {
  ERP: "/supos/J2_ERP_OrderLine",
  MES: "/supos/J2_MES_Production",
  QMS: "/supos/J2_QMS_Quality",
  WMS: "/supos/J2_WMS_Shipment",
  SOURCE_PROGRESS: "/supos/J2_SourceProgress",
} as const;

export type CanonicalTopic = (typeof CANONICAL_TOPICS)[keyof typeof CANONICAL_TOPICS];

/** RAW ingest topics（上游，供发布侧使用；Sentinel 只消费 canonical）。 */
export const RAW_TOPICS = {
  ERP: "/source/j2/erp/order-line",
  MES: "/source/j2/mes/production",
  QMS: "/source/j2/qms/quality",
  WMS: "/source/j2/wms/shipment",
  PROGRESS_ERP: "/source/j2/progress/erp",
  PROGRESS_MES: "/source/j2/progress/mes",
  PROGRESS_QMS: "/source/j2/progress/qms",
  PROGRESS_WMS: "/source/j2/progress/wms",
} as const;

/** §7 Runtime Truth Boundary —— 完整八项。 */
export const RUNTIME_TRUTH_BOUNDARY = {
  SIMULATED_INDUSTRIAL_DATA: true,
  REAL_FACTORY_DATA: false,
  REAL_OPEN_SUPOS_RUNTIME: true,
  REAL_OPEN_SUPOS_EMQX: true,
  REAL_OPEN_SUPOS_NODERED_FLOW: true,
  REAL_OPEN_SUPOS_UNS_MODEL: true,
  OPEN_SUPOS_TSDB_PERSISTENCE_VERIFIED: false,
} as const;

export const J2_TENANT_KEY = "j2-live-runtime";
export const J2_NODERED_FLOW_ID = "06159bb21ff3a699";
export const J2_BUSINESS_KEY = "SO-IND-001";

/** canonical 扁平 payload 形状（J2 Node-RED normalize 的输出）。 */
export type CanonicalErpOrderLine = {
  businessKey: string;
  orderLineRef: string;
  requiredQty: number;
  dueAt: string;
  sourceTime: string;
  timeStamp: number;
  quality: number;
};

export type CanonicalMesProduction = {
  businessKey: string;
  productionOrderRef: string;
  orderLineRef: string;
  productionLotRef: string;
  completedQty: number;
  state: string;
  sourceTime: string;
  timeStamp: number;
  quality: number;
};

export type CanonicalQmsQuality = {
  businessKey: string;
  qualityLotRef: string;
  productionLotRef: string;
  releasedQty: number;
  sourceTime: string;
  timeStamp: number;
  quality: number;
};

export type CanonicalWmsShipment = {
  businessKey: string;
  shipmentLineRef: string;
  sourceOrderLineRef: string;
  executionCommittedQty: number;
  sourceTime: string;
  timeStamp: number;
  quality: number;
};

export type CanonicalSourceProgress = {
  businessKey: string;
  sourceSystem: string;
  eventType: string;
  sourceProgressAt: string;
  sourceTime: string;
  timeStamp: number;
  quality: number;
};

export type CanonicalPayload =
  | CanonicalErpOrderLine
  | CanonicalMesProduction
  | CanonicalQmsQuality
  | CanonicalWmsShipment
  | CanonicalSourceProgress;
