/**
 * AI-COPILOT-BE-R1 —— 极简输出校验（§9/§10）。
 *
 * **不是** validator framework：只做 6 件事
 *   1) JSON 形状；2) quantity 不超可支持范围（WMS 不作数）；
 *   3) evidenceRefs 只能引用证据目录；4) 越权断言黑名单；
 *   5) 数字核查；6) 假闭环检测。
 *
 * 校验失败 → `valid:false`，调用方回 `{ available:false }`，
 * **绝不**把不合格输出当成功返回。
 */

import type { CopilotContext, CopilotEvidenceRef } from "./context.js";
import type { CopilotBriefOutput } from "./types.js";

export type CopilotValidation = {
  valid: boolean;
  output?: CopilotBriefOutput;
  errors: string[];
};

/** 越权断言黑名单：输入事实未明确出现时一律禁止。 */
export const FORBIDDEN_PHRASES = [
  "客户已同意",
  "客户已经接受",
  "合同已修改",
  "合同已变更",
  "订单已变更",
  "订单已变更为",
  "问题已经解决",
  "已经解决",
  "责任在",
  "归因于",
  "根因是",
] as const;

/** 假闭环措辞：WAITING_FOR_EXECUTION_VERIFICATION 下出现即失败。 */
export const CLOSURE_PHRASES = [
  "已解决",
  "已经解决",
  "问题已解决",
  "问题解决",
  "已关闭",
  "已经关闭",
  "已闭环",
  "已经闭环",
  "已完成",
  "已经完成",
  "已修复",
  "已消除",
  "不再冲突",
  "冲突已消除",
] as const;

/** 客户接受类断言：任何状态下都不得出现。 */
const CUSTOMER_ACCEPT_PATTERN = /客户[^。；;\n]{0,16}(?:接受|同意)/;

/**
 * 询问 / 未定 / 证据不足语境：
 * 「客户是否接受……：当前信息不足以判断。」是 §8 明确要求的正确行为，
 * 不能当成「客户已经接受」的越权断言误杀。
 */
const NON_ASSERTION_CONTEXT =
  /(是否|能否|可否|有无|尚未|还没有|未(?:知|明确|确定|能|曾)|不确定|不清楚|有待|待确认|需(?:要)?确认|不足以判断|暂不能|无法确认)/;

/**
 * 只在**断言句**里检测客户接受/同意。逐句切分后排除询问与不足语境。
 * 返回命中的断言句，未命中返回 null。
 */
export function findCustomerAcceptAssertion(text: string): string | null {
  for (const rawSentence of text.split(/[。；;\n]/)) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;
    if (!CUSTOMER_ACCEPT_PATTERN.test(sentence)) continue;
    if (NON_ASSERTION_CONTEXT.test(sentence)) continue;
    return sentence;
  }
  return null;
}

const COORDINATION_KEYS = ["sales", "production", "quality", "warehouse"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !expected.includes(key));
}

function normalize(value: string): string {
  return value.replace(/[\s"'“”‘’()（）:：,，.。/\\-]/g, "").toLowerCase();
}

/** 数值比较：优先比数字，其次比文本包含。 */
function sameValue(expected: string, actual: string): boolean {
  const a = expected.replace(/[^\d.]/g, "");
  const b = actual.replace(/[^\d.]/g, "");
  if (a && b) return a === b;
  const na = normalize(expected);
  const nb = normalize(actual);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/** 标签语义匹配（宽松但必须真实存在）：互相包含或共享 >=3 字子串。 */
function sameLabel(expected: string, actual: string): boolean {
  const a = normalize(expected);
  const b = normalize(actual);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  for (let size = 3; size >= 2; size -= 1) {
    for (let i = 0; i + size <= b.length; i += 1) {
      if (a.includes(b.slice(i, i + size))) return true;
    }
  }
  return false;
}

/** 输入事实里出现的字面量（日期、编号、来源时间等）先剔除，避免误判数字。 */
function contextLiterals(context: CopilotContext): string[] {
  return [
    context.caseId,
    context.businessKey,
    context.dueAt,
    context.dueAtWithGrace,
    context.globalWatermark,
    context.lineage.relation,
    context.disposition.status,
    context.externalObligation,
    context.productionState,
    ...context.sources.map((item) => `${item.source} ${item.sourceTime} ${item.quantityField}`),
    ...Object.values(context.sourceProgress),
    ...context.recentEvents.map((item) => `${item.source} ${item.eventType} ${item.businessRef} ${item.sourceTime} ${item.summary}`),
    ...context.evidenceCatalog.map((item) => `${item.system} ${item.label} ${item.value}`),
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 1);
}

function scrub(text: string, context: CopilotContext): string {
  let out = text.replace(/\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?/g, " ");
  for (const literal of contextLiterals(context)) out = out.split(literal).join(" ");
  return out;
}

/** 找出文案中不被输入事实支持的数字。 */
export function findUnsupportedNumbers(text: string, context: CopilotContext): number[] {
  const allowed = new Set(context.allowedNumbers);
  const scanned = scrub(text, context);
  const found: number[] = [];
  for (const match of scanned.match(/\d+(?:\.\d+)?/g) ?? []) {
    const value = Number(match);
    if (!allowed.has(value) && !found.includes(value)) found.push(value);
  }
  return found;
}

function evidenceErrorFor(ref: CopilotEvidenceRef, catalog: CopilotEvidenceRef[]): string | null {
  const sameSystem = catalog.filter((item) => item.system === ref.system);
  if (sameSystem.length === 0) {
    return `evidenceRefs.system 不在证据目录内：${ref.system}`;
  }
  const valueOk = sameSystem.some((item) => sameValue(item.value, ref.value));
  if (!valueOk) return `evidenceRefs.value 与证据目录不符：${ref.system}/${ref.value}`;
  const labelOk = sameSystem.some((item) => sameLabel(item.label, ref.label));
  if (!labelOk) return `evidenceRefs.label 与证据目录不符：${ref.system}/${ref.label}`;
  return null;
}

/**
 * 假闭环检测：
 *   - WAITING_FOR_EXECUTION_VERIFICATION：不得出现「已解决 / 已完成 / 已经关闭 / 问题解决」类断言；
 *   - REVALIDATED_CLOSED：允许内部闭环陈述，但仍不得说「客户已经接受 N 件」。
 */
export function detectFalseClosure(output: CopilotBriefOutput, deterministicStatus: string): string[] {
  const errors: string[] = [];
  const text = [
    output.summary,
    output.reasoningSummary,
    output.recommendedAction.label,
    output.recommendedAction.reason,
    output.coordination.sales,
    output.coordination.production,
    output.coordination.quality,
    output.coordination.warehouse,
    ...output.limitations,
  ].join("\n");

  const assertion = findCustomerAcceptAssertion(text);
  if (assertion) {
    errors.push(`不得断言客户已经接受或同意变更数量（客户意愿未在输入事实中提供）：${assertion}`);
  }
  if (deterministicStatus === "WAITING_FOR_EXECUTION_VERIFICATION") {
    for (const phrase of CLOSURE_PHRASES) {
      if (text.includes(phrase)) {
        errors.push(`WAITING_FOR_EXECUTION_VERIFICATION 下不得出现闭环断言：${phrase}`);
        break;
      }
    }
  }
  return errors;
}

/** §9/§10 极简校验。 */
export function validateCopilotBrief(context: CopilotContext, raw: unknown): CopilotValidation {
  const errors: string[] = [];
  if (!isRecord(raw)) return { valid: false, errors: ["输出不是 JSON 对象"] };

  const extraTop = exactKeys(raw, ["summary", "reasoningSummary", "recommendedAction", "coordination", "evidenceRefs", "limitations"]);
  if (extraTop.length) errors.push(`存在未允许的字段：${extraTop.join(", ")}`);

  for (const key of ["summary", "reasoningSummary"] as const) {
    if (typeof raw[key] !== "string" || (raw[key] as string).trim() === "") errors.push(`${key} 必须是非空字符串`);
  }

  // ── recommendedAction ──
  const action = raw.recommendedAction;
  let quantity: number | null = null;
  if (!isRecord(action)) {
    errors.push("recommendedAction 必须是对象");
  } else {
    const extra = exactKeys(action, ["label", "quantity", "reason"]);
    if (extra.length) errors.push(`recommendedAction 存在未允许的字段：${extra.join(", ")}`);
    if (typeof action.label !== "string" || action.label.trim() === "") errors.push("recommendedAction.label 必须是非空字符串");
    if (typeof action.reason !== "string" || action.reason.trim() === "") errors.push("recommendedAction.reason 必须是非空字符串");
    if (action.quantity === null || action.quantity === undefined) {
      quantity = null;
    } else if (typeof action.quantity === "number" && Number.isFinite(action.quantity)) {
      quantity = action.quantity;
    } else {
      errors.push("recommendedAction.quantity 必须是数字或 null");
    }
  }

  // 规则 2：quantity 不得超过输入事实可支持数量（WMS 不作依据）
  const completed = context.quantities.productionCompletedQty;
  const released = context.quantities.qualityReleasedQty;
  const supported =
    completed !== null && released !== null && Number.isFinite(completed) && Number.isFinite(released) && completed > 0 && released > 0
      ? Math.min(completed, released)
      : null;
  if (quantity !== null) {
    if (supported === null) {
      errors.push("recommendedAction.quantity 必须为 null（完工或放行数量不可用）");
    } else if (quantity > supported) {
      errors.push(`recommendedAction.quantity(${quantity}) 超过可支持数量 ${supported}`);
    } else if (quantity <= 0) {
      errors.push(`recommendedAction.quantity(${quantity}) 不是正整数`);
    }
  }

  // ── coordination ──
  const coordination = raw.coordination;
  const coordinationText: Record<string, string> = {};
  if (!isRecord(coordination)) {
    errors.push("coordination 必须是对象");
  } else {
    const extra = exactKeys(coordination, COORDINATION_KEYS);
    if (extra.length) errors.push(`coordination 存在未允许的字段：${extra.join(", ")}`);
    for (const key of COORDINATION_KEYS) {
      const value = coordination[key];
      if (typeof value !== "string" || value.trim() === "") {
        errors.push(`coordination.${key} 必须是非空字符串`);
        coordinationText[key] = "";
      } else {
        coordinationText[key] = value as string;
      }
    }
  }

  // ── evidenceRefs ──
  const refs = raw.evidenceRefs;
  const parsedRefs: CopilotEvidenceRef[] = [];
  if (!Array.isArray(refs)) {
    errors.push("evidenceRefs 必须是数组");
  } else {
    refs.forEach((item, index) => {
      if (!isRecord(item)) {
        errors.push(`evidenceRefs[${index}] 必须是对象`);
        return;
      }
      const extra = exactKeys(item, ["system", "label", "value"]);
      if (extra.length) errors.push(`evidenceRefs[${index}] 存在未允许的字段：${extra.join(", ")}`);
      if (typeof item.system !== "string" || item.system.trim() === "") {
        errors.push(`evidenceRefs[${index}].system 必须是非空字符串`);
        return;
      }
      if (typeof item.label !== "string" || typeof item.value !== "string") {
        errors.push(`evidenceRefs[${index}].label/value 必须是字符串`);
        return;
      }
      parsedRefs.push({ system: item.system, label: item.label, value: item.value });
    });
  }

  // ── limitations ──
  const limitations = raw.limitations;
  if (!Array.isArray(limitations)) {
    errors.push("limitations 必须是数组");
  } else if (!limitations.every((item) => typeof item === "string")) {
    errors.push("limitations 必须是字符串数组");
  }

  if (errors.length) return { valid: false, errors };

  const output: CopilotBriefOutput = {
    summary: raw.summary as string,
    reasoningSummary: raw.reasoningSummary as string,
    recommendedAction: {
      label: (action as Record<string, unknown>).label as string,
      quantity,
      reason: (action as Record<string, unknown>).reason as string,
    },
    coordination: {
      sales: coordinationText.sales ?? "",
      production: coordinationText.production ?? "",
      quality: coordinationText.quality ?? "",
      warehouse: coordinationText.warehouse ?? "",
    },
    evidenceRefs: parsedRefs,
    limitations: (limitations as unknown[]).map((item) => String(item)),
  };

  // 规则 3：evidenceRefs 只能引用证据目录
  for (const ref of output.evidenceRefs) {
    const error = evidenceErrorFor(ref, context.evidenceCatalog);
    if (error) errors.push(error);
  }

  // 规则 4：越权断言黑名单（输入事实里明确出现时放行）
  const factsText = JSON.stringify(context);
  const allText = [
    output.summary,
    output.reasoningSummary,
    output.recommendedAction.label,
    output.recommendedAction.reason,
    output.coordination.sales,
    output.coordination.production,
    output.coordination.quality,
    output.coordination.warehouse,
    ...output.limitations,
  ].join("\n");
  for (const phrase of FORBIDDEN_PHRASES) {
    if (allText.includes(phrase) && !factsText.includes(phrase)) {
      errors.push(`出现未被输入事实支持的断言：${phrase}`);
    }
  }

  // 规则 5：数字核查
  const numericTargets: Array<[string, string]> = [
    ["summary", output.summary],
    ["reasoningSummary", output.reasoningSummary],
    ["recommendedAction.reason", output.recommendedAction.reason],
    ["coordination.sales", output.coordination.sales],
    ["coordination.production", output.coordination.production],
    ["coordination.quality", output.coordination.quality],
    ["coordination.warehouse", output.coordination.warehouse],
  ];
  for (const [field, value] of numericTargets) {
    const bad = findUnsupportedNumbers(value, context);
    if (bad.length) errors.push(`${field} 出现输入事实不支持的数字：${bad.join(", ")}`);
  }

  // CLOSED is authoritative: a model may explain closure, never reopen execution.
  if (context.deterministicStatus === 'REVALIDATED_CLOSED') {
    if (output.recommendedAction.quantity !== null) errors.push('CLOSED recommendedAction.quantity 必须为 null');
    if (/等待.{0,8}仓库.{0,8}(执行|更新)|仓库.{0,8}(仍|还是).{0,8}100|WMS.{0,8}(仍|还是).{0,8}100|调整.{0,8}(仓库|执行).{0,8}96/.test(allText)) errors.push('CLOSED 输出与当前执行事实矛盾');
  }

  // 规则 6：假闭环
  errors.push(...detectFalseClosure(output, context.deterministicStatus));

  if (errors.length) return { valid: false, errors };
  return { valid: true, output, errors: [] };
}
