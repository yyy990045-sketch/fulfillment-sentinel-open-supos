/**
 * Canonical Live Adapter —— 把 J2 `/supos/J2_*` 扁平 canonical payload
 * 无损转换为仓库现有 `OpenSupOSUnsEnvelope`。
 *
 * 边界（按用户指令）：
 *   - 不修改 UNS_TOPIC_PREFIXES，不把 "supos" 加入全局 connector 白名单；
 *   - 很薄：只做 canonical payload → envelope 的确定性映射；
 *   - lineage / watermark / conflict / state machine / UI 一律复用仓库现有实现；
 *   - Source Progress 使用真实 canonical progress event（`sourceProgressAt`），
 *     **不回退**仿真时钟作为 live 真值；
 *   - 无法无损转换时显式失败，不伪造业务事实。
 *
 * 关键语义（§9 / 边界 #7）：
 *   现有 `factsFromUnsMessages`（src/demo/judge/contract.ts:228）从
 *   `metadata.simulation.sourceProgressAt` 读取「来源数据完整到哪一刻」，
 *   这是**每个来源各自的 checkpoint**，而不是该条事件的 latestEventTime。
 *   因此本 adapter 只为**业务事件**写入「该来源当前的真实 progress」，
 *   该值由调用方从真实 canonical progress event 维护的注册表传入；
 *   业务事件自身的 sourceTime 绝不冒充 progress。
 */

import { createHash } from "node:crypto";
import {
  CANONICAL_TOPICS,
  J2_TENANT_KEY,
  type CanonicalErpOrderLine,
  type CanonicalMesProduction,
  type CanonicalPayload,
  type CanonicalQmsQuality,
  type CanonicalSourceProgress,
  type CanonicalWmsShipment,
} from "./canonical-contract.js";
import { OpenSupOSIntegrationError, type OpenSupOSUnsEnvelope } from "./types.js";

function shortHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
}

/**
 * Canonical topic → 来源系统绑定。
 * 这是**数据驱动**的：topic 决定 systemKey/systemType/entityType/documentType。
 */
type SourceBinding = {
  systemKey: string;
  systemType: "erp" | "mes" | "qms" | "wms";
  entityType: string;
  documentType: string;
  eventType: string;
  /** payload 中承载 lineage 引用的字段名 → envelope lineage 键名 */
  relationKeys: {
    sourceOrderLineRef?: string;
    workOrderRef?: string;
    productionLotRef?: string;
    shipmentSourceRef?: string;
  };
  /** 该来源的主业务 ref（用作 externalDocumentId / entity.businessKey） */
  primaryRefKey: string;
};

const BINDINGS: Record<string, SourceBinding> = {
  [CANONICAL_TOPICS.ERP]: {
    systemKey: "ERP",
    systemType: "erp",
    entityType: "sales_order",
    documentType: "sales_order",
    eventType: "ORDER_CREATED",
    relationKeys: {},
    primaryRefKey: "orderLineRef",
  },
  [CANONICAL_TOPICS.MES]: {
    systemKey: "MES",
    systemType: "mes",
    entityType: "production_order",
    documentType: "production_order",
    eventType: "PRODUCTION_COMPLETED",
    relationKeys: {
      sourceOrderLineRef: "orderLineRef",
      workOrderRef: "productionOrderRef",
      productionLotRef: "productionLotRef",
    },
    primaryRefKey: "productionOrderRef",
  },
  [CANONICAL_TOPICS.QMS]: {
    systemKey: "QMS",
    systemType: "qms",
    entityType: "quality_event",
    documentType: "quality_inspection",
    eventType: "QUALITY_PASSED",
    relationKeys: {
      productionLotRef: "productionLotRef",
    },
    primaryRefKey: "qualityLotRef",
  },
  [CANONICAL_TOPICS.WMS]: {
    systemKey: "WMS",
    systemType: "wms",
    entityType: "shipment",
    documentType: "shipment",
    eventType: "SHIPMENT_DISPATCHED",
    relationKeys: {
      sourceOrderLineRef: "sourceOrderLineRef",
      shipmentSourceRef: "shipmentLineRef",
    },
    primaryRefKey: "shipmentLineRef",
  },
};

export const SOURCE_PROGRESS_BINDING = {
  systemKey: "SOURCE_PROGRESS",
  entityType: "source_progress",
  documentType: "source_progress",
} as const;

/** 可转换性错误：缺字段/未知 topic 时显式抛出，绝不编造。 */
export class CanonicalConversionError extends OpenSupOSIntegrationError {
  constructor(code: string, detail: string) {
    super(code, detail);
    this.name = "CanonicalConversionError";
  }
}

function requireString(payload: Record<string, unknown>, key: string, topic: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new CanonicalConversionError("CANONICAL_FIELD_MISSING", `${topic}.${key}`);
  }
  return value;
}

function requireNumber(payload: Record<string, unknown>, key: string, topic: string): number {
  const value = payload[key];
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    throw new CanonicalConversionError("CANONICAL_FIELD_MISSING", `${topic}.${key}`);
  }
  return num;
}

/**
 * 构建 lineage 引用块。
 * §9：只用 payload 中**真实存在**的 ref 字段，缺失即不写入（不填占位值）。
 */
function buildLineageBlock(binding: SourceBinding, payload: Record<string, unknown>): Record<string, string> {
  const lineage: Record<string, string> = {};
  for (const [envelopeKey, payloadKey] of Object.entries(binding.relationKeys)) {
    const value = payload[payloadKey as string];
    if (typeof value === "string" && value.length > 0) lineage[envelopeKey] = value;
  }
  return lineage;
}

/**
 * 真实 canonical progress 注册表：每个来源系统各自的 checkpoint（ISO 字符串）。
 * 只由 `/supos/J2_SourceProgress` 事件驱动（§9）。
 */
export type SourceProgressRegistry = Record<"ERP" | "MES" | "QMS" | "WMS", string>;

export function emptyProgressRegistry(): SourceProgressRegistry {
  return { ERP: "", MES: "", QMS: "", WMS: "" };
}

/** 用一条真实 canonical progress event 推进注册表（单调取最大）。 */
export function advanceProgressRegistry(registry: SourceProgressRegistry, progress: {
  sourceSystem: string;
  sourceProgressAt: string;
}): boolean {
  const system = progress.sourceSystem.toUpperCase() as keyof SourceProgressRegistry;
  if (!(system in registry)) {
    throw new CanonicalConversionError("CANONICAL_PROGRESS_SYSTEM_UNKNOWN", progress.sourceSystem);
  }
  const current = registry[system];
  if (progress.sourceProgressAt > current) {
    registry[system] = progress.sourceProgressAt;
    return true;
  }
  return false;
}

/** QMS 的 workOrderRef 在 J2 canonical 中不直接携带，从 MES 已建立的关联推导（由调用方注入）。 */
export type LineageContext = {
  workOrderRef?: string;
  productionLotRef?: string;
};

/**
 * `/supos/J2_*` 扁平 payload → `OpenSupOSUnsEnvelope`。
 *
 * 确定性：同一 payload 必得同一 envelope（messageId 由内容派生）。
 *
 * @param topic            canonical topic
 * @param rawPayload       原始 JSON 字符串或已解析对象
 * @param options.lineageContext   跨源关联（MES 建立的 workOrderRef / productionLotRef）
 * @param options.progressRegistry 真实 canonical progress 注册表（业务事件时写入该来源当前 checkpoint）
 */
export function canonicalToEnvelope(
  topic: string,
  rawPayload: string | Record<string, unknown>,
  options: { lineageContext?: LineageContext; progressRegistry?: SourceProgressRegistry } = {},
): OpenSupOSUnsEnvelope {
  const lineageContext = options.lineageContext ?? {};
  let payload: Record<string, unknown>;
  if (typeof rawPayload === "string") {
    try {
      payload = JSON.parse(rawPayload) as Record<string, unknown>;
    } catch {
      throw new CanonicalConversionError("CANONICAL_PAYLOAD_NOT_JSON", topic);
    }
  } else {
    payload = rawPayload;
  }

  // ---- Source Progress 分支（真实 canonical progress event） ----
  if (topic === CANONICAL_TOPICS.SOURCE_PROGRESS) {
    const p = payload as unknown as CanonicalSourceProgress;
    const businessKey = requireString(payload, "businessKey", topic);
    const sourceSystem = requireString(payload, "sourceSystem", topic);
    const eventType = requireString(payload, "eventType", topic);
    // §7/§9：live 真值必须来自 canonical 的 sourceProgressAt
    const sourceProgressAt = requireString(payload, "sourceProgressAt", topic);
    const sourceTime = typeof p.sourceTime === "string" && p.sourceTime ? p.sourceTime : sourceProgressAt;

    return {
      schemaVersion: "1.0",
      messageId: `j2-sp-${shortHash({ sourceSystem, eventType, sourceProgressAt, businessKey })}`,
      tenantKey: J2_TENANT_KEY,
      context: { businessKey, contextType: "sales_order" },
      source: {
        systemKey: sourceSystem,
        systemType: sourceSystem.toLowerCase() as OpenSupOSUnsEnvelope["source"]["systemType"],
        externalDocumentId: `${sourceSystem}:PROGRESS:${businessKey}`,
        documentType: SOURCE_PROGRESS_BINDING.documentType,
        sourceVersion: "v1",
      },
      entity: {
        entityType: SOURCE_PROGRESS_BINDING.entityType,
        businessKey: `${sourceSystem}:${businessKey}`,
      },
      event: { eventType: "SOURCE_PROGRESS", occurredAt: sourceProgressAt },
      facts: {
        sourceSystem: { value: sourceSystem, valueType: "string" },
        eventType: { value: eventType, valueType: "string" },
        sourceProgressAt: { value: sourceProgressAt, valueType: "datetime" },
      },
      lineage: { quote: `sourceProgressAt=${sourceProgressAt}`, confidence: 1 },
      metadata: {
        receivedAt: sourceTime,
        recordedAt: sourceTime,
        // 真实 canonical progress event：live 真值入口
        j2: {
          canonicalTopic: topic,
          sourceSystem,
          eventType,
          sourceProgressAt,
          sourceTime,
          timeStamp: typeof p.timeStamp === "number" ? p.timeStamp : null,
        },
      },
    };
  }

  // ---- 四源业务事件分支 ----
  const binding = BINDINGS[topic];
  if (!binding) throw new CanonicalConversionError("CANONICAL_TOPIC_UNKNOWN", topic);

  const businessKey = requireString(payload, "businessKey", topic);
  const sourceTime = requireString(payload, "sourceTime", topic);
  const primaryRef = requireString(payload, binding.primaryRefKey, topic);

  // 各来源数值事实（用真实字段名，缺失即报错）
  const facts: OpenSupOSUnsEnvelope["facts"] = {};
  let quantityField = "";
  let quantityValue = 0;

  if (topic === CANONICAL_TOPICS.ERP) {
    quantityField = "qty";
    quantityValue = requireNumber(payload, "requiredQty", topic);
    facts.qty = { value: quantityValue, valueType: "number" };
    facts.dueAt = { value: requireString(payload, "dueAt", topic), valueType: "datetime" };
  } else if (topic === CANONICAL_TOPICS.MES) {
    quantityField = "completedQty";
    quantityValue = requireNumber(payload, "completedQty", topic);
    facts.completedQty = { value: quantityValue, valueType: "number" };
    facts.state = { value: requireString(payload, "state", topic), valueType: "string" };
  } else if (topic === CANONICAL_TOPICS.QMS) {
    quantityField = "passedQty";
    quantityValue = requireNumber(payload, "releasedQty", topic);
    facts.passedQty = { value: quantityValue, valueType: "number" };
  } else {
    quantityField = "executionCommittedQty";
    quantityValue = requireNumber(payload, "executionCommittedQty", topic);
    facts.executionCommittedQty = { value: quantityValue, valueType: "number" };
  }

  // lineage refs：payload 中真实存在的字段 + 调用方注入的跨源关联
  const lineageBlock: Record<string, string> = { ...buildLineageBlock(binding, payload) };
  if (lineageContext.workOrderRef && !lineageBlock.workOrderRef) lineageBlock.workOrderRef = lineageContext.workOrderRef;
  if (lineageContext.productionLotRef && !lineageBlock.productionLotRef) {
    lineageBlock.productionLotRef = lineageContext.productionLotRef;
  }
  // ERP 自身即 lineage 起点
  if (topic === CANONICAL_TOPICS.ERP) lineageBlock.sourceOrderLineRef = primaryRef;

  // §9 / 边界 #7：该来源当前的**真实 canonical checkpoint**（来自 progress 注册表），
  // 绝不使用本业务事件的 sourceTime 冒充 progress。
  const progressRegistry = options.progressRegistry;
  const sourceSystemKey = binding.systemKey as keyof SourceProgressRegistry;
  const progressForThisSource = progressRegistry ? progressRegistry[sourceSystemKey] ?? "" : "";

  return {
    schemaVersion: "1.0",
    messageId: `j2-${shortHash({ topic, primaryRef, quantityValue, sourceTime })}`,
    tenantKey: J2_TENANT_KEY,
    context: { businessKey, contextType: "sales_order" },
    source: {
      systemKey: binding.systemKey,
      systemType: binding.systemType,
      externalDocumentId: primaryRef,
      documentType: binding.documentType,
      sourceVersion: "v1",
    },
    entity: { entityType: binding.entityType, businessKey: primaryRef },
    event: { eventType: binding.eventType, occurredAt: sourceTime },
    facts,
    lineage: { quote: `${quantityField}=${quantityValue}`, confidence: 1 },
    metadata: {
      receivedAt: sourceTime,
      recordedAt: sourceTime,
      j2: {
        canonicalTopic: topic,
        businessKey,
        primaryRef,
        quantityField,
        quantityValue,
        sourceTime,
      },
      simulation: {
        // lineage：供 factsFromUnsMessages 建立跨源业务关联（真实 ref，不是仿真）
        lineage: lineageBlock,
        // 该来源当前真实 progress checkpoint；未收到 progress 时为空字符串，
        // factsFromUnsMessages 会回退到 occurredAt —— 见 live-runtime 的空值保护。
        sourceProgressAt: progressForThisSource,
      },
    },
  };
}

/** 便捷：解析出 envelope 可承载的 CanonicalPayload 类型（编译期辅助）。 */
export type { CanonicalPayload };
