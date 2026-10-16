/**
 * BACKEND-R1 —— 履约哨兵 live 会话（server 内单例）。
 *
 * **只做接线，不做框架**：把已有的
 *   `J2CanonicalLiveRuntime` + 已有 disposition 语义 + 已有真实 RAW 路径
 * 组合成一个 server 进程内的单例会话，供 Product View / 处置 / 模拟执行三个
 * 薄 endpoint 使用。
 *
 * 不新建：EventBus / Repository / StateMachine / Connector / 数据库表 / 新服务（§1）。
 *
 * 真实链路（§7/§8）：
 *   RAW MQTT `/source/j2/*` → EMQX → Node-RED flow 06159bb21ff3a699
 *   → canonical `/supos/J2_*` → 本会话的 J2CanonicalLiveRuntime
 *   → 既有 factsFromUnsMessages → 既有 evaluate() → Product View
 *
 * WMS 模拟执行**不直接 UPDATE state**：它只往真实 RAW topic 发一条
 * executionCommittedQty=96 的事件（外加 progress 推进），后续全部由真实
 * open supOS Runtime 走完。若 MQTT 不可达则**如实失败**，不本地伪造。
 */

import { randomUUID } from "node:crypto";
import { evaluateLiveJudge, type LiveJudgeEvaluation } from "./canonical-live-judge.js";
import { J2CanonicalLiveRuntime } from "./canonical-live-runtime.js";
import { toLiveFulfillmentView } from "./canonical-live-view.js";
import { CANONICAL_TOPICS, RAW_TOPICS } from "./canonical-contract.js";
import { buildProductView, type ProductView } from "./product-view.js";
import type { JudgeDisposition } from "../../demo/judge/contract.js";
import type { LiveFulfillmentView } from "../../demo/judge/manifest.js";

const MQTT_URL = () => process.env.J2_MQTT_URL?.trim() || process.env.OPEN_SUPOS_MQTT_URL?.trim() || "";

const BIZ = "SO-IND-001";
const DUE_AT = "2026-03-01T06:00:00.000Z";
const AT_0800 = "2026-03-01T08:00:00.000Z";

/** §15 既有内部处置权威（不新增 policy engine）。 */
export const SHORT_SHIPMENT_DISPOSITION: JudgeDisposition = {
  status: "AUTHORIZED_SHORT_SHIPMENT_96",
  authorizedQty: 96,
  authority: "DEMO_POLICY_DUAL_ROLE",
};

const NONE_DISPOSITION: JudgeDisposition = { status: "none", authorizedQty: null, authority: "none" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type MqttClient = import("mqtt").MqttClient;

export type SessionSummary = {
  connected: boolean;
  businessKey: string;
  disposition: JudgeDisposition;
  observations: number;
  mqttUrl: string;
};

export class FulfillmentLiveSession {
  readonly runtime = new J2CanonicalLiveRuntime();
  private client: MqttClient | null = null;
  private connecting: Promise<void> | null = null;
  private disposition: JudgeDisposition = NONE_DISPOSITION;
  /** §8：复验通过标志 —— 由**真实观察到的** WMS=96 + 四源共同水位推进推出，不由调用方指定 */
  private closedAfterRevalidation = false;
  private lastAction: { kind: string; at: string; detail: string } | null = null;
  readonly sessionId = randomUUID();

  /** 幂等连接：重复调用共用同一个连接 promise。MQTT 不可达时如实抛出。 */
  async connect(): Promise<void> {
    if (!MQTT_URL()) throw new Error("J2_MQTT_URL_REQUIRED");
    if (this.client?.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const mqtt = await import("mqtt");
      const client = mqtt.connect(MQTT_URL(), {
        clientId: `sentinel-product-${this.sessionId.slice(0, 8)}`,
        reconnectPeriod: 0,
        connectTimeout: 8000,
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("MQTT_CONNECT_TIMEOUT")), 12_000);
        client.once("connect", () => {
          clearTimeout(timer);
          resolve();
        });
        client.once("error", (error: Error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      for (const topic of Object.values(CANONICAL_TOPICS) as string[]) {
        await new Promise<void>((resolve, reject) =>
          client.subscribe(topic, (error: Error | null) => (error ? reject(error) : resolve())),
        );
      }
      client.on("message", (topic: string, payload: Buffer) => {
        try {
          this.runtime.ingest(topic, payload.toString("utf8"));
        } catch (error) {
          // 非 canonical / 非本 bizKey 的消息按设计被拒；不静默吞掉
          if (!String((error as Error).message).includes("TOPIC_NOT_CONSUMED")) {
            console.warn(`[sentinel] ingest skip ${topic}: ${(error as Error).message}`);
          }
        }
      });
      this.client = client;
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  get isConnected() {
    return Boolean(this.client?.connected);
  }

  /**
   * 惰性确保已连接（幂等）。
   *
   * 只读 GET 不应该因为 MQTT 不可达而失败，所以这里**吞掉连接错误**并返回是否连通；
   * 需要真实副作用的动作（simulate-wms-execution）才把错误抛给调用方。
   */
  async ensureConnected(): Promise<boolean> {
    try {
      await this.connect();
      return this.isConnected;
    } catch {
      return false;
    }
  }

  summary(): SessionSummary {
    return {
      connected: this.isConnected,
      businessKey: BIZ,
      disposition: this.disposition,
      observations: this.runtime.state.observations.length,
      mqttUrl: MQTT_URL(),
    };
  }

  /** 既有 evaluateLiveJudge —— 不加第二套判定逻辑。 */
  evaluate(): LiveJudgeEvaluation {
    this.closedAfterRevalidation = this.deriveClosed();
    return evaluateLiveJudge(this.runtime, this.disposition, this.closedAfterRevalidation);
  }

  /**
   * §8 关闭条件的**观察式**推导（不是调用方传参）：
   *   WMS 新事实 = 96 且 四源共同水位 >= 交期+宽限 且 已授权处置。
   * 满足时才允许 REVALIDATED_CLOSED。
   */
  private deriveClosed(): boolean {
    const evaluation = evaluateLiveJudge(this.runtime, this.disposition, false);
    const facts = evaluation.facts;
    const watermark = Object.values(facts.sourceProgress).sort()[0] ?? "";
    const ready = watermark >= evaluation.dueAtWithGrace && watermark !== "";
    const wmsSettled = facts.executionCommittedQty === this.disposition.authorizedQty
      && facts.executionCommittedQty > 0;
    return this.disposition.status !== "none" && ready && wmsSettled;
  }

  productView(): ProductView {
    return buildProductView(this.runtime, this.evaluate());
  }

  liveView(): LiveFulfillmentView {
    return toLiveFulfillmentView(this.evaluate(), this.runtime);
  }

  lastActionOf() {
    return this.lastAction;
  }

  /**
   * 演示复位：清空**本会话**已积累的 canonical 观测与内部处置。
   *
   * 只重置内存中的会话状态（observations / disposition / 复验标志），
   * 不动任何真实系统、不动数据库、不发 MQTT —— 演示需要可重复时使用。
   */
  reset(): SessionSummary {
    this.runtime.state.observations.length = 0;
    this.runtime.state.relationObservations.length = 0;
    this.runtime.state.lineageContext = {};
    for (const key of Object.keys(this.runtime.state.progress) as Array<keyof typeof this.runtime.state.progress>) {
      this.runtime.state.progress[key] = "";
    }
    this.disposition = NONE_DISPOSITION;
    this.closedAfterRevalidation = false;
    this.lastAction = null;
    return this.summary();
  }

  /**
   * §6 确认处置：复用既有 disposition 语义。
   *
   * 只改**内部处置**，不触碰任何来源事实 —— WMS 仍然 = 100，
   * approval != reality changed。
   */
  confirmDisposition(): ProductView {
    this.disposition = SHORT_SHIPMENT_DISPOSITION;
    this.lastAction = {
      kind: "confirm_disposition",
      at: new Date().toISOString(),
      detail: "AUTHORIZED_SHORT_SHIPMENT_96 by DEMO_POLICY_DUAL_ROLE（仅内部处置，来源事实未变）",
    };
    return this.productView();
  }

  /**
   * §7 模拟仓库执行：**不 UPDATE state**，只发真实 RAW 事件。
   *
   * 同一条链路：RAW executionCommittedQty=96 → EMQX → Node-RED → canonical
   * → runtime → 既有 factsFromUnsMessages → 既有 evaluate。
   *
   * 并推进 WMS 来源进度（让共同水位满足关闭条件）。
   * MQTT 不可达时抛出，路由层返回 503 —— 不允许本地伪造 96。
   */
  async simulateWmsExecution(qty = 96): Promise<{ published: Array<{ topic: string; payload: unknown }>; productView: ProductView }> {
    await this.connect();
    if (!this.client?.connected) throw new Error("MQTT_NOT_CONNECTED");

    const batch: Array<[string, unknown]> = [
      [
        RAW_TOPICS.WMS,
        {
          business_key: BIZ,
          shipment_line_ref: "WMS:SHIP-IND-001",
          source_order_line_ref: `ERP:${BIZ}:LINE-01`,
          execution_committed_qty: qty,
          event_time: "2026-03-01T05:50:00.000Z",
        },
      ],
      // §8 source progress advance：让四源共同水位满足关闭条件
      [RAW_TOPICS.PROGRESS_ERP, progress(AT_0800)],
      [RAW_TOPICS.PROGRESS_MES, progress(AT_0800)],
      [RAW_TOPICS.PROGRESS_QMS, progress(AT_0800)],
      [RAW_TOPICS.PROGRESS_WMS, progress(AT_0800)],
    ];

    for (const [topic, payload] of batch) {
      await new Promise<void>((resolve, reject) =>
        this.client!.publish(topic, JSON.stringify(payload), (error?: Error) => (error ? reject(error) : resolve())),
      );
      await sleep(120);
    }

    // 等真实 runtime 走完 EMQX → Node-RED → canonical（本机实测约 2s 内）
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      await sleep(400);
      const wms = this.runtime.state.observations.filter(
        (item) => item.envelope.source.systemType === "wms" && item.envelope.facts.executionCommittedQty?.value === qty,
      );
      if (wms.length) break;
    }
    await sleep(600);

    this.lastAction = {
      kind: "simulate_wms_execution",
      at: new Date().toISOString(),
      detail: `RAW WMS executionCommittedQty=${qty} → EMQX → Node-RED → canonical → runtime`,
    };

    return {
      published: batch.map(([topic, payload]) => ({ topic, payload })),
      productView: this.productView(),
    };
  }
}

function progress(at: string) {
  return { business_key: BIZ, event_type: "SOURCE_PROGRESS", source_progress_at: at, event_time: at };
}

const SESSION_KEY = Symbol.for("fulfillment.sentinel.session");

/**
 * server 内单例（同进程复用，避免多连接互相抢同一组 canonical topic）。
 * 使用 Symbol.for 挂在 globalThis 上，防止 tsx dev 热重载产生多份会话。
 */
export function getLiveSession(): FulfillmentLiveSession {
  const holder = globalThis as unknown as Record<symbol, FulfillmentLiveSession | undefined>;
  let session = holder[SESSION_KEY];
  if (!session) {
    session = new FulfillmentLiveSession();
    holder[SESSION_KEY] = session;
  }
  return session;
}

export { BIZ as PRODUCT_BUSINESS_KEY, DUE_AT as PRODUCT_DUE_AT };
