/**
 * Live Judge Evaluation（§11）。
 *
 * A-E 参考用例仍由 `buildJudgeContractProjection` 产出（保留不动）；
 * **live 结果**由真实 canonical runtime events 计算，二者严格分离：
 *   - live 事实来自 `factsFromUnsMessages(真实 envelope 流)`；
 *   - live 状态由**既有** `evaluate()` 状态机判定（不复制 engine，§20）。
 *
 * lineage 不满足时返回 `NOT_EVALUABLE:BUSINESS_IDENTITY_UNRESOLVED`（§10 fail-closed），
 * **绝不默认 C**。
 *
 * J2-R1.1 语义收口：live lineage 的门槛从「4 个 ref 非空」升级为
 * 「跨来源业务关系真实一致」——由 runtime 的 `resolveLineage()` 对全部 relation
 * 声明做确定性聚合校验（顺序无关、不依赖 `||=` 先到先得）：
 *   1. ERP.orderLineRef == MES.orderLineRef        （sourceOrderLineRef 三方声明）
 *   2. MES.productionLotRef == QMS.productionLotRef（productionLotRef 双方声明）
 *   3. ERP.orderLineRef == WMS.sourceOrderLineRef  （sourceOrderLineRef 三方声明）
 * missing / mismatched / ambiguous relation 一律 NOT_EVALUABLE，不能进入
 * FULFILLMENT_STATE_CONFLICT。解析结果交给既有 evaluate()，不重写状态机。
 */

import {
  buildJudgeContractProjection,
  evaluate,
  factsFromUnsMessages,
  JUDGE_CONTRACT_VERSION,
  type JudgeCaseStatus,
  type JudgeContractFacts,
  type JudgeContractProjection,
  type JudgeDisposition,
  type JudgeCaseId,
} from "../../demo/judge/contract.js";
import type { J2CanonicalLiveRuntime } from "./canonical-live-runtime.js";
import { resolveLineage } from "./canonical-live-runtime.js";

export type LiveJudgeState =
  | "NOT_EVALUABLE:BUSINESS_IDENTITY_UNRESOLVED"
  | JudgeCaseStatus;

export type LiveJudgeEvaluation = {
  mode: "live";
  contract: typeof JUDGE_CONTRACT_VERSION;
  businessKey: string;
  /** live 状态：由真实 canonical runtime events 计算 */
  status: LiveJudgeState;
  /** live 事实（来自真实 canonical envelope 流） */
  facts: JudgeContractFacts;
  /** lineage 解析结果 */
  lineage: { status: "RESOLVED" | "NOT_EVALUABLE"; relation: string };
  globalWatermark: string;
  dueAtWithGrace: string;
  disposition: JudgeDisposition;
  sourceProgress: JudgeContractFacts["sourceProgress"];
  reason: string;
  externalObligation: string;
  /** 实时来源计数（用于现场判断状态流转） */
  observations: {
    ERP: number;
    MES: number;
    QMS: number;
    WMS: number;
    SOURCE_PROGRESS: number;
  };
  /** §11：A-E 仍作为参考用例并存 */
  referenceCases: JudgeContractProjection;
};

/**
 * 用 live runtime 的真实 envelope 流计算 live 判定。
 *
 * @param runtime                真实 canonical runtime
 * @param disposition            现有内部处置（DEMO_POLICY_DUAL_ROLE）；默认 none
 * @param closedAfterRevalidation §17 复验通过标志（新来源事实到达后共同水位推进且冲突消解）
 */
export function evaluateLiveJudge(
  runtime: J2CanonicalLiveRuntime,
  disposition: JudgeDisposition = { status: "none", authorizedQty: null, authority: "none" },
  closedAfterRevalidation = false,
): LiveJudgeEvaluation {
  const facts = factsFromUnsMessages(runtime.envelopesForJudge());
  const referenceCases = buildJudgeContractProjection({ facts });

  // §10 / J2-R1.1 lineage fail-closed：跨来源业务关系真实一致才可评价。
  // resolveLineage 聚合 runtime 记录的全部 relation 声明做确定性校验
  // （missing / mismatched / ambiguous → NOT_EVALUABLE），解析结果交给
  // 下方既有 evaluate() —— 不重写状态机。
  const resolution = resolveLineage(runtime.state.relationObservations);
  const lineageResolved = resolution.status === "RESOLVED";

  const counts = {
    ERP: 0,
    MES: 0,
    QMS: 0,
    WMS: 0,
    SOURCE_PROGRESS: 0,
  };
  for (const observation of runtime.state.observations) {
    const system = String(observation.envelope.source.systemType ?? "").toUpperCase();
    if (system === "ERP" || system === "MES" || system === "QMS" || system === "WMS") counts[system] += 1;
    if (observation.isSourceProgress) counts.SOURCE_PROGRESS += 1;
  }

  if (!lineageResolved) {
    const detail = resolution.status === "NOT_EVALUABLE" ? resolution.detail : "lineage unresolved";
    return {
      mode: "live",
      contract: JUDGE_CONTRACT_VERSION,
      businessKey: facts.businessKey,
      status: "NOT_EVALUABLE:BUSINESS_IDENTITY_UNRESOLVED",
      facts,
      lineage: {
        status: "NOT_EVALUABLE",
        relation: detail,
      },
      globalWatermark: "",
      dueAtWithGrace: "",
      disposition,
      sourceProgress: facts.sourceProgress,
      reason: `业务关联未能跨来源一致解析（${detail}），不能评价 live 履约状态。`,
      externalObligation: "ERP.requiredQty 仍为 100 件；内部处置不改变对外订单承诺。",
      observations: counts,
      referenceCases,
    };
  }

  // 复用既有状态机；live 模式下 caseId 仅作为合同字段（不改变判定语义）
  const evaluated = evaluate({
    caseId: "C" as JudgeCaseId,
    label: "live runtime",
    facts,
    disposition,
    closedAfterRevalidation,
  });

  // J2-R1.1：lineage 展示用 resolveLineage 的确定性解析结果
  // （跨来源一致的唯一值），不用 `||=` 先到先得聚合出的 facts 值。
  const relations = resolution.status === "RESOLVED" ? resolution.relations : null;

  return {
    mode: "live",
    contract: JUDGE_CONTRACT_VERSION,
    businessKey: facts.businessKey,
    status: evaluated.status,
    facts,
    lineage: {
      status: evaluated.lineage.status,
      relation: relations
        ? `${relations.sourceOrderLineRef} → ${relations.workOrderRef} → ${relations.productionLotRef} → ${relations.shipmentSourceRef}`
        : evaluated.lineage.relation,
    },
    globalWatermark: evaluated.globalWatermark,
    dueAtWithGrace: evaluated.dueAtWithGrace,
    disposition,
    sourceProgress: facts.sourceProgress,
    reason: evaluated.reason,
    externalObligation: evaluated.externalObligation,
    observations: counts,
    referenceCases,
  };
}
