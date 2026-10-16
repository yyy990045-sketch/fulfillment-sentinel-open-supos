/**
 * AI-COPILOT-BE-R1 —— 最薄的 chat/completions provider。
 *
 * 实测约束（不要改）：
 *   - 目标端点**不支持** `response_format: { type: "json_schema" }`（400）。
 *   - `response_format: { type: "json_object" }` 可用，但 prompt 必须含 "json"（见 prompt.ts）。
 *   - 走 `chat/completions`，不用 Responses API。
 *   - 端点也可能完全不接受 response_format → 400 时自动降级重试一次（不带 response_format）。
 *
 * 不用 openai SDK：直接 fetch，JSON body 完全可控、依赖最少。
 */

import { CopilotError, type CopilotProvider } from "./types.js";

export type CopilotProviderConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** 1000–60000，默认 20000 */
  timeoutMs?: number;
  /** 默认 "json_object"；"none" 表示完全不带 response_format */
  responseFormat?: "json_object" | "none";
  /** 测试注入用；默认 globalThis.fetch */
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 20_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;

/**
 * 稳健拼接 chat/completions URL：
 * baseUrl 可能有/没有尾部 `/`，可能已含 `/v1`，也可能已经是完整路径。
 */
export function resolveChatCompletionsUrl(baseUrl?: string): string {
  const raw = (baseUrl ?? "").trim();
  const base = raw === "" ? DEFAULT_BASE_URL : raw.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(base)) return base;
  const withVersion = /(?:^|\/)v\d+$/i.test(base) ? base : `${base}/v1`;
  return `${withVersion}/chat/completions`;
}

export function normalizeTimeoutMs(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(value)));
}

/** 剥掉 ```json ... ``` 之类的代码块包裹。 */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  return (fenced?.[1] ?? trimmed).trim();
}

type UnknownRecord = Record<string, unknown>;

function messageContentOf(payload: unknown): string | null {
  const root = payload as UnknownRecord | null;
  const choices = Array.isArray(root?.choices) ? (root?.choices as unknown[]) : [];
  const first = choices[0] as UnknownRecord | undefined;
  const message = first?.message as UnknownRecord | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    // 少数兼容端点把 content 拆成 parts
    const parts = content
      .map((item) => ((item as UnknownRecord)?.text as unknown) ?? null)
      .filter((item): item is string => typeof item === "string");
    if (parts.length) return parts.join("");
  }
  return null;
}

type CallResult = { ok: true; value: unknown } | { ok: false; status: number; code: string; message: string };

export class HttpCopilotProvider implements CopilotProvider {
  readonly name = "http-chat-completions";
  readonly model: string;
  private readonly apiKey: string;
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly responseFormat: "json_object" | "none";
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly degradedNotes: string[] = [];

  constructor(config: CopilotProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.url = resolveChatCompletionsUrl(config.baseUrl);
    this.timeoutMs = normalizeTimeoutMs(config.timeoutMs);
    this.responseFormat = config.responseFormat ?? "json_object";
    this.fetchImpl = config.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  /** 端点不支持 response_format 等降级说明。 */
  get degraded(): readonly string[] {
    return [...this.degradedNotes];
  }

  async generate(prompt: { system: string; user: string }): Promise<unknown> {
    const usedJsonObject = this.responseFormat === "json_object";
    const first = await this.call(prompt, usedJsonObject);
    if (first.ok) return first.value;

    // 端点不支持 response_format → 降级重试一次（不带 response_format）
    if (usedJsonObject && first.status === 400 && /response_format/i.test(first.message)) {
      this.degradedNotes.push("RESPONSE_FORMAT_UNSUPPORTED: 端点拒绝 response_format，已降级为纯 prompt 约束输出");
      const second = await this.call(prompt, false);
      if (second.ok) return second.value;
      throw new CopilotError(second.code, second.status, second.message);
    }

    throw new CopilotError(first.code, first.status, first.message);
  }

  private async call(prompt: { system: string; user: string }, useResponseFormat: boolean): Promise<CallResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const body: UnknownRecord = {
      model: this.model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      stream: false,
      temperature: 0,
    };
    if (useResponseFormat) body.response_format = { type: "json_object" };

    try {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        return { ok: false, status: response.status, code: response.status >= 500 ? "AI_PROVIDER_UNAVAILABLE" : "AI_PROVIDER_FAILED", message: `HTTP_${response.status} ${raw.slice(0, 500)}` };
      }
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        return { ok: false, status: 502, code: "AI_BAD_JSON", message: "AI_BAD_JSON: 响应体不是合法 JSON" };
      }
      const content = messageContentOf(payload);
      if (content === null || content.trim() === "") {
        return { ok: false, status: 502, code: "AI_EMPTY_CONTENT", message: "AI_EMPTY_CONTENT: 响应缺少 choices[0].message.content" };
      }
      try {
        return { ok: true, value: JSON.parse(extractJsonText(content)) };
      } catch {
        return { ok: false, status: 502, code: "AI_UNPARSEABLE_CONTENT", message: "AI_UNPARSEABLE_CONTENT: 模型输出不是合法 JSON 对象" };
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, status: 504, code: "AI_TIMEOUT", message: `AI_TIMEOUT: 请求超过 ${this.timeoutMs}ms` };
      }
      return {
        ok: false,
        status: 502,
        code: "AI_NETWORK",
        message: `AI_NETWORK: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
