// Host-side Compose delivery commands. Run from the extracted ZIP root on the isolated Docker Engine.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const exec = promisify(execFile);
const mode = process.argv[2];
const project = process.env.DEMO_COMPOSE_PROJECT || '';
const compose = ['compose', '-p', project, '-f', 'docker-compose.yml', '-f', 'deploy/compose.open-supos.yml'];
const sleep = ms => new Promise(done => setTimeout(done, ms));
const required = (condition, code) => { if (!condition) throw new Error(code); };

async function docker(args, timeout = 20000) {
  try {
    const { stdout } = await exec('docker', args, { cwd: process.cwd(), timeout, maxBuffer: 2_000_000 });
    return stdout.trim();
  } catch { throw new Error('DOCKER_COMMAND_FAILED'); }
}
async function probe() {
  return JSON.parse(await docker([...compose, 'exec', '-T', 'app', 'node', 'deploy/demo-probe.mjs'], 45000));
}
async function getView(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/v2/demo/fulfillment/product-view`, { signal: AbortSignal.timeout(8000) });
  return { http: response.status, body: await response.json() };
}
async function post(port, action) {
  const response = await fetch(`http://127.0.0.1:${port}/api/v2/demo/fulfillment/${action}`, {
    method: 'POST', signal: AbortSignal.timeout(20000),
  });
  return { http: response.status, body: await response.json() };
}
function facts(view) {
  return [view.facts?.order?.qty, view.facts?.production?.qty,
    view.facts?.quality?.qty, view.facts?.shipment?.qty];
}
function matches(values, expected) { return values.every((value, index) => value === expected[index]); }
function events(view) {
  return (view.runtime?.events || []).map(event => ({
    id: event.id, source: event.source, sourceTime: event.sourceTime,
    canonicalTopic: event.canonicalTopic, isSourceProgress: event.isSourceProgress,
  }));
}
function report(name, body) {
  const dir = resolve('artifacts');
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${name}-${new Date().toISOString().replaceAll(':', '-')}.json`);
  writeFileSync(path, JSON.stringify(body, null, 2) + '\n');
  return path;
}

async function preflight() {
  const result = {
    at: new Date().toISOString(), mode: 'read-only',
    status: { PLATFORM_READY: 'NOT_VERIFIED', APP_HEALTHY: 'FAIL', MQTT_READY: 'NOT_VERIFIED',
      FLOW_READY: 'NOT_VERIFIED', UNS_READY: 'NOT_VERIFIED', CASE_READY: 'NOT_INITIALIZED', AI_OPTIONAL: 'WARN' },
    context: {}, evidence: {},
  };
  if (!project) { result.evidence.error = 'DEMO_COMPOSE_PROJECT_REQUIRED'; return result; }
  try {
    const dockerId = await docker(['info', '--format', '{{.ID}}']);
    const container = await docker([...compose, 'ps', '-q', 'app']);
    result.context = { dockerId, composeProject: project, appContainer: container || null };
    if (!container) { result.evidence.error = 'APP_CONTAINER_NOT_FOUND'; return result; }
    const running = await docker(['inspect', '--format', '{{.State.Running}}', container]);
    const label = await docker(['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', container]);
    const networks = JSON.parse(await docker(['inspect', '--format', '{{json .NetworkSettings.Networks}}', container]));
    const ports = await docker(['port', container, '3410/tcp']);
    const portMatch = ports.match(/:(\d+)\s*$/m);
    const port = portMatch ? Number(portMatch[1]) : null;
    result.context = { ...result.context, label, networks: Object.keys(networks), appPort: port };
    if (running !== 'true' || label !== project || !port) {
      result.evidence.error = 'APP_CONTAINER_NOT_RUNNING_OR_PROJECT_MISMATCH'; return result;
    }
    const health = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(6000) });
    result.status.APP_HEALTHY = health.ok ? 'PASS' : 'FAIL';
    result.evidence.healthHttp = health.status;
    const p = await probe();
    result.context = { ...result.context, platform: p.targets.platform, mqtt: p.targets.mqtt,
      nodeRed: p.targets.nodeRed };
    result.status.PLATFORM_READY = p.platform.reachable ? 'PASS' : 'FAIL';
    result.status.MQTT_READY = p.mqtt.connected ? 'PASS' : 'FAIL';
    result.status.FLOW_READY = p.flow.verified ? 'PASS'
      : (p.flow.error || p.flow.http ? 'NOT_VERIFIED' : 'FAIL');
    result.status.UNS_READY = p.uns.models.length === 5 && p.uns.currentReadable ? 'PASS'
      : (p.uns.error ? 'NOT_VERIFIED' : 'FAIL');
    result.status.CASE_READY = p.case.initialized ? 'PASS' : 'NOT_INITIALIZED';
    result.status.AI_OPTIONAL = p.aiConfigured ? 'PASS' : 'WARN';
    result.evidence = { ...result.evidence, platformCode: p.platform.code,
      flowMatchedPaths: p.flow.matchedPaths, flowDeployedNodes: p.flow.deployedNodes,
      unsModels: p.uns.models, unsCurrentReadable: p.uns.currentReadable,
      unsCurrent: p.uns.current, case: p.case,
      ai: p.aiConfigured ? 'configured' : 'not configured; deterministic flow available' };
  } catch (error) { result.evidence.error = error instanceof Error ? error.message : 'UNKNOWN_ERROR'; }
  return result;
}

function checkWriteTarget(pre) {
  const c = pre.context;
  const s = pre.status;
  required(c.dockerId && c.label === project, 'COMPOSE_PROJECT_MISMATCH');
  required(process.env.DEMO_EXPECT_DOCKER_ID === c.dockerId, 'DOCKER_ENGINE_NOT_ACKNOWLEDGED');
  required(process.env.DEMO_EXPECT_COMPOSE_PROJECT === project, 'COMPOSE_PROJECT_NOT_ACKNOWLEDGED');
  required(process.env.DEMO_EXPECT_PLATFORM_URL === c.platform, 'PLATFORM_TARGET_NOT_ACKNOWLEDGED');
  required(process.env.DEMO_EXPECT_MQTT_URL === c.mqtt, 'MQTT_TARGET_NOT_ACKNOWLEDGED');
  required(Number(process.env.DEMO_EXPECT_APP_PORT) === c.appPort, 'APP_PORT_NOT_ACKNOWLEDGED');
  required(process.env.DEMO_ACTION_ACK === `${c.dockerId}/${project}`, 'ACTION_NOT_ACKNOWLEDGED');
  required(process.env.SUPOS_DOCKER_NETWORK && c.networks.includes(process.env.SUPOS_DOCKER_NETWORK),
    'PLATFORM_NETWORK_MISMATCH');
  for (const key of ['PLATFORM_READY', 'APP_HEALTHY', 'MQTT_READY', 'FLOW_READY', 'UNS_READY']) {
    required(s[key] === 'PASS', `${key}_NOT_PASS`);
  }
}

async function prepare() {
  const before = await preflight();
  checkWriteTarget(before);
  if (before.status.CASE_READY === 'PASS') {
    required(process.env.DEMO_ALLOW_EXISTING_CASE_RESET === 'YES', 'EXISTING_CASE_RESET_NOT_ACKNOWLEDGED');
  }
  // The existing reset API only clears this process's observations/disposition. The seed script
  // requires an explicit flag, subscribes first, publishes eight RAW messages, then checks the result.
  const seeded = JSON.parse(await docker([...compose, 'exec', '-T', '-e', 'DEMO_RESET_AUTHORIZED=YES',
    'app', 'node', 'deploy/seed-runtime.mjs'], 30000));
  let after;
  for (let attempt = 0; attempt < 20; attempt++) {
    after = await probe();
    if (matches([after.uns.current.ERP, after.uns.current.MES, after.uns.current.QMS, after.uns.current.WMS],
      [100, 96, 96, 100])) break;
    await sleep(350);
  }
  required(after.case.status === 'FULFILLMENT_STATE_CONFLICT', 'PREPARE_STATUS_MISMATCH');
  required(matches([after.case.facts.ERP, after.case.facts.MES, after.case.facts.QMS, after.case.facts.WMS],
    [100, 96, 96, 100]), 'PREPARE_FACTS_MISMATCH');
  required(matches([after.uns.current.ERP, after.uns.current.MES, after.uns.current.QMS, after.uns.current.WMS],
    [100, 96, 96, 100]), 'PREPARE_UNS_CURRENT_MISMATCH');
  required(after.case.watermark === '2026-03-01T07:00:00.000Z', 'PREPARE_WATERMARK_MISMATCH');
  required(['ERP', 'MES', 'QMS', 'WMS'].every(key =>
    after.case.sourceProgress?.[key] === '2026-03-01T07:00:00.000Z'), 'PREPARE_PROGRESS_MISMATCH');
  return { status: 'PASS', context: before.context, priorCase: before.evidence.case,
    seeded, case: after.case, unsCurrent: after.uns.current };
}

async function verify() {
  const before = await preflight();
  checkWriteTarget(before);
  required(before.status.CASE_READY === 'PASS', 'CASE_NOT_INITIALIZED');
  const port = before.context.appPort;
  const first = await getView(port);
  required(first.http === 200 && first.body.evaluation?.status === 'FULFILLMENT_STATE_CONFLICT'
    && matches(facts(first.body), [100, 96, 96, 100]), 'INITIAL_CONFLICT_MISMATCH');
  required(first.body.evaluation?.globalWatermark === '2026-03-01T07:00:00.000Z', 'INITIAL_WATERMARK_MISMATCH');
  const confirmed = await post(port, 'confirm-disposition');
  const waiting = await getView(port);
  required(confirmed.http === 200 && waiting.http === 200
    && waiting.body.evaluation?.status === 'WAITING_FOR_EXECUTION_VERIFICATION'
    && matches(facts(waiting.body), [100, 96, 96, 100]), 'WAITING_MISMATCH');
  const simulated = await post(port, 'simulate-wms-execution');
  required(simulated.http === 200, 'WMS_RAW_PUBLICATION_FAILED');
  let closed;
  for (let attempt = 0; attempt < 25; attempt++) {
    closed = await getView(port);
    if (closed.http === 200 && closed.body.evaluation?.status === 'REVALIDATED_CLOSED') break;
    await sleep(300);
  }
  required(closed.http === 200 && closed.body.evaluation?.status === 'REVALIDATED_CLOSED'
    && matches(facts(closed.body), [100, 96, 96, 96]), 'CLOSED_MISMATCH');
  required(closed.body.evaluation?.globalWatermark === '2026-03-01T08:00:00.000Z', 'CLOSED_WATERMARK_MISMATCH');
  required(closed.body.evaluation?.facts?.requiredQty - closed.body.evaluation?.facts?.executionCommittedQty === 4,
    'CUSTOMER_REMAINDER_MISMATCH');
  const initialIds = new Set(events(first.body).map(event => event.id));
  const delivered = events(closed.body).filter(event => !initialIds.has(event.id));
  required(delivered.some(event => event.source === 'WMS' && !event.isSourceProgress),
    'WMS_CANONICAL_EVENT_NOT_OBSERVED');
  let finalProbe;
  for (let attempt = 0; attempt < 20; attempt++) {
    finalProbe = await probe();
    if (finalProbe.uns.current.ERP === 100 && finalProbe.uns.current.WMS === 96) break;
    await sleep(350);
  }
  required(finalProbe.uns.currentReadable && finalProbe.uns.current.ERP === 100
    && finalProbe.uns.current.WMS === 96, 'PLATFORM_UNS_CURRENT_MISMATCH');
  const body = {
    status: 'PASS', simulatedIndustrialData: true, at: new Date().toISOString(),
    context: before.context,
    steps: [
      { name: 'CONFLICT', http: first.http, status: first.body.evaluation.status, facts: facts(first.body),
        watermark: first.body.evaluation.globalWatermark, events: events(first.body) },
      { name: 'HUMAN_CONFIRM', http: confirmed.http, status: waiting.body.evaluation.status,
        facts: facts(waiting.body), watermark: waiting.body.evaluation.globalWatermark },
      { name: 'WMS_RAW_TO_CLOSED', http: simulated.http, status: closed.body.evaluation.status,
        facts: facts(closed.body), watermark: closed.body.evaluation.globalWatermark,
        publishedRawTopics: (simulated.body.published || []).map(item => item.topic), newEvents: delivered },
    ],
    platformUnsCurrent: { ERP: finalProbe.uns.current.ERP, WMS: finalProbe.uns.current.WMS },
    remainingCustomerDemand: 4, aiOptional: before.status.AI_OPTIONAL,
    tsdbHistoryPersistenceVerified: false,
  };
  body.report = report('demo-verify', body);
  return body;
}

try {
  required(project, 'DEMO_COMPOSE_PROJECT_REQUIRED');
  const output = mode === 'preflight' ? await preflight()
    : mode === 'prepare' ? await prepare()
    : mode === 'verify' ? await verify()
    : (() => { throw new Error('UNKNOWN_DEMO_COMMAND'); })();
  console.log(JSON.stringify(output, null, 2));
  if (mode !== 'preflight' && output.status !== 'PASS') process.exitCode = 1;
} catch (error) {
  const failure = { status: 'FAIL', at: new Date().toISOString(), mode,
    error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' };
  if (mode === 'verify') failure.report = report('demo-verify-failed', failure);
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
}
