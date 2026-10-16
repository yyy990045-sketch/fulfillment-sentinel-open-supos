/**
 * Live 判定 → Judge 页面视图（§12/§18）。
 *
 * 只做只读投影：把 `evaluateLiveJudge` 的结果映射成前端 `LiveFulfillmentView`。
 * 来源卡只展示**真实 canonical 坐标**（sourceSystem / canonicalTopic / sourceTime / businessRef），
 * 不展示任何 ERP-DEMO / 伪造 evidenceId（§12）。
 */

import type { LiveFulfillmentView } from "../../demo/judge/manifest.js";
import { CANONICAL_TOPICS } from "./canonical-contract.js";
import type { J2CanonicalLiveRuntime } from "./canonical-live-runtime.js";
import type { LiveJudgeEvaluation } from "./canonical-live-judge.js";
import { RUNTIME_TRUTH_BOUNDARY } from "./canonical-contract.js";

function lastObservation(runtime: J2CanonicalLiveRuntime, systemType: string) {
  const matches = runtime.state.observations.filter(
    (item) => !item.isSourceProgress && item.envelope.source.systemType === systemType,
  );
  return matches[matches.length - 1] ?? null;
}

export function toLiveFulfillmentView(
  evaluation: LiveJudgeEvaluation,
  runtime: J2CanonicalLiveRuntime,
): LiveFulfillmentView {
  const sources: LiveFulfillmentView["sources"] = [];
  const bindings: Array<{ systemType: string; topic: string }> = [
    { systemType: "erp", topic: CANONICAL_TOPICS.ERP },
    { systemType: "mes", topic: CANONICAL_TOPICS.MES },
    { systemType: "qms", topic: CANONICAL_TOPICS.QMS },
    { systemType: "wms", topic: CANONICAL_TOPICS.WMS },
  ];
  for (const binding of bindings) {
    const observation = lastObservation(runtime, binding.systemType);
    if (!observation) continue;
    const j2 = (observation.envelope.metadata?.j2 ?? {}) as Record<string, unknown>;
    sources.push({
      systemKey: observation.envelope.source.systemKey,
      systemType: observation.envelope.source.systemType,
      canonicalTopic: binding.topic,
      sourceTime: String(j2.sourceTime ?? observation.envelope.event.occurredAt),
      businessRef: observation.envelope.entity.businessKey,
      quantityField: typeof j2.quantityField === "string" ? j2.quantityField : null,
      quantityValue: typeof j2.quantityValue === "number" ? j2.quantityValue : null,
    });
  }

  return {
    mode: "live",
    contract: evaluation.contract,
    businessKey: evaluation.businessKey,
    status: evaluation.status,
    reason: evaluation.reason,
    externalObligation: evaluation.externalObligation,
    globalWatermark: evaluation.globalWatermark,
    dueAtWithGrace: evaluation.dueAtWithGrace,
    lineage: evaluation.lineage,
    disposition: evaluation.disposition,
    facts: {
      requiredQty: evaluation.facts.requiredQty,
      dueAt: evaluation.facts.dueAt,
      completedQty: evaluation.facts.completedQty,
      releasedQty: evaluation.facts.releasedQty,
      executionCommittedQty: evaluation.facts.executionCommittedQty,
      productionState: evaluation.facts.productionState,
    },
    sourceProgress: evaluation.sourceProgress,
    sources,
    runtimeTruthBoundary: { ...RUNTIME_TRUTH_BOUNDARY },
    observations: evaluation.observations,
  };
}
