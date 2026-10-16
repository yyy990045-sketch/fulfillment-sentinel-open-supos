/**
 * AI-COPILOT-BE-R1 —— 单次调用编排（§14/§15）。
 *
 * 就一个函数、一次模型调用：context → prompt → provider → 校验 → 结果。
 * 不循环、不多 Agent、不 CoT、不落库。
 * **任何异常都不得冒泡**——全部转成 `{ available:false, reason }`。
 */

import { buildCopilotContext } from "./context.js";
import { buildCopilotPrompt } from "./prompt.js";
import { validateCopilotBrief } from "./validator.js";
import { CopilotError, type CopilotBriefResult, type CopilotProvider } from "./types.js";
import type { ProductView } from "../../integrations/open-supos/product-view.js";

export type GenerateCopilotBriefOptions = {
  /** 测试可注入时间源 */
  now?: () => Date;
};

export async function generateCopilotBrief(
  view: ProductView,
  provider: CopilotProvider | null,
  options: GenerateCopilotBriefOptions = {},
): Promise<CopilotBriefResult> {
  try {
    if (!provider) return { available: false, reason: "AI_NOT_CONFIGURED: 未配置可用的 Copilot provider" };

    const context = buildCopilotContext(view);
    const prompt = buildCopilotPrompt(context);
    const raw = await provider.generate(prompt);
    const validated = validateCopilotBrief(context, raw);
    if (!validated.valid || !validated.output) {
      return {
        available: false,
        reason: `COPILOT_OUTPUT_REJECTED: ${validated.errors.slice(0, 3).join("；")}`,
      };
    }

    const degraded = provider.degraded?.length ? [...provider.degraded] : undefined;
    return {
      available: true,
      output: validated.output,
      meta: {
        provider: provider.name,
        model: provider.model,
        generatedAt: (options.now?.() ?? new Date()).toISOString(),
        ...(degraded ? { degraded } : {}),
      },
    };
  } catch (error) {
    if (error instanceof CopilotError) {
      return { available: false, reason: `COPILOT_PROVIDER_ERROR:${error.code} ${error.message}`.trim() };
    }
    return {
      available: false,
      reason: `COPILOT_ERROR: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
