import { describe, expect, it } from "vitest";
import {
  HttpCopilotProvider,
  buildCopilotContext,
  buildCopilotPrompt,
  buildEvidenceCatalog,
  collectAllowedNumbers,
  generateCopilotBrief,
  resolveChatCompletionsUrl,
  resolveCopilotProvider,
  validateCopilotBrief,
  type CopilotBriefOutput,
  type CopilotProvider,
} from "../src/ai/copilot/index.js";
import type { ProductView } from "../src/integrations/open-supos/product-view.js";

/**
 * 全部使用 fake provider / 注入的 fake fetch，**绝不做真实网络调用**。
 */

type ViewFixtureOptions = {
  status?: string;
  order?: number | null;
  completed?: number | null;
  released?: number | null;
  committed?: number | null;
};

function viewFixture(options: ViewFixtureOptions = {}): ProductView {
  const status = options.status ?? "WAITING_FOR_EXECUTION_VERIFICATION";
  const order = options.order === undefined ? 100 : options.order;
  const completed = options.completed === undefined ? 96 : options.completed;
  const released = options.released === undefined ? 96 : options.released;
  const committed = options.committed === undefined ? 100 : options.committed;
  return {
    case: { id: "SO-IND-001", title: "跨系统生产履约状态冲突", dueAt: "2026-03-01T06:00:00.000Z", owner: "履约计划员" },
    facts: {
      order: { qty: order, source: "J2_ERP_OrderLine", updatedAt: "2026-03-01T05:00:00.000Z" },
      production: { qty: completed, source: "J2_MES_Production", updatedAt: "2026-03-01T05:10:00.000Z" },
      quality: { qty: released, source: "J2_QMS_Quality", updatedAt: "2026-03-01T05:20:00.000Z" },
      shipment: { qty: committed, source: "J2_WMS_Shipment", updatedAt: "2026-03-01T05:30:00.000Z" },
    },
    workflow: { status, currentStep: "EXECUTION_PENDING", history: [{ step: "DECISION_MADE", status: "DONE", at: "2026-03-01T05:30:00.000Z" }] },
    decision: { status: "AUTHORIZED_SHORT_SHIPMENT_96", recommendedQty: 96, reason: "短装授权 96 件" },
    runtime: {
      connected: true,
      latestEventAt: "2026-03-01T05:30:00.000Z",
      events: [
        { source: "WMS", eventType: "SHIPMENT_COMMITTED", businessRef: "SO-IND-001", sourceTime: "2026-03-01T05:30:00.000Z", summary: "executionCommittedQty=100", canonicalTopic: "/supos/J2_WMS_Shipment" },
        { source: "QMS", eventType: "QUALITY_RELEASED", businessRef: "SO-IND-001", sourceTime: "2026-03-01T05:20:00.000Z", summary: "releasedQty=96", canonicalTopic: "/supos/J2_QMS_Quality" },
        { source: "MES", eventType: "PRODUCTION_COMPLETED", businessRef: "SO-IND-001", sourceTime: "2026-03-01T05:10:00.000Z", summary: "completedQty=96", canonicalTopic: "/supos/J2_MES_Production" },
        { source: "ERP", eventType: "ORDER_LINE_CREATED", businessRef: "SO-IND-001", sourceTime: "2026-03-01T05:00:00.000Z", summary: "requiredQty=100", canonicalTopic: "/supos/J2_ERP_OrderLine" },
      ],
    },
    uns: { models: [], relations: [], sourceFlow: [], businessKey: "SO-IND-001" },
    evaluation: {
      mode: "live",
      contract: "judge-contract/v1.0",
      businessKey: "SO-IND-001",
      status,
      facts: {
        businessKey: "SO-IND-001",
        sourceOrderLineRef: "ERP:SO-IND-001:LINE-01",
        workOrderRef: "WO-IND-001",
        productionLotRef: "LOT-IND-001",
        shipmentSourceRef: "WMS:SHIP-IND-001",
        requiredQty: order ?? 0,
        dueAt: "2026-03-01T06:00:00.000Z",
        completedQty: completed ?? 0,
        productionState: "in_progress",
        releasedQty: released ?? 0,
        executionCommittedQty: committed ?? 0,
        sourceProgress: { ERP: "2026-03-01T05:00:00.000Z", MES: "2026-03-01T05:10:00.000Z", QMS: "2026-03-01T05:20:00.000Z", WMS: "2026-03-01T05:30:00.000Z" },
      },
      lineage: { status: "RESOLVED", relation: "ERP:SO-IND-001:LINE-01 → WO-IND-001 → LOT-IND-001 → WMS:SHIP-IND-001" },
      globalWatermark: "2026-03-01T05:30:00.000Z",
      dueAtWithGrace: "2026-03-01T08:00:00.000Z",
      disposition: { status: "AUTHORIZED_SHORT_SHIPMENT_96", authorizedQty: 96, authority: "DEMO_POLICY_DUAL_ROLE" },
      sourceProgress: { ERP: "2026-03-01T05:00:00.000Z", MES: "2026-03-01T05:10:00.000Z", QMS: "2026-03-01T05:20:00.000Z", WMS: "2026-03-01T05:30:00.000Z" },
      reason: "四源差异",
      externalObligation: "ERP.requiredQty 仍为 100 件；内部处置不改变对外订单承诺。",
      observations: { ERP: 1, MES: 1, QMS: 1, WMS: 1, SOURCE_PROGRESS: 4 },
      referenceCases: {},
    },
    truthBoundary: {},
  } as unknown as ProductView;
}

function validOutput(): CopilotBriefOutput {
  return {
    summary: "ERP 订单要求 100 件，MES 完工 96 件、QMS 放行 96 件，WMS 执行承诺仍为 100 件，差异 4 件。",
    reasoningSummary: "四个来源的数量互不一致；可交付数量受限于 MES 完工 96 件与 QMS 放行 96 件的较小值 96 件。",
    recommendedAction: {
      label: "按 96 件短装出货并同步沟通",
      quantity: 96,
      reason: "MES 完工 96 件、QMS 放行 96 件，可支持数量为 96 件；客户意愿当前信息不足以判断。",
    },
    coordination: {
      sales: "请按 96 件可交付数量确认后续安排；客户意愿当前信息不足以判断。",
      production: "请确认剩余 4 件的生产安排；排产信息未提供，当前信息不足以判断。",
      quality: "质量放行 96 件，请确认是否还有在检批次。",
      warehouse: "仓库执行承诺仍为 100 件，处理方案已经确认，当前仍在等待仓库执行状态更新。",
    },
    evidenceRefs: [{ system: "MES", label: "生产完工数量 completedQty", value: "96" }],
    limitations: ["客户意愿未提供，当前信息不足以判断。", "真实库存未提供，当前信息不足以判断。"],
  };
}

class FakeProvider implements CopilotProvider {
  readonly name = "fake";
  readonly model = "fake-model";
  constructor(private readonly raw: unknown, private readonly failure?: Error) {}
  async generate(): Promise<unknown> {
    if (this.failure) throw this.failure;
    return this.raw;
  }
}

describe("copilot context / prompt", () => {
  it("只保留精简事实：四源数量、来源时间、关系状态、处置、最近事件（截断 8 条）", () => {
    const context = buildCopilotContext(viewFixture());
    expect(context.caseId).toBe("SO-IND-001");
    expect(context.deterministicStatus).toBe("WAITING_FOR_EXECUTION_VERIFICATION");
    expect(context.quantities).toEqual({
      orderRequiredQty: 100,
      productionCompletedQty: 96,
      qualityReleasedQty: 96,
      shipmentExecutionCommittedQty: 100,
    });
    expect(context.sources.map((item) => item.system)).toEqual(["ERP", "MES", "QMS", "WMS"]);
    expect(context.sources.every((item) => item.sourceTime.length > 0)).toBe(true);
    expect(context.lineage.status).toBe("RESOLVED");
    expect(context.disposition.status).toBe("AUTHORIZED_SHORT_SHIPMENT_96");
    expect(context.recentEvents.length).toBeLessThanOrEqual(8);
    expect(context.supportedQty).toBe(96);
    // 不含原始 payload / 全量 dump
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("execution_committed_qty");
    expect(serialized).not.toContain("node-red");
  });

  it("allowedNumbers 含四源数量与两两差额绝对值", () => {
    const numbers = collectAllowedNumbers(viewFixture());
    expect([...numbers].sort((a, b) => a - b)).toEqual([0, 4, 96, 100]);
  });

  it("证据目录只含稳定系统标识且取自真实 view", () => {
    const catalog = buildEvidenceCatalog(viewFixture());
    expect(catalog.every((item) => ["ERP", "MES", "QMS", "WMS", "SOURCE_PROGRESS"].includes(item.system))).toBe(true);
    expect(catalog).toContainEqual({ system: "WMS", label: "仓库执行承诺数量 executionCommittedQty", value: "100" });
  });

  it("prompt 含 json 字样、转义尖括号、内嵌 schema", () => {
    const { system, user } = buildCopilotPrompt(buildCopilotContext(viewFixture()));
    expect(user.includes("json")).toBe(true);
    expect(user.includes("<facts_json>")).toBe(true);
    expect(system).toContain("处置已批准");
    expect(system).toContain("当前信息不足以判断。");
    expect(user).toContain("\"summary\"");
    expect(user).not.toContain("<script");
  });
});

describe("copilot validator", () => {
  it("合法输出通过校验", () => {
    const context = buildCopilotContext(viewFixture());
    const result = validateCopilotBrief(context, validOutput());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("编造数字：quantity=200 被拒", () => {
    const context = buildCopilotContext(viewFixture());
    const raw = { ...validOutput(), recommendedAction: { ...validOutput().recommendedAction, quantity: 200 } };
    expect(validateCopilotBrief(context, raw).valid).toBe(false);
  });

  it("编造数字：文案中出现 77 被拒", () => {
    const context = buildCopilotContext(viewFixture());
    const output = validOutput();
    const raw = { ...output, coordination: { ...output.coordination, production: "另有 77 件在途，请确认。" } };
    const result = validateCopilotBrief(context, raw);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("77");
  });

  it("evidenceRefs 引用不存在的 system 被拒", () => {
    const context = buildCopilotContext(viewFixture());
    const output = validOutput();
    const raw = { ...output, evidenceRefs: [{ system: "SAP", label: "订单要求数量 requiredQty", value: "100" }] };
    const result = validateCopilotBrief(context, raw);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("SAP");
  });

  it("quantity 超过 min(完工, 放行) 被拒（WMS 不作依据）", () => {
    const context = buildCopilotContext(viewFixture());
    const output = validOutput();
    const raw = { ...output, recommendedAction: { ...output.recommendedAction, quantity: 100 } };
    const result = validateCopilotBrief(context, raw);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("超过可支持数量 96");
  });

  it("WAITING_FOR_EXECUTION_VERIFICATION 下出现「问题已经解决」被拒", () => {
    const context = buildCopilotContext(viewFixture({ status: "WAITING_FOR_EXECUTION_VERIFICATION" }));
    const output = validOutput();
    const raw = { ...output, summary: `${output.summary}问题已经解决。` };
    const result = validateCopilotBrief(context, raw);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("已经解决");
  });

  it("REVALIDATED_CLOSED 下出现「客户已经接受96件」被拒", () => {
    const context = buildCopilotContext(viewFixture({ status: "REVALIDATED_CLOSED", committed: 96 }));
    const output = validOutput();
    output.coordination.sales = "客户已经接受96件，按 96 件安排发运。";
    output.summary = "内部闭环已完成，仓库执行承诺已更新为 96 件；客户订单要求仍为 100 件。";
    const result = validateCopilotBrief(context, output);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("客户");
  });

  it("询问/证据不足语境下的「客户是否接受」不得误杀（§8 正确行为）", () => {
    const context = buildCopilotContext(viewFixture());
    const output = validOutput();
    output.limitations = [
      "客户是否接受 96 件或变更订单数量：当前信息不足以判断。",
      "差额 4 件的根因未提供：当前信息不足以判断。",
    ];
    output.coordination.sales = "对外订单要求仍为 100 件；内部可支持数量为 96 件。请确认沟通口径；当前信息不足以判断客户是否接受变更。";
    const result = validateCopilotBrief(context, output);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("完工或放行不可用 → quantity 必须为 null", () => {
    const context = buildCopilotContext(viewFixture({ completed: null }));
    expect(context.supportedQty).toBeNull();
    expect(validateCopilotBrief(context, validOutput()).valid).toBe(false);
  });
});

describe("copilot service", () => {
  it("正常路径返回 available:true", async () => {
    const brief = await generateCopilotBrief(viewFixture(), new FakeProvider(validOutput()));
    expect(brief.available).toBe(true);
    if (brief.available) {
      expect(brief.output.recommendedAction.quantity).toBe(96);
      expect(brief.meta.provider).toBe("fake");
      expect(brief.meta.model).toBe("fake-model");
    }
  });

  it("provider 抛错 → available:false 且不冒泡", async () => {
    const brief = await generateCopilotBrief(viewFixture(), new FakeProvider(null, new Error("boom")));
    expect(brief).toEqual({ available: false, reason: expect.stringContaining("boom") });
  });

  it("provider 未配置 → available:false", async () => {
    const brief = await generateCopilotBrief(viewFixture(), null);
    expect(brief.available).toBe(false);
  });

  it("校验不过 → available:false", async () => {
    const output = validOutput();
    output.coordination.warehouse = "已经解决，无需处理。";
    const brief = await generateCopilotBrief(viewFixture(), new FakeProvider(output));
    expect(brief.available).toBe(false);
    if (!brief.available) expect(brief.reason).toContain("COPILOT_OUTPUT_REJECTED");
  });
});

describe("copilot registry", () => {
  it("未配置 AI_API_KEY / AI_MODEL → {ok:false}", () => {
    expect(resolveCopilotProvider({ env: {} }).ok).toBe(false);
    expect(resolveCopilotProvider({ env: { AI_API_KEY: "k" } }).ok).toBe(false);
    expect(resolveCopilotProvider({ env: { AI_MODEL: "m" } }).ok).toBe(false);
  });

  it("配置齐全 → provider", () => {
    const resolution = resolveCopilotProvider({ env: { AI_API_KEY: "k", AI_MODEL: "m", AI_BASE_URL: "https://example.test/v1" } });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.provider.model).toBe("m");
  });

  it("AI_JSON_SCHEMA=off → 走 none（不带 response_format）", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_input: unknown, init?: { body?: unknown }) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validOutput()) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const resolution = resolveCopilotProvider({ env: { AI_API_KEY: "k", AI_MODEL: "m", AI_JSON_SCHEMA: "off" }, fetchImpl });
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      await resolution.provider.generate({ system: "s", user: "u" });
      expect(bodies[0]?.response_format).toBeUndefined();
    }
  });

  it("非法 AI_TIMEOUT_MS → {ok:false}", () => {
    const resolution = resolveCopilotProvider({ env: { AI_API_KEY: "k", AI_MODEL: "m", AI_TIMEOUT_MS: "5" } });
    expect(resolution.ok).toBe(false);
  });
});

describe("copilot provider", () => {
  it("稳健拼接 chat/completions URL", () => {
    expect(resolveChatCompletionsUrl()).toBe("https://api.openai.com/v1/chat/completions");
    expect(resolveChatCompletionsUrl("https://x.test")).toBe("https://x.test/v1/chat/completions");
    expect(resolveChatCompletionsUrl("https://x.test/")).toBe("https://x.test/v1/chat/completions");
    expect(resolveChatCompletionsUrl("https://x.test/v1")).toBe("https://x.test/v1/chat/completions");
    expect(resolveChatCompletionsUrl("https://x.test/v1/")).toBe("https://x.test/v1/chat/completions");
    expect(resolveChatCompletionsUrl("https://x.test/v1/chat/completions")).toBe("https://x.test/v1/chat/completions");
  });

  it("response_format 被拒（400）→ 自动降级重试一次并标记降级", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_input: unknown, init?: { body?: unknown }) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      bodies.push(body);
      if (bodies.length === 1) {
        return new Response(JSON.stringify({ error: { message: "This response_format type is unavailable now" } }), { status: 400 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(validOutput())}\n\`\`\`` } }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const provider = new HttpCopilotProvider({ apiKey: "k", model: "m", baseUrl: "https://x.test", fetchImpl });
    const raw = await provider.generate({ system: "s", user: "u" });
    expect(bodies[0]?.response_format).toEqual({ type: "json_object" });
    expect(bodies[1]?.response_format).toBeUndefined();
    expect(provider.degraded.length).toBe(1);
    expect(raw).toEqual(validOutput());
  });

  it("网络/HTTP 失败 → 抛 CopilotError（不抛裸 Error）", async () => {
    const fetchImpl = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const provider = new HttpCopilotProvider({ apiKey: "k", model: "m", fetchImpl });
    await expect(provider.generate({ system: "s", user: "u" })).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE", status: 500 });
  });

  it("超时 → CopilotError(AI_TIMEOUT)", async () => {
    const fetchImpl = (async (_input: unknown, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })) as unknown as typeof fetch;
    const provider = new HttpCopilotProvider({ apiKey: "k", model: "m", timeoutMs: 1000, fetchImpl });
    await expect(provider.generate({ system: "s", user: "u" })).rejects.toMatchObject({ code: "AI_TIMEOUT", status: 504 });
  });
});
