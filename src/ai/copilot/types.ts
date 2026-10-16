/**
 * AI-COPILOT-BE-R1 —— 履约协同 Copilot 类型（最薄一层）。
 *
 * 本模块**不是** Agent Framework / Planner / Multi-Agent / Vector DB / RAG / Memory：
 * 只有「一次模型调用 + 本地校验」，把**已经被确定性 Judge Engine 确认的工业事实**
 * 转成解释 / 处置候选 / 跨部门协同文案 / 复核摘要。
 *
 * 边界（§1/§3/§6）：
 *   - AI 不决定数量、不决定 lineage、不决定冲突、不决定可否关闭；
 *   - AI 不修改 ERP/MES/QMS/WMS，不自动批准 / 执行 / 关闭 Case；
 *   - 不复用既有 grounded / decision / root-cause 三套 provider 的任何类型。
 */

export type CopilotBriefOutput = {
  /** 面向复核人的一句话情况说明（不得声称现实已改变） */
  summary: string;
  /** 依据输入事实的推理摘要（不得暴露思维链，只写依据与不确定项） */
  reasoningSummary: string;
  /** 候选处置建议（quantity 只能落在输入事实可支持的范围内） */
  recommendedAction: { label: string; quantity: number | null; reason: string };
  /** 跨部门协同沟通内容 */
  coordination: { sales: string; production: string; quality: string; warehouse: string };
  /** 证据引用：system 只能取证据目录里的稳定标识 */
  evidenceRefs: { system: string; label: string; value: string }[];
  /** 明确写出「当前信息不足以判断」的事项 */
  limitations: string[];
};

/** 模型调用的最小抽象：只有一次 generate，没有工具、没有循环。 */
export interface CopilotProvider {
  readonly name: string;
  readonly model: string;
  /** 端点不支持 response_format 时自动降级的原因（可选） */
  readonly degraded?: readonly string[];
  generate(prompt: { system: string; user: string }): Promise<unknown>;
}

export class CopilotError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = "CopilotError";
    this.code = code;
    this.status = status;
  }
}

export type CopilotUnavailable = { available: false; reason: string };

export type CopilotBrief = {
  available: true;
  output: CopilotBriefOutput;
  meta: {
    provider: string;
    model: string;
    generatedAt: string;
    /** 降级说明（例如端点不支持 response_format） */
    degraded?: string[];
  };
};

export type CopilotBriefResult = CopilotBrief | CopilotUnavailable;
