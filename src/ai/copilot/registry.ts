/**
 * AI-COPILOT-BE-R1 —— provider 解析（§13：只读通用 AI_* 环境变量，不新增别的名字）。
 *
 * 缺失 AI_API_KEY / AI_MODEL 时**返回 {ok:false}，不抛异常**，
 * 让路由层可以直接回 `{ available:false }` 而不是 500。
 */

import { HttpCopilotProvider } from "./provider.js";
import type { CopilotProvider } from "./types.js";

export type CopilotProviderResolution =
  | { ok: true; provider: CopilotProvider }
  | { ok: false; reason: string };

export type ResolveCopilotProviderOptions = {
  env?: Record<string, string | undefined>;
  /** 测试注入用 */
  fetchImpl?: typeof fetch;
};

export function resolveCopilotProvider(options: ResolveCopilotProviderOptions = {}): CopilotProviderResolution {
  const env = options.env ?? process.env;

  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "AI_API_KEY 未配置" };

  const model = env.AI_MODEL?.trim();
  if (!model) return { ok: false, reason: "AI_MODEL 未配置" };

  const rawTimeout = env.AI_TIMEOUT_MS?.trim();
  let timeoutMs: number | undefined;
  if (rawTimeout) {
    const parsed = Number(rawTimeout);
    if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 60_000) {
      return { ok: false, reason: `AI_TIMEOUT_MS 非法（需 1000–60000）：${rawTimeout}` };
    }
    timeoutMs = Math.trunc(parsed);
  }

  const jsonSchema = (env.AI_JSON_SCHEMA ?? "").trim().toLowerCase();
  const responseFormat = jsonSchema === "off" || jsonSchema === "none" || jsonSchema === "false" ? "none" : "json_object";

  return {
    ok: true,
    provider: new HttpCopilotProvider({
      apiKey,
      model,
      ...(env.AI_BASE_URL ? { baseUrl: env.AI_BASE_URL } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      responseFormat,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    }),
  };
}
