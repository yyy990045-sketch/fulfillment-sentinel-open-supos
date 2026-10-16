/**
 * AI-COPILOT-BE-R1 —— 把 Product View 压成精简的 prompt 输入（§3/§4）。
 *
 * 核心：**AI 不自己查数据库、不订阅 MQTT、不解析 RAW。**
 * 只把已被确定性系统确认的工业事实、来源时间、关系状态、流程状态、
 * 当前处置与最近若干条事件交给模型。
 *
 * 明确排除：原始 MQTT payload、完整 JSON dump、Docker 信息、
 * Node-RED flow JSON、无关日志、evaluation 全量结构。
 *
 * 只读 `ProductView`，不修改 judge engine / product-view。
 */

import type { ProductView } from "../../integrations/open-supos/product-view.js";

/** 最近事件截断条数（上限，防止 prompt 膨胀与无关噪声）。 */
export const COPILOT_MAX_EVENTS = 8;

/** 证据目录允许的稳定系统标识。 */
export const COPILOT_EVIDENCE_SYSTEMS = ["ERP", "MES", "QMS", "WMS", "SOURCE_PROGRESS"] as const;

export type CopilotEvidenceRef = { system: string; label: string; value: string };

export type CopilotSourceCell = {
  role: "order" | "production" | "quality" | "shipment";
  system: string;
  quantityField: string;
  qty: number | null;
  source: string;
  sourceTime: string;
};

export type CopilotEventFact = {
  source: string;
  eventType: string;
  businessRef: string;
  sourceTime: string;
  summary: string;
};

export type CopilotContext = {
  caseId: string;
  businessKey: string;
  /** 确定性状态：由既有 evaluate() 判定，AI 不得改写 */
  deterministicStatus: string;
  workflow: {
    state: string;
    currentStep: string;
    history: Array<{ step: string; status: string; at: string }>;
  };
  disposition: { status: string; authorizedQty: number | null };
  quantities: {
    orderRequiredQty: number | null;
    productionCompletedQty: number | null;
    qualityReleasedQty: number | null;
    shipmentExecutionCommittedQty: number | null;
  };
  sources: CopilotSourceCell[];
  sourceProgress: { ERP: string; MES: string; QMS: string; WMS: string };
  globalWatermark: string;
  dueAt: string;
  dueAtWithGrace: string;
  productionState: string;
  lineage: { status: string; relation: string };
  externalObligation: string;
  recentEvents: CopilotEventFact[];
  /** 可支持数量 = min(完工, 放行)；WMS 不作为依据（可能是尚未执行的计划值） */
  supportedQty: number | null;
  evidenceCatalog: CopilotEvidenceRef[];
  /** 文案中允许出现的数字（来源数量 + 两两差额绝对值） */
  allowedNumbers: number[];
};

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function quantityText(value: number | null): string {
  return value === null ? "未提供" : String(value);
}

const SOURCE_ROLES = [
  { role: "order", system: "ERP", quantityField: "requiredQty" },
  { role: "production", system: "MES", quantityField: "completedQty" },
  { role: "quality", system: "QMS", quantityField: "releasedQty" },
  { role: "shipment", system: "WMS", quantityField: "executionCommittedQty" },
] as const;

function progressOf(view: ProductView) {
  const raw = (view.evaluation?.sourceProgress ?? {}) as Partial<Record<"ERP" | "MES" | "QMS" | "WMS", unknown>>;
  return {
    ERP: text(raw.ERP),
    MES: text(raw.MES),
    QMS: text(raw.QMS),
    WMS: text(raw.WMS),
  };
}

/**
 * 证据目录：枚举**允许 AI 引用**的事实，每条都真实取自 view。
 * system 用 ERP / MES / QMS / WMS / SOURCE_PROGRESS 稳定标识。
 */
export function buildEvidenceCatalog(view: ProductView): CopilotEvidenceRef[] {
  const facts = view.facts;
  const progress = progressOf(view);
  return [
    { system: "ERP", label: "订单要求数量 requiredQty", value: quantityText(facts.order.qty) },
    { system: "ERP", label: "订单交期 dueAt", value: text(view.case.dueAt) },
    { system: "MES", label: "生产完工数量 completedQty", value: quantityText(facts.production.qty) },
    { system: "QMS", label: "质量放行数量 releasedQty", value: quantityText(facts.quality.qty) },
    { system: "WMS", label: "仓库执行承诺数量 executionCommittedQty", value: quantityText(facts.shipment.qty) },
    { system: "SOURCE_PROGRESS", label: "四源共同水位 globalWatermark", value: text(view.evaluation?.globalWatermark) },
    { system: "SOURCE_PROGRESS", label: "ERP 来源进度时间", value: progress.ERP },
    { system: "SOURCE_PROGRESS", label: "MES 来源进度时间", value: progress.MES },
    { system: "SOURCE_PROGRESS", label: "QMS 来源进度时间", value: progress.QMS },
    { system: "SOURCE_PROGRESS", label: "WMS 来源进度时间", value: progress.WMS },
  ];
}

/**
 * 允许在文案中出现的数字集合（供 validator 用）：
 * 四个来源数量 + 它们两两之差的绝对值（`100-96=4` 是合法推导，不是编造）。
 */
export function collectAllowedNumbers(view: ProductView): Set<number> {
  const values = [
    view.facts.order.qty,
    view.facts.production.qty,
    view.facts.quality.qty,
    view.facts.shipment.qty,
  ].filter((item): item is number => typeof item === "number" && Number.isFinite(item));

  const numbers = new Set<number>(values);
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      numbers.add(Math.abs((values[i] ?? 0) - (values[j] ?? 0)));
    }
  }
  return numbers;
}

/** 可支持数量：min(完工, 放行)。任一为 null / 0 → null。WMS 不作为依据。 */
export function supportedQuantityOf(view: ProductView): number | null {
  const completed = view.facts.production.qty;
  const released = view.facts.quality.qty;
  if (completed === null || released === null) return null;
  if (!Number.isFinite(completed) || !Number.isFinite(released)) return null;
  if (completed <= 0 || released <= 0) return null;
  return Math.min(completed, released);
}

/** Product View → 精简 prompt 输入（含截断的最近事件与证据目录）。 */
export function buildCopilotContext(view: ProductView): CopilotContext {
  const facts = view.facts;
  const evaluation = view.evaluation;
  const sources: CopilotSourceCell[] = SOURCE_ROLES.map((item) => {
    const cell = facts[item.role];
    return {
      role: item.role,
      system: item.system,
      quantityField: item.quantityField,
      qty: cell?.qty ?? null,
      source: text(cell?.source),
      sourceTime: text(cell?.updatedAt),
    };
  });

  const recentEvents: CopilotEventFact[] = (view.runtime?.events ?? [])
    .slice(0, COPILOT_MAX_EVENTS)
    .map((event) => ({
      source: text(event.source),
      eventType: text(event.eventType),
      businessRef: text(event.businessRef),
      sourceTime: text(event.sourceTime),
      summary: text(event.summary),
    }));

  return {
    caseId: text(view.case?.id),
    businessKey: text(evaluation?.businessKey ?? view.uns?.businessKey),
    deterministicStatus: text(view.workflow?.status),
    workflow: {
      state: text(view.workflow?.status),
      currentStep: text(view.workflow?.currentStep),
      history: (view.workflow?.history ?? []).map((item) => ({
        step: text(item.step),
        status: text(item.status),
        at: text(item.at),
      })),
    },
    disposition: {
      status: text(view.decision?.status),
      authorizedQty: typeof view.decision?.recommendedQty === "number" ? view.decision.recommendedQty : null,
    },
    quantities: {
      orderRequiredQty: facts.order.qty,
      productionCompletedQty: facts.production.qty,
      qualityReleasedQty: facts.quality.qty,
      shipmentExecutionCommittedQty: facts.shipment.qty,
    },
    sources,
    sourceProgress: progressOf(view),
    globalWatermark: text(evaluation?.globalWatermark),
    dueAt: text(view.case?.dueAt),
    dueAtWithGrace: text(evaluation?.dueAtWithGrace),
    productionState: text((evaluation?.facts as { productionState?: unknown } | undefined)?.productionState),
    lineage: {
      status: text(evaluation?.lineage?.status),
      relation: text(evaluation?.lineage?.relation),
    },
    externalObligation: text(evaluation?.externalObligation),
    recentEvents,
    supportedQty: supportedQuantityOf(view),
    evidenceCatalog: buildEvidenceCatalog(view),
    allowedNumbers: [...collectAllowedNumbers(view)],
  };
}
