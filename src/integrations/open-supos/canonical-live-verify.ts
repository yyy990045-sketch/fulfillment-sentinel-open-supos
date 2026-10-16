/**
 * §13-17 Live Runtime 五轮状态流转验证（真实 open supOS Runtime）。
 *
 * 真实链路：RAW MQTT → EMQX → Node-RED J2 flow → canonical /supos/J2_*
 *          → J2CanonicalLiveRuntime（既有队列 + 既有 factsFromUnsMessages + 既有 evaluate）
 *
 * 本脚本以**持久订阅**方式接入，按轮次写入 RAW，并在每轮后打印 live 判定。
 * 不使用任何 bypass：不改 local state、不直接调用 evaluator 篡改事实。
 *
 * 用法：tsx src/integrations/open-supos/canonical-live-verify.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { J2CanonicalLiveRuntime } from "./canonical-live-runtime.js";
import { evaluateLiveJudge } from "./canonical-live-judge.js";
import { toLiveFulfillmentView } from "./canonical-live-view.js";
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
const QMS_BEFORE = "2026-03-01T00:00:00.000Z";
const AT_0700 = "2026-03-01T07:00:00.000Z";
const AT_0800 = "2026-03-01T08:00:00.000Z";

const erp = (qty = 100) => ({
  business_key: BIZ,
  order_line_ref: `ERP:${BIZ}:LINE-01`,
  required_qty: qty,
  due_at: DUE_AT,
  event_time: "2026-03-01T05:00:00.000Z",
});
const mes = (qty = 100) => ({
  business_key: BIZ,
  production_order_ref: "MES:WO-IND-001",
  order_line_ref: `ERP:${BIZ}:LINE-01`,
  production_lot_ref: "MES:LOT-IND-001",
  completed_qty: qty,
  state: "completed",
  event_time: "2026-03-01T05:30:00.000Z",
});
const qms = (qty = 100) => ({
  business_key: BIZ,
  quality_lot_ref: "QMS:QI-IND-001",
  production_lot_ref: "MES:LOT-IND-001",
  released_qty: qty,
  event_time: "2026-03-01T05:45:00.000Z",
});
const wms = (qty = 100) => ({
  business_key: BIZ,
  shipment_line_ref: "WMS:SHIP-IND-001",
  source_order_line_ref: `ERP:${BIZ}:LINE-01`,
  execution_committed_qty: qty,
  event_time: "2026-03-01T05:50:00.000Z",
});
const prog = (at: string) => ({
  business_key: BIZ,
  event_type: "SOURCE_PROGRESS",
  source_progress_at: at,
  event_time: at,
});

type Round = { id: string; label: string; batch: Array<[string, unknown]> };

const ROUNDS: Round[] = [
  {
    id: "R1",
    label: "§13 首轮：四源 100 + Progress(ERP/MES/WMS 07:00, QMS 00:00)",
    batch: [
      [RAW.erp, erp(100)],
      [RAW.mes, mes(100)],
      [RAW.qms, qms(100)],
      [RAW.wms, wms(100)],
      [RAW.pErp, prog(AT_0700)],
      [RAW.pMes, prog(AT_0700)],
      [RAW.pQms, prog(QMS_BEFORE)],
      [RAW.pWms, prog(AT_0700)],
    ],
  },
  {
    id: "R2",
    label: "§14 MES/QMS 报出 96 + QMS Progress 推进到 07:00 → 共同水位就绪、出现真冲突",
    batch: [
      [RAW.mes, mes(96)],
      [RAW.qms, qms(96)],
      [RAW.pQms, prog(AT_0700)],
    ],
  },
  {
    id: "R3",
    label: "§16 WMS96 再走真实 open supOS（RAW → canonical）",
    batch: [[RAW.wms, wms(96)]],
  },
  {
    id: "R4",
    label: "§17 四源 progress 推进到 08:00 → revalidation",
    batch: [
      [RAW.pErp, prog(AT_0800)],
      [RAW.pMes, prog(AT_0800)],
      [RAW.pQms, prog(AT_0800)],
      [RAW.pWms, prog(AT_0800)],
    ],
  },
];

/**
 * §15 内部处置：使用现有 DEMO_POLICY_DUAL_ROLE 权威，
 * 创建 approved short shipment 96。审批**不能**直接把状态变成 Closed。
 */
const DISPOSITION = {
  status: "AUTHORIZED_SHORT_SHIPMENT_96" as const,
  authorizedQty: 96,
  authority: "DEMO_POLICY_DUAL_ROLE" as const,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const runtime = new J2CanonicalLiveRuntime();
  const mqtt = await import("mqtt");
  const connection = mqttConnection(`j2-sentinel-${Date.now()}`);
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

  for (const topic of Object.values(CANONICAL_TOPICS).concat() as string[]) {
    await new Promise<void>((resolve, reject) =>
      client.subscribe(topic, (error: Error | null) => (error ? reject(error) : resolve())),
    );
  }
  client.on("message", (topic: string, payload: Buffer) => {
    try {
      runtime.ingest(topic, payload.toString("utf8"));
    } catch (error) {
      console.error(`[INGEST-ERROR] ${topic}: ${(error as Error).message}`);
    }
  });
  console.log(`[SENTINEL] 订阅 ${Object.values(CANONICAL_TOPICS).length} 个 canonical topic @ ${connection.endpoint}`);

  const report: Array<Record<string, unknown>> = [];
  let disposition = { status: "none" as "none" | "AUTHORIZED_SHORT_SHIPMENT_96", authorizedQty: null as number | null, authority: "none" as "none" | "DEMO_POLICY_DUAL_ROLE" };

  const emit = (roundId: string, label: string, closedAfterRevalidation = false) => {
    const evaluation = evaluateLiveJudge(runtime, disposition, closedAfterRevalidation);
    console.log(`\n--- ${roundId} ${label} ---`);
    console.log(`  status          = ${evaluation.status}`);
    console.log(`  facts           = required=${evaluation.facts.requiredQty} completed=${evaluation.facts.completedQty} released=${evaluation.facts.releasedQty} committed=${evaluation.facts.executionCommittedQty}`);
    console.log(`  sourceProgress  = ${JSON.stringify(evaluation.sourceProgress)}`);
    console.log(`  globalWatermark = ${evaluation.globalWatermark || "(empty)"}  dueAtWithGrace=${evaluation.dueAtWithGrace}`);
    console.log(`  lineage         = ${evaluation.lineage.status}`);
    console.log(`  reason          = ${evaluation.reason}`);
    report.push({
      round: roundId,
      label,
      status: evaluation.status,
      facts: evaluation.facts,
      globalWatermark: evaluation.globalWatermark,
      dueAtWithGrace: evaluation.dueAtWithGrace,
      lineage: evaluation.lineage,
      disposition: evaluation.disposition,
      observations: evaluation.observations,
      reason: evaluation.reason,
      externalObligation: evaluation.externalObligation,
    });
    return evaluation;
  };

  const publish = async (topic: string, payload: unknown) => {
    await new Promise<void>((resolve, reject) =>
      client.publish(topic, JSON.stringify(payload), (error?: Error) => (error ? reject(error) : resolve())),
    );
    await sleep(120);
  };

  for (const round of ROUNDS) {
    console.log(`\n=== ${round.id} — ${round.label} ===`);
    for (const [topic, payload] of round.batch) await publish(topic, payload);
    await sleep(1800);
    // §17：R4 后进入复验（新来源事实到达、共同水位推进、冲突消解）
    emit(round.id, round.label, round.id === "R4");

    // §15：R2 产生真冲突后，走现有 DEMO_POLICY_DUAL_ROLE 处置
    if (round.id === "R2") {
      disposition = { status: "AUTHORIZED_SHORT_SHIPMENT_96", authorizedQty: 96, authority: "DEMO_POLICY_DUAL_ROLE" };
      console.log(`\n=== §15 Disposition ===`);
      console.log(`  已授权内部短交处置：AUTHORIZED_SHORT_SHIPMENT_96 (96 件) by DEMO_POLICY_DUAL_ROLE`);
      emit("DISPOSITION", "§15 内部处置（审批不改变 WMS 现实执行）");
    }
  }

  const outDir = resolve(process.env.J2_ARTIFACT_DIR?.trim() || "./artifacts");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "j2-live-five-round-report.json");
  const finalEvaluation = evaluateLiveJudge(runtime, disposition, true);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        mode: "live",
        runtimeTruthBoundary: runtime.truthBoundary(),
        rounds: report,
        finalEvaluation,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\n[REPORT] ${outPath}`);

  // §12/§18：写出 Judge 页面可直接消费的 live 视图（真实 canonical 来源卡）
  const liveView = toLiveFulfillmentView(finalEvaluation, runtime);
  const livePath = join(outDir, "judge-live.json");
  writeFileSync(livePath, JSON.stringify(liveView, null, 2), "utf8");
  console.log(`[LIVE-VIEW] ${livePath}  status=${liveView.status}`);

  await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
}

main().catch((error) => {
  console.error("[FATAL]", error instanceof Error && error.message === "J2_MQTT_URL_REQUIRED" ? "J2_MQTT_URL_REQUIRED" : "OPEN_SUPOS_VERIFY_FAILED");
  process.exit(1);
});
