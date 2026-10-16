/**
 * BACKEND-R1 —— 履约哨兵 Product View（前端唯一读取模型）。
 *
 * 本模块**不是**新的 domain layer / repository / service framework：
 * 它只是一个**纯只读投影**，把已有的三样东西拼成前端要的结构：
 *
 *   1. live runtime state    —— `J2CanonicalLiveRuntime`（真实 canonical events）
 *   2. judge evaluation      —— 既有 `evaluateLiveJudge`（不复制状态机）
 *   3. canonical contract    —— 既有 `CANONICAL_TOPICS` / `RAW_TOPICS`（UNS projection）
 *
 * 后端返回机器状态（FULFILLMENT_STATE_CONFLICT 等），
 * UI 文案由前端翻译，本模块不产生任何面向用户的措辞（§14）。
 *
 * 主案例 SO-IND-001 的四个数量必须来自 runtime 投影，不得由前端硬编码（§5）。
 */

import {
  CANONICAL_TOPICS,
  J2_BUSINESS_KEY,
  RAW_TOPICS,
  RUNTIME_TRUTH_BOUNDARY,
} from "./canonical-contract.js";
import type { J2CanonicalLiveRuntime } from "./canonical-live-runtime.js";
import type { LiveJudgeEvaluation } from "./canonical-live-judge.js";

/** 四条来源的角色 → 既有 canonical topic 绑定（不新建 UNS）。 */
const SOURCE_BINDING = [
  { role: "order", system: "ERP", systemType: "erp", canonicalTopic: CANONICAL_TOPICS.ERP, rawTopic: RAW_TOPICS.ERP, model: "J2_ERP_OrderLine" },
  { role: "production", system: "MES", systemType: "mes", canonicalTopic: CANONICAL_TOPICS.MES, rawTopic: RAW_TOPICS.MES, model: "J2_MES_Production" },
  { role: "quality", system: "QMS", systemType: "qms", canonicalTopic: CANONICAL_TOPICS.QMS, rawTopic: RAW_TOPICS.QMS, model: "J2_QMS_Quality" },
  { role: "shipment", system: "WMS", systemType: "wms", canonicalTopic: CANONICAL_TOPICS.WMS, rawTopic: RAW_TOPICS.WMS, model: "J2_WMS_Shipment" },
] as const;

/** §10：UNS models —— 直接来自既有 canonical contract，含 SourceProgress。 */
export const UNS_MODELS = [
  { name: "J2_ERP_OrderLine", system: "ERP", topic: CANONICAL_TOPICS.ERP, rawTopic: RAW_TOPICS.ERP, quantityField: "requiredQty" },
  { name: "J2_MES_Production", system: "MES", topic: CANONICAL_TOPICS.MES, rawTopic: RAW_TOPICS.MES, quantityField: "completedQty" },
  { name: "J2_QMS_Quality", system: "QMS", topic: CANONICAL_TOPICS.QMS, rawTopic: RAW_TOPICS.QMS, quantityField: "releasedQty" },
  { name: "J2_WMS_Shipment", system: "WMS", topic: CANONICAL_TOPICS.WMS, rawTopic: RAW_TOPICS.WMS, quantityField: "executionCommittedQty" },
  { name: "J2_SourceProgress", system: "SOURCE_PROGRESS", topic: CANONICAL_TOPICS.SOURCE_PROGRESS, rawTopic: RAW_TOPICS.PROGRESS_ERP, quantityField: null },
] as const;

/** §10：relations —— 既有 canonical contract 的 lineage 引用字段。 */
export const UNS_RELATIONS = [
  { ref: "orderLineRef", declaredBy: "ERP", carries: "sourceOrderLineRef" },
  { ref: "productionOrderRef", declaredBy: "MES", carries: "workOrderRef" },
  { ref: "productionLotRef", declaredBy: "MES/QMS", carries: "productionLotRef" },
  { ref: "sourceOrderLineRef", declaredBy: "WMS", carries: "sourceOrderLineRef" },
  { ref: "shipmentLineRef", declaredBy: "WMS", carries: "shipmentSourceRef" },
] as const;

/** §11：Source Flow —— RAW → normalize → canonical，前端只管展示。 */
export const SOURCE_FLOW = SOURCE_BINDING.map((item) => ({
  system: item.system,
  rawTopic: item.rawTopic,
  normalize: "Node-RED J2 flow",
  canonicalTopic: item.canonicalTopic,
  model: item.model,
}));

export type ProductFactCell = { qty: number | null; source: string; updatedAt: string };

export type ProductView = {
  case: {
    id: string;
    title: string;
    dueAt: string;
    owner: string;
  };
  facts: {
    order: ProductFactCell;
    production: ProductFactCell;
    quality: ProductFactCell;
    shipment: ProductFactCell;
  };
  workflow: {
    /** 机器状态：由既有 evaluate() 判定，前端负责翻译（§14） */
    status: string;
    currentStep: string;
    history: Array<{ step: string; status: string; at: string }>;
  };
  decision: {
    status: string;
    recommendedQty: number | null;
    reason: string;
  };
  runtime: {
    connected: boolean;
    latestEventAt: string | null;
    events: Array<{
      id: string;
      receivedAt: string;
      quantity: number | null;
      isSourceProgress: boolean;
      source: string;
      eventType: string;
      businessRef: string;
      sourceTime: string;
      summary: string;
      canonicalTopic: string;
      /** 该事件在 open supOS 内真实走到的跳数（0=RAW 已交付 … 4=Sentinel 已判定）。
       *  由 canonical observation 的客观事实推断：canonicalTopic 已形成 ⇒ ≥3 跳。 */
      reached: number;
      isLatest: boolean;
    }>;
  };
  uns: {
    models: typeof UNS_MODELS;
    relations: typeof UNS_RELATIONS;
    sourceFlow: typeof SOURCE_FLOW;
    businessKey: string;
  };
  /** live 判定原文（前端技术依据抽屉用；主视觉不应直接展示） */
  evaluation: LiveJudgeEvaluation;
  truthBoundary: typeof RUNTIME_TRUTH_BOUNDARY;
};

/** 机器状态 → 流程步骤（后端只给机器可判定的步骤名，不给 UI 文案）。 */
const STEP_OF_STATUS: Record<string, string> = {
  WAITING_FOR_SOURCE_PROGRESS: "SOURCE_SYNC",
  "NOT_EVALUABLE:BUSINESS_IDENTITY_UNRESOLVED": "IDENTITY_CHECK",
  FULFILLMENT_STATE_CONFLICT: "ANOMALY_FOUND",
  WAITING_FOR_EXECUTION_VERIFICATION: "EXECUTION_PENDING",
  REVALIDATED_CLOSED: "REVALIDATED",
  NO_CONFLICT: "REVALIDATED",
};

const STEPS = ["ANOMALY_FOUND", "DECISION_MADE", "EXECUTION_PENDING", "REVALIDATION", "REVALIDATED"];

/** 某来源最后一次真实 canonical 观测（用于 facts.updatedAt / source）。 */
function lastObservationOf(runtime: J2CanonicalLiveRuntime, systemType: string) {
  const matches = runtime.state.observations.filter(
    (item) => !item.isSourceProgress && item.envelope.source.systemType === systemType,
  );
  return matches[matches.length - 1] ?? null;
}

function cellOf(
  runtime: J2CanonicalLiveRuntime,
  systemType: string,
  qty: number | null,
  model: string,
  fallbackAt: string,
): ProductFactCell {
  const observation = lastObservationOf(runtime, systemType);
  const j2 = (observation?.envelope.metadata?.j2 ?? {}) as Record<string, unknown>;
  return {
    qty,
    source: model,
    updatedAt: observation ? String(j2.sourceTime ?? observation.envelope.event.occurredAt) : fallbackAt,
  };
}

/**
 * 纯读投影：live runtime + 既有 judge evaluation → Product View。
 *
 * 不写 state、不触发副作用、不发明数据。四个数量直接取自 evaluation.facts
 * （即 `factsFromUnsMessages` 对真实 envelope 流的计算结果）。
 */
export function buildProductView(
  runtime: J2CanonicalLiveRuntime,
  evaluation: LiveJudgeEvaluation,
  options: { owner?: string } = {},
): ProductView {
  const facts = evaluation.facts;
  const status = evaluation.status;
  const currentStep = STEP_OF_STATUS[status] ?? "SOURCE_SYNC";
  const currentIndex = STEPS.indexOf(currentStep);
  const decided = evaluation.disposition.authorizedQty !== null;

  // 处理历史：只记录**已经发生**的机器事实（发现异常 / 已处置），不预测未来
  const history: ProductView["workflow"]["history"] = [];
  if (status !== "WAITING_FOR_SOURCE_PROGRESS" && status !== "NOT_EVALUABLE:BUSINESS_IDENTITY_UNRESOLVED") {
    history.push({ step: "ANOMALY_FOUND", status: "DONE", at: evaluation.globalWatermark });
  }
  if (decided) {
    history.push({
      step: "DECISION_MADE",
      status: currentIndex > 1 ? "DONE" : "CURRENT",
      at: evaluation.globalWatermark,
    });
  }

  // §9 Runtime Events：从已有 observations 生成，不新建事件系统
  // 「已走到哪一跳」是**推断**，不是遥测：真实可观测的证据只有
  //   · observation 已进入 runtime 队列（⇒ RAW 已交付、EMQX 已接收）
  //   · canonicalTopic 已形成（⇒ Node-RED 规范化已完成）
  // 之后 UNS 折叠与 Sentinel 判定属于评估语义，不产生逐条事件级证据，
  // 因此 reached 最多推到 Node-RED（索引 2），并将其余两跳显式标为"待交付"。
  // 这样截图里的中间态来自真实观测事实，而不是任何 URL 参数或固定动画。
  // 观测里最新一条 = 正在被处理的这一条（真实 receivedAt 最大值，非猜测）
  const latestReceivedAt = runtime.state.observations.reduce<string>((max, o) => (o.receivedAt > max ? o.receivedAt : max), "");
  const events: ProductView["runtime"]["events"] = runtime.state.observations.map((observation) => {
    const j2 = (observation.envelope.metadata?.j2 ?? {}) as Record<string, unknown>;
    const quantityField = typeof j2.quantityField === "string" ? j2.quantityField : null;
    const quantityValue = typeof j2.quantityValue === "number" ? j2.quantityValue : null;
    const canonicalTopic = String(j2.canonicalTopic ?? observation.topic);
    // 真实推断：本 observation 已持有 canonicalTopic ⇒ 已完成 RAW→EMQX→Node-RED 三跳。
    // 若它正好是会话里最新到达的一条，则第 4 跳（UNS 折叠）正在推进中。
    // 第 5 跳（Sentinel 判定）不产生逐条事件证据，始终留作「待执行」。
    const isLatest = latestReceivedAt !== "" && observation.receivedAt === latestReceivedAt;
    const reached = isLatest ? 3 : canonicalTopic ? 2 : 1;
    return {
      id: observation.envelope.messageId,
      receivedAt: observation.receivedAt,
      quantity: quantityValue,
      isSourceProgress: observation.isSourceProgress,
      source: observation.envelope.source.systemType.toUpperCase(),
      eventType: observation.envelope.event.eventType,
      businessRef: observation.envelope.entity.businessKey,
      sourceTime: String(j2.sourceTime ?? observation.envelope.event.occurredAt),
      summary: quantityField && quantityValue !== null ? `${quantityField}=${quantityValue}` : observation.envelope.event.eventType,
      canonicalTopic,
      reached,
      isLatest,
    };
  });
  // 事件按来源时间倒序（最近在前），前端直接渲染
  events.reverse();

  return {
    case: {
      id: facts.businessKey || J2_BUSINESS_KEY,
      title: "跨系统生产履约状态冲突",
      dueAt: facts.dueAt,
      owner: options.owner ?? "履约计划员",
    },
    facts: {
      order: cellOf(runtime, "erp", facts.requiredQty, "J2_ERP_OrderLine", facts.sourceProgress.ERP),
      production: cellOf(runtime, "mes", facts.completedQty, "J2_MES_Production", facts.sourceProgress.MES),
      quality: cellOf(runtime, "qms", facts.releasedQty, "J2_QMS_Quality", facts.sourceProgress.QMS),
      shipment: cellOf(runtime, "wms", facts.executionCommittedQty, "J2_WMS_Shipment", facts.sourceProgress.WMS),
    },
    workflow: {
      status,
      currentStep,
      history,
    },
    decision: {
      status: evaluation.disposition.status,
      recommendedQty: evaluation.disposition.authorizedQty,
      reason: evaluation.reason,
    },
    runtime: {
      connected: runtime.state.observations.length > 0,
      latestEventAt: events[0]?.sourceTime ?? null,
      events,
    },
    uns: {
      models: UNS_MODELS,
      relations: UNS_RELATIONS,
      sourceFlow: SOURCE_FLOW,
      businessKey: facts.businessKey,
    },
    evaluation,
    truthBoundary: RUNTIME_TRUTH_BOUNDARY,
  };
}
