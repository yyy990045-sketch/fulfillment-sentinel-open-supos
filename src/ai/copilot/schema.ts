/**
 * AI-COPILOT-BE-R1 —— 输出契约（strict JSON Schema）。
 *
 * 用途：**仅**用于
 *   1) 内嵌进 prompt 让模型照此输出；
 *   2) 本地校验。
 * 目标端点实测不支持 `response_format: { type: "json_schema" }`，
 * 因此**不把它当 API 参数传给端点**（见 provider.ts）。
 *
 * 不 import 既有 grounded / decision / root-cause 的 schema。
 */

export const COPILOT_BRIEF_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "reasoningSummary", "recommendedAction", "coordination", "evidenceRefs", "limitations"],
  properties: {
    summary: {
      type: "string",
      description: "一句话情况说明，只描述输入事实，不得声称现实已改变。",
    },
    reasoningSummary: {
      type: "string",
      description: "依据输入事实的推理摘要；证据不足处必须写「当前信息不足以判断。」",
    },
    recommendedAction: {
      type: "object",
      additionalProperties: false,
      required: ["label", "quantity", "reason"],
      properties: {
        label: { type: "string" },
        quantity: {
          description: "候选处置数量；必须落在输入事实可支持范围内（min(完工, 放行)），无依据时为 null。",
          anyOf: [{ type: "number" }, { type: "null" }],
        },
        reason: { type: "string" },
      },
    },
    coordination: {
      type: "object",
      additionalProperties: false,
      required: ["sales", "production", "quality", "warehouse"],
      properties: {
        sales: { type: "string" },
        production: { type: "string" },
        quality: { type: "string" },
        warehouse: { type: "string" },
      },
    },
    evidenceRefs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["system", "label", "value"],
        properties: {
          system: { type: "string", description: "只能取事实数据中 evidenceCatalog 出现过的 system。" },
          label: { type: "string" },
          value: { type: "string" },
        },
      },
    },
    limitations: {
      type: "array",
      items: { type: "string" },
      description: "输入未提供、因此不能判断的事项。",
    },
  },
} as const;

export function copilotBriefJsonSchema() {
  return COPILOT_BRIEF_JSON_SCHEMA;
}
