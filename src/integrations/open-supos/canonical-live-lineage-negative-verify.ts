/**
 * J2-R1.1 lineage 语义收口 —— 两个真实反例（真实 open supOS Runtime）。
 *
 * 真实链路：RAW MQTT → EMQX → Node-RED J2 flow → canonical /supos/J2_*
 *          → J2CanonicalLiveRuntime.relationObservations → resolveLineage
 *          → evaluateLiveJudge
 *
 * 反例 A（missing relation）：ERP/MES/QMS 事实 + progress 全部就绪，唯一缺 WMS 事件
 *   → shipmentSourceRef 没有任何来源声明过
 *   → 必须 NOT_EVALUABLE:BUSINESS_IDENTITY_UNRESOLVED
 * 反例 B（mismatched relation）：四源事实 + progress 全部就绪（数量上足以构成
 *   FULFILLMENT_STATE_CONFLICT），但 MES.orderLineRef ≠ ERP.orderLineRef，
 *   且**先发 MES 再发 ERP**（证明不依赖消息先后顺序的先到先得）
 *   → sourceOrderLineRef 聚合出两个不同声明值
 *   → 必须 NOT_EVALUABLE:BUSINESS_IDENTITY_UNRESOLVED，不能进入 FULFILLMENT_STATE_CONFLICT
 *
 * 用法：tsx src/integrations/open-supos/canonical-live-lineage-negative-verify.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { J2CanonicalLiveRuntime } from "./canonical-live-runtime.js";
import { evaluateLiveJudge } from "./canonical-live-judge.js";
import { CANONICAL_TOPICS } from "./canonical-contract.js";

function mqttConnection(clientId: string) {
  const url = process.env.J2_MQTT_URL?.trim();
  if (!url) throw new Error("J2_MQTT_URL_REQUIRED");
  const username = process.env.J2_MQTT_USERNAME?.trim();
  const password = process.env.J2_MQTT_PASSWORD;
  return {
    url,
    endpoint: new URL(url).host,
    options: { clientId, ...(username ? { username } : {}), ...(password ? { password } : {}) },
  };
}
const RAW = {
  erp: "/source/j2/erp/order-line",
  mes: "/source/j2/mes/production",
  qms: "/source/j2/qms/quality",
  wms: "/source/j2/wms/shipment",
  pErp: "/source/j2/progress/erp",
  pMes: "/source/j2/progress/mes",
  pQms: "/source/j2/progress/qms",
  pWms: "/source/j2/progress/wms",
};

const BIZ = "SO-IND-001";
const DUE_AT = "2026-03-01T06:00:00.000Z";
const AT_0700 = "2026-03-01T07:00:00.000Z";

const erp = () => ({
  business_key: BIZ,
  order_line_ref: `ERP:${BIZ}:LINE-01`,
  required_qty: 100,
  due_at: DUE_AT,
  event_time: "2026-03-01T05:00:00.000Z",
});
/** badIdentity：order_line_ref 指向不存在的订单行（反例 B 的 mismatch 来源） */
const mes = (badIdentity = false) => ({
  business_key: BIZ,
  production_order_ref: "MES:WO-IND-001",
  order_line_ref: badIdentity ? "ERP:SO-IND-999:LINE-01" : `ERP:${BIZ}:LINE-01`,
  production_lot_ref: "MES:LOT-IND-001",
  completed_qty: 96,
  state: "completed",
  event_time: "2026-03-01T05:30:00.000Z",
});
const qms = () => ({
  business_key: BIZ,
  quality_lot_ref: "QMS:QI-IND-001",
  production_lot_ref: "MES:LOT-IND-001",
  released_qty: 96,
  event_time: "2026-03-01T05:45:00.000Z",
});
const wms = () => ({
  business_key: BIZ,
  shipment_line_ref: "WMS:SHIP-IND-001",
  source_order_line_ref: `ERP:${BIZ}:LINE-01`,
  execution_committed_qty: 100,
  event_time: "2026-03-01T05:50:00.000Z",
});
const prog = (at: string) => ({
  business_key: BIZ,
  event_type: "SOURCE_PROGRESS",
  source_progress_at: at,
  event_time: at,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PhaseResult = {
  caseId: string;
  expect: string;
  status: string;
  lineage: { status: string; relation: string };
  reason: string;
  relationObservations: Array<{ key: string; value: string; declaredBy: string; topic: string }>;
  pass: boolean;
};

async function main() {
  const mqtt = await import("mqtt");
  const connection = mqttConnection(`j2-lineage-neg-${Date.now()}`);
  const client = mqtt.connect(connection.url, connection.options);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MQTT_CONNECT_TIMEOUT")), 15000);
    client.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    client.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  for (const topic of Object.values(CANONICAL_TOPICS) as string[]) {
    await new Promise<void>((resolve, reject) =>
      client.subscribe(topic, (error: Error | null) => (error ? reject(error) : resolve())),
    );
  }
  console.log(`[SENTINEL] 订阅 ${Object.keys(CANONICAL_TOPICS).length} 个 canonical topic @ ${connection.endpoint}`);

  const runtimeA = new J2CanonicalLiveRuntime();
  const runtimeB = new J2CanonicalLiveRuntime();

  // 当前阶段：A / B / done —— canonical 消息只喂给当前阶段的 runtime
  let phase: "A" | "B" | "done" = "A";
  client.on("message", (topic: string, payload: Buffer) => {
    const target = phase === "A" ? runtimeA : phase === "B" ? runtimeB : null;
    if (!target) return;
    try {
      target.ingest(topic, payload.toString("utf8"));
    } catch (error) {
      console.error(`[INGEST-ERROR] ${topic}: ${(error as Error).message}`);
    }
  });

  const publish = async (topic: string, payload: unknown) => {
    await new Promise<void>((resolve, reject) =>
      client.publish(topic, JSON.stringify(payload), (error?: Error) => (error ? reject(error) : resolve())),
    );
    await sleep(120);
  };

  const runPhase = async (
    caseId: string,
    expect: string,
    batch: Array<[string, unknown]>,
    target: J2CanonicalLiveRuntime,
  ): Promise<PhaseResult> => {
    console.log(`\n=== ${caseId} — ${expect} ===`);
    for (const [topic, payload] of batch) await publish(topic, payload);
    await sleep(2500);
    const evaluation = evaluateLiveJudge(target);
    const relationObservations = target.state.relationObservations.map((item) => ({
      key: item.key,
      value: item.value,
      declaredBy: item.declaredBy,
      topic: item.topic,
    }));
    console.log(`  status          = ${evaluation.status}`);
    console.log(`  lineage         = ${evaluation.lineage.status}`);
    console.log(`  lineage.detail  = ${evaluation.lineage.relation}`);
    console.log(`  reason          = ${evaluation.reason}`);
    console.log(`  relations seen  = ${JSON.stringify(relationObservations)}`);
    return {
      caseId,
      expect,
      status: evaluation.status,
      lineage: evaluation.lineage,
      reason: evaluation.reason,
      relationObservations,
      pass: evaluation.status === "NOT_EVALUABLE:BUSINESS_IDENTITY_UNRESOLVED",
    };
  };

  // ---- 反例 A：只缺一个 relation（WMS 不发 → shipmentSourceRef 无声明） ----
  phase = "A";
  const resultA = await runPhase(
    "NEG-A:missing-relation",
    "ERP/MES/QMS + progress 就绪、缺 WMS → missing relation: shipmentSourceRef → NOT_EVALUABLE",
    [
      [RAW.erp, erp()],
      [RAW.mes, mes(false)],
      [RAW.qms, qms()],
      [RAW.pErp, prog(AT_0700)],
      [RAW.pMes, prog(AT_0700)],
      [RAW.pQms, prog(AT_0700)],
    ],
    runtimeA,
  );

  // ---- 反例 B：全字段有值但 MES.orderLineRef != ERP.orderLineRef ----
  // MES 先发（携带错误 orderLineRef），ERP/WMS 后发 → 顺序无关，仍必须判 mismatch。
  phase = "B";
  const resultB = await runPhase(
    "NEG-B:mismatched-relation",
    "四源 + progress 就绪但 MES.orderLineRef ≠ ERP.orderLineRef → mismatched relation: sourceOrderLineRef → NOT_EVALUABLE",
    [
      [RAW.mes, mes(true)],
      [RAW.erp, erp()],
      [RAW.qms, qms()],
      [RAW.wms, wms()],
      [RAW.pErp, prog(AT_0700)],
      [RAW.pMes, prog(AT_0700)],
      [RAW.pQms, prog(AT_0700)],
      [RAW.pWms, prog(AT_0700)],
    ],
    runtimeB,
  );
  phase = "done";

  const allPass = resultA.pass && resultB.pass;
  const outDir = resolve(process.env.J2_ARTIFACT_DIR?.trim() || "./artifacts");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "j2-live-lineage-negative-report.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        mode: "live-negative",
        allPass,
        cases: [resultA, resultB],
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\n[REPORT] ${outPath}`);
  console.log(`[VERDICT] NEG-A ${resultA.pass ? "PASS" : "FAIL"} / NEG-B ${resultB.pass ? "PASS" : "FAIL"} → ${allPass ? "ALL PASS" : "FAILED"}`);

  await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
  if (!allPass) process.exit(1);
}

main().catch((error) => {
  console.error("[FATAL]", error instanceof Error && error.message === "J2_MQTT_URL_REQUIRED" ? "J2_MQTT_URL_REQUIRED" : "OPEN_SUPOS_VERIFY_FAILED");
  process.exit(1);
});
