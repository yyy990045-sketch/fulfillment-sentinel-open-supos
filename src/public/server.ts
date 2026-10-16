import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import {
  buildJudgeManifest,
  readExecutionReadbackArtifact,
  readLiveFulfillmentArtifact,
  resolveJudgeContextId,
} from "../demo/judge/manifest.js";
import { readJudgeContractArtifact } from "../demo/judge/contract.js";
import {
  JUDGE_CONTRACT_ARTIFACT,
  JUDGE_LIVE_ARTIFACT,
  JUDGE_READBACK_ARTIFACT,
  JUDGE_WORKSPACE_DIR,
  openExistingJudgeStore,
} from "../demo/judge/workspace.js";
import { DEMO_SIMULATION_TENANT } from "../simulator/manufacturing/emitter.js";
import { UNS_STREAM_ARTIFACT_NAME } from "../traceability/payload-source.js";

import { getLiveSession } from '../integrations/open-supos/product-session.js';
import { generateCopilotBrief, resolveCopilotProvider } from '../ai/copilot/index.js';

const projectRoot = process.cwd();
const frontendRoot = resolve(projectRoot, "frontend/dist");
const workspaceRoot = resolve(projectRoot, JUDGE_WORKSPACE_DIR);
const artifactRoot = resolve(process.env.J2_ARTIFACT_DIR?.trim() || "./artifacts");
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function sendJson(response: import("node:http").ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function sendFrontendFile(response: import("node:http").ServerResponse, pathname: string) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidate = resolve(frontendRoot, relativePath || "index.html");
  const relativeCandidate = relative(frontendRoot, candidate);
  if (relativeCandidate === ".." || relativeCandidate.startsWith(`..${sep}`) || relativeCandidate === "") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }
  const filePath = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(frontendRoot, "index.html");
  if (!existsSync(filePath)) {
    sendJson(response, 503, { error: "frontend_build_required", detail: "Run npm run build." });
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
    "cache-control": extname(filePath) === ".html" ? "no-store" : "public, max-age=3600",
  });
  response.end(readFileSync(filePath));
}

function judgeManifest(contextId: string | null) {
  const databasePath = join(workspaceRoot, "pack-cases.sqlite");
  if (!existsSync(databasePath)) return { status: 503 as const, body: { error: "judge_demo_required", detail: "Run npm run demo:judge first." } };

  const handle = openExistingJudgeStore(databasePath);
  try {
    const tenantId = DEMO_SIMULATION_TENANT;
    const selectedContextId = contextId ?? resolveJudgeContextId(handle.store, tenantId);
    if (!selectedContextId || !handle.store.getContext(tenantId, selectedContextId)) {
      return { status: 404 as const, body: { error: "no_context_available" } };
    }
    const payloadSourcePath = process.env.JUDGE_UNS_STREAM?.trim()
      ? resolve(process.env.JUDGE_UNS_STREAM.trim())
      : join(workspaceRoot, UNS_STREAM_ARTIFACT_NAME);
    const liveArtifactPath = join(artifactRoot, JUDGE_LIVE_ARTIFACT);
    const defaultLiveArtifactPath = join(workspaceRoot, JUDGE_LIVE_ARTIFACT);
    return {
      status: 200 as const,
      body: buildJudgeManifest({
        store: handle.store,
        tenantId,
        contextId: selectedContextId,
        payloadSourcePath,
        readback: readExecutionReadbackArtifact(join(workspaceRoot, JUDGE_READBACK_ARTIFACT)),
        contract: readJudgeContractArtifact(join(workspaceRoot, JUDGE_CONTRACT_ARTIFACT)),
        liveFulfillment: readLiveFulfillmentArtifact(existsSync(liveArtifactPath) ? liveArtifactPath : defaultLiveArtifactPath),
      }),
    };
  } finally {
    handle.close();
  }
}

async function handleRequest(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const basePath = process.env.APP_BASE_PATH?.replace(/\/?$/, "/") || "/";
  const pathname = basePath !== "/" && url.pathname.startsWith(basePath)
    ? `/${url.pathname.slice(basePath.length)}` : url.pathname;
  const session = getLiveSession();
  if (request.method === 'GET' && pathname === '/api/v2/demo/fulfillment/product-view') {
    await session.ensureConnected();
    if (!session.runtime.state.observations.some(o => o.envelope.source.systemType === 'erp' && !o.isSourceProgress)) return sendJson(response, 503, { error: 'SOURCE_FACTS_NOT_READY' });
    return sendJson(response, 200, session.productView());
  }
  if (request.method === 'POST' && (pathname === '/api/copilot/brief' || pathname.startsWith('/api/v2/demo/fulfillment/'))) {
    // Browser actions must come from this product origin; credentials remain server-side.
    if (request.headers.origin && new URL(request.headers.origin).host !== url.host) return sendJson(response, 403, { error: 'origin_mismatch' });
    if (pathname === '/api/copilot/brief') {
      let body = ''; for await (const chunk of request) body += chunk;
      const input = JSON.parse(body || '{}') as { caseId?: string };
      await session.ensureConnected();
      if (!session.runtime.state.observations.some(o => o.envelope.source.systemType === 'erp' && !o.isSourceProgress)) return sendJson(response, 200, { available: false, reason: 'SOURCE_FACTS_NOT_READY' });
      const view = session.productView();
      if (!input.caseId || input.caseId !== view.case.id) return sendJson(response, 400, { error: 'case_id_mismatch' });
      const provider = resolveCopilotProvider();
      return sendJson(response, 200, provider.ok ? await generateCopilotBrief(view, provider.provider) : { available: false, reason: 'AI_NOT_CONFIGURED' });
    }
    if (pathname.endsWith('/reset')) return sendJson(response, 200, { ok: true, session: session.reset() });
    if (pathname.endsWith('/confirm-disposition')) return sendJson(response, 200, { ok: true, productView: session.confirmDisposition() });
    if (pathname.endsWith('/simulate-wms-execution')) {
      try { return sendJson(response, 200, { ok: true, ...await session.simulateWmsExecution() }); }
      catch { return sendJson(response, 503, { ok: false, error: 'RUNTIME_UNREACHABLE' }); }
    }
    return sendJson(response, 404, { error: 'not_found' });
  }
  if (request.method !== "GET") return sendJson(response, 405, { error: "method_not_allowed" });
  if (pathname === "/api/health") return sendJson(response, 200, { ok: true });
  if (pathname === "/api/v2/demo/judge/manifest") {
    const result = judgeManifest(url.searchParams.get("contextId"));
    return sendJson(response, result.status, result.body);
  }
  if (pathname.startsWith("/api/")) return sendJson(response, 404, { error: "not_found" });
  return sendFrontendFile(response, pathname);
}

const host = process.env.HOST?.trim() || "0.0.0.0";
const port = Number(process.env.PORT ?? "3410");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("INVALID_PORT");

createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    console.error("public_request_failed", error instanceof Error ? error.name : "unknown");
    if (!response.headersSent) sendJson(response, 500, { error: "internal_error" });
    else response.destroy();
  });
}).listen(port, host, () => {
  console.log(`Fulfillment Sentinel listening on http://${host}:${port}`);
});
