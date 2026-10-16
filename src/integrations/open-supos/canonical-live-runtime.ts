/**
 * J2 Canonical Live Runtime（§8 / §9 / §11）。
 *
 * 这**不是**新的 ingestion framework：它只是把 open supOS 上真实存在的 canonical topic
 * 接到仓库既有的 UNS 管线：
 *
 *   MQTT(/supos/J2_*) ──► canonicalToEnvelope() ──► OpenSupOSUnsQueue
 *                                                    └─► OpenSuposInboundConnector.readPage()
 *                                                          └─► OpenSuposSourceAdapter.adapt()
 *
 * 同时维护 §9 的**真实** source progress 注册表（只由 `/supos/J2_SourceProgress` 驱动），
 * 并把 envelope 流交给既有 `factsFromUnsMessages` 计算 live 事实 —— 不复制 evaluator。
 *
 * 边界：不修改 UNS_TOPIC_PREFIXES；不新建 event bus / runtime framework；
 *       A-E Reference Cases 与 live 结果分离（§11）。
 */

import {
  CANONICAL_TOPICS,
  J2_NODERED_FLOW_ID,
  J2_TENANT_KEY,
  RUNTIME_TRUTH_BOUNDARY,
  type CanonicalTopic,
} from "./canonical-contract.js";
import {
  advanceProgressRegistry,
  canonicalToEnvelope,
  emptyProgressRegistry,
  type LineageContext,
  type SourceProgressRegistry,
} from "./canonical-live-adapter.js";
import { OpenSupOSUnsQueue } from "./connector.js";
import type { UnsTransport } from "./transport.js";
import type { OpenSupOSUnsEnvelope } from "./types.js";

/** live 模式下 Sentinel 允许消费的 canonical topic（RAW 一律不消费，§6）。 */
export const CANONICAL_CONSUMED_TOPICS: CanonicalTopic[] = [
  CANONICAL_TOPICS.ERP,
  CANONICAL_TOPICS.MES,
  CANONICAL_TOPICS.QMS,
  CANONICAL_TOPICS.WMS,
  CANONICAL_TOPICS.SOURCE_PROGRESS,
];

export type CanonicalObservation = {
  topic: CanonicalTopic;
  envelope: OpenSupOSUnsEnvelope;
  /** 是否为真实 canonical progress event */
  isSourceProgress: boolean;
  receivedAt: string;
};

/** lineage 链的四条 relation（与既有 JudgeContractFacts 的四个 ref 字段一一对应）。 */
export type RelationKey =
  | "sourceOrderLineRef"
  | "workOrderRef"
  | "productionLotRef"
  | "shipmentSourceRef";

export const LINEAGE_RELATION_KEYS: RelationKey[] = [
  "sourceOrderLineRef",
  "workOrderRef",
  "productionLotRef",
  "shipmentSourceRef",
];

/** 一条 relation 的单次跨来源声明：某来源在某 canonical 事件里声明「这条链的该环节是这个值」。 */
export type RelationObservation = {
  key: RelationKey;
  value: string;
  declaredBy: string;
  topic: string;
};

/**
 * lineage 解析结果（J2-R1.1 语义收口）。
 *
 * RESOLVED 的唯一条件：四条 relation 的**全部跨来源声明**各自聚合出恰好一个唯一值 ——
 * 即 ERP.orderLineRef == MES.orderLineRef（sourceOrderLineRef 由 ERP/MES/WMS 三方声明）、
 * MES.productionLotRef == QMS.productionLotRef、
 * ERP.orderLineRef == WMS.sourceOrderLineRef，
 * 同时 workOrderRef（MES.productionOrderRef）、shipmentSourceRef（WMS.shipmentLineRef）
 * 作为链的实际引用各自有唯一值。
 * 与消息到达顺序无关：不做 `||=` 式的先到先得聚合。
 */
export type LineageResolution =
  | { status: "RESOLVED"; relations: Record<RelationKey, string> }
  | { status: "NOT_EVALUABLE"; detail: string };

/**
 * 最小确定性 relation validation：
 *   - 某条 relation 无任何非空声明 → `missing relation`
 *   - 某条 relation 存在 ≥2 个不同声明值 → `mismatched relation`
 *     （当前单值数据结构无法区分 ambiguous 与 mismatched：多个候选值即视为冲突）
 *   - 每条 relation 恰好一个唯一值 → RESOLVED
 */
export function resolveLineage(observations: RelationObservation[]): LineageResolution {
  const byKey = new Map<RelationKey, Map<string, string[]>>();
  for (const observation of observations) {
    if (typeof observation.value !== "string" || !observation.value) continue;
    let values = byKey.get(observation.key);
    if (!values) {
      values = new Map<string, string[]>();
      byKey.set(observation.key, values);
    }
    const declarers = values.get(observation.value) ?? [];
    declarers.push(observation.declaredBy);
    values.set(observation.value, declarers);
  }
  const relations = {} as Record<RelationKey, string>;
  for (const key of LINEAGE_RELATION_KEYS) {
    const values = byKey.get(key);
    if (!values || values.size === 0) {
      return { status: "NOT_EVALUABLE", detail: `missing relation: ${key}` };
    }
    if (values.size > 1) {
      const candidates = [...values.entries()]
        .map(([value, declarers]) => `${JSON.stringify(value)}(${declarers.join("/")})`)
        .join(" vs ");
      return { status: "NOT_EVALUABLE", detail: `mismatched relation: ${key} ${candidates}` };
    }
    relations[key] = [...values.keys()][0]!;
  }
  return { status: "RESOLVED", relations };
}

export type J2LiveRuntimeState = {
  /** 真实 canonical progress 注册表（per-source，§9） */
  progress: SourceProgressRegistry;
  /** 收到的全部 canonical envelope（既有队列的同源事实） */
  observations: CanonicalObservation[];
  /** 跨源 lineage（由 MES 建立 workOrderRef / productionLotRef） */
  lineageContext: LineageContext;
  /** 每条业务事件的 relation 声明（供 resolveLineage 做确定性校验，J2-R1.1） */
  relationObservations: RelationObservation[];
};

/**
 * 从 payload 真实字段派生 lineageContext（不编造：字段缺失即不注入）。
 */
function deriveLineageContext(payload: Record<string, unknown>, current: LineageContext): LineageContext {
  const next: LineageContext = { ...current };
  if (typeof payload.productionOrderRef === "string" && payload.productionOrderRef) {
    next.workOrderRef = payload.productionOrderRef;
  }
  if (typeof payload.productionLotRef === "string" && payload.productionLotRef) {
    next.productionLotRef = payload.productionLotRef;
  }
  return next;
}

export class J2CanonicalLiveRuntime {
  readonly queue = new OpenSupOSUnsQueue();
  readonly state: J2LiveRuntimeState = {
    progress: emptyProgressRegistry(),
    observations: [],
    lineageContext: {},
    relationObservations: [],
  };

  constructor(private readonly options: { now?: () => Date } = {}) {}

  private now() {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  /**
   * 消费一条 canonical 消息。
   *
   * 返回 envelope（供上层审计 / SourceCard 展示 real sourceSystem/canonicalTopic/sourceTime）。
   * RAW topic 会被显式拒绝 —— Sentinel 只消费 canonical（§6）。
   */
  ingest(topic: string, rawPayload: string): CanonicalObservation {
    if (!CANONICAL_CONSUMED_TOPICS.includes(topic as CanonicalTopic)) {
      throw new Error(`J2_LIVE_RUNTIME_TOPIC_NOT_CONSUMED:${topic}`);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawPayload) as Record<string, unknown>;
    } catch {
      throw new Error(`J2_LIVE_RUNTIME_PAYLOAD_NOT_JSON:${topic}`);
    }

    const canonicalTopic = topic as CanonicalTopic;
    const isSourceProgress = canonicalTopic === CANONICAL_TOPICS.SOURCE_PROGRESS;

    // §9：真实 progress 只由 canonical progress event 推进
    if (isSourceProgress) {
      advanceProgressRegistry(this.state.progress, {
        sourceSystem: String(parsed.sourceSystem ?? ""),
        sourceProgressAt: String(parsed.sourceProgressAt ?? ""),
      });
    } else {
      this.state.lineageContext = deriveLineageContext(parsed, this.state.lineageContext);
    }

    const envelope = canonicalToEnvelope(canonicalTopic, parsed, {
      lineageContext: this.state.lineageContext,
      progressRegistry: this.state.progress,
    });

    // 进入仓库既有队列（既有 connector / SourceAdapter 继续消费）
    this.queue.push({ topic: canonicalTopic, payload: rawPayload, envelope });

    // J2-R1.1：记录本事件对 lineage 链的**显式 relation 声明**（来自 payload 真实字段，
    // adapter 只做 rename、缺失不写）。每个声明都被保留 —— 关系成立与否由
    // resolveLineage 聚合全部声明后判定，与消息到达顺序无关。
    if (!isSourceProgress) {
      const declaredBy = String(envelope.source.systemType ?? "").toUpperCase();
      const simulationBlock = (envelope.metadata?.simulation ?? {}) as Record<string, unknown>;
      const lineageBlock = (simulationBlock.lineage ?? {}) as Record<string, unknown>;
      for (const key of LINEAGE_RELATION_KEYS) {
        const value = lineageBlock[key];
        if (typeof value === "string" && value) {
          this.state.relationObservations.push({ key, value, declaredBy, topic: canonicalTopic });
        }
      }
    }

    const observation: CanonicalObservation = {
      topic: canonicalTopic,
      envelope,
      isSourceProgress,
      receivedAt: this.now(),
    };
    this.state.observations.push(observation);
    return observation;
  }

  /** 订阅真实 canonical topics（扩展现有 UnsTransport，不新建框架）。 */
  async subscribe(transport: UnsTransport) {
    for (const topic of CANONICAL_CONSUMED_TOPICS) {
      await transport.subscribe(topic, (receivedTopic, payload) => {
        this.ingest(receivedTopic, payload);
      });
    }
  }

  /** 既有队列的同源事实（供既有 factsFromUnsMessages / connector 消费）。 */
  envelopesForJudge(): Array<{ payload: string }> {
    return this.state.observations.map((item) => ({ payload: JSON.stringify(item.envelope) }));
  }

  /** §7 Runtime Truth Boundary + §6 契约冻结信息。 */
  truthBoundary() {
    return {
      ...RUNTIME_TRUTH_BOUNDARY,
      tenantKey: J2_TENANT_KEY,
      nodeRedFlowId: J2_NODERED_FLOW_ID,
      canonicalTopics: CANONICAL_CONSUMED_TOPICS,
    };
  }
}
