// Read-only inspection from inside the App's isolated Compose network.
import { readFileSync } from 'node:fs';
import { connectAsync } from 'mqtt';

const platformUrl = process.env.SUPOS_BOOTSTRAP_API || 'http://backend:8080';
const nodeRedUrl = process.env.DEMO_NODERED_URL || 'http://nodered:1880';
const mqttUrl = process.env.J2_MQTT_URL || '';
const appUrl = `http://127.0.0.1:${process.env.PORT || '3410'}`;
const modelNames = ['J2_ERP_OrderLine', 'J2_MES_Production', 'J2_QMS_Quality', 'J2_WMS_Shipment', 'J2_SourceProgress'];
const paths = modelNames.map(name => `/supos/${name}`);
const publicTarget = value => { const u = new URL(value); return `${u.protocol}//${u.host}`; };
const result = {
  targets: { platform: publicTarget(platformUrl), mqtt: mqttUrl ? publicTarget(mqttUrl) : '', nodeRed: publicTarget(nodeRedUrl) },
  platform: { reachable: false }, mqtt: { connected: false },
  flow: { verified: false, matchedPaths: 0 },
  uns: { models: [], currentReadable: false, current: {} },
  case: { initialized: false },
  aiConfigured: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL),
};

try {
  const response = await fetch(`${platformUrl}/open-api/uns/folder/supos`, { signal: AbortSignal.timeout(6000) });
  const body = await response.json();
  result.platform = { reachable: response.ok && body.code === 200, code: body.code };
} catch (error) { result.platform.error = error instanceof Error ? error.name : 'unknown'; }

if (mqttUrl) {
  try {
    const client = await connectAsync(mqttUrl, { reconnectPeriod: 0, connectTimeout: 6000 });
    result.mqtt.connected = client.connected;
    await client.endAsync();
  } catch (error) { result.mqtt.error = error instanceof Error ? error.name : 'unknown'; }
}

try {
  const response = await fetch(`${nodeRedUrl}/flows`, { signal: AbortSignal.timeout(6000) });
  if (response.ok) {
    const body = await response.json();
    const actual = Array.isArray(body) ? body : body.flows;
    const expected = JSON.parse(readFileSync('deploy/nodered-j2-flow.json', 'utf8'));
    if (Array.isArray(actual)) {
      const byId = new Map(actual.map(node => [node.id, node]));
      const expectedInputs = expected.filter(node => node.type === 'mqtt in');
      const matched = expectedInputs.filter(input => {
        const expectedFunction = expected.find(node => node.id === input.wires?.[0]?.[0]);
        const expectedOutput = expected.find(node => node.id === expectedFunction?.wires?.[0]?.[0]);
        return actual.some(node => {
          if (node.type !== 'mqtt in' || node.topic !== input.topic || node.name !== input.name) return false;
          const fn = byId.get(node.wires?.[0]?.[0]);
          const out = byId.get(fn?.wires?.[0]?.[0]);
          const inputBroker = byId.get(node.broker);
          const outputBroker = byId.get(out?.broker);
          return fn?.type === 'function' && fn.func === expectedFunction?.func
            && out?.type === 'mqtt out' && out.name === expectedOutput?.name
            && out.topic === expectedOutput?.topic
            && inputBroker?.type === 'mqtt-broker' && inputBroker.broker === 'emqx'
            && String(inputBroker.port) === '1883' && outputBroker?.id === inputBroker.id;
        });
      });
      result.flow = { verified: matched.length === 8, matchedPaths: matched.length, deployedNodes: actual.length };
    }
  } else result.flow.http = response.status;
} catch (error) { result.flow.error = error instanceof Error ? error.name : 'unknown'; }

try {
  for (const name of modelNames) {
    const response = await fetch(`${platformUrl}/open-api/uns/file/${name}`, { signal: AbortSignal.timeout(6000) });
    const body = await response.json();
    if (response.ok && body.code === 200 && body.data?.path === `/supos/${name}`) result.uns.models.push(name);
  }
  const response = await fetch(`${platformUrl}/open-api/uns/file/current/batchQuery/byPath`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(paths),
    signal: AbortSignal.timeout(6000),
  });
  const body = await response.json();
  result.uns.currentReadable = response.ok && body.code === 200;
  if (result.uns.currentReadable) {
    const d = body.data || {};
    result.uns.current = {
      ERP: d[paths[0]]?.requiredQty ?? null,
      MES: d[paths[1]]?.completedQty ?? null,
      QMS: d[paths[2]]?.releasedQty ?? null,
      WMS: d[paths[3]]?.executionCommittedQty ?? null,
      progress: d[paths[4]]?.sourceProgressAt ?? null,
    };
  }
} catch (error) { result.uns.error = error instanceof Error ? error.name : 'unknown'; }

try {
  const response = await fetch(`${appUrl}/api/v2/demo/fulfillment/product-view`, { signal: AbortSignal.timeout(6000) });
  if (response.ok) {
    const view = await response.json();
    result.case = {
      initialized: true, id: view.case?.id, status: view.evaluation?.status,
      facts: { ERP: view.facts?.order?.qty, MES: view.facts?.production?.qty,
        QMS: view.facts?.quality?.qty, WMS: view.facts?.shipment?.qty },
      watermark: view.evaluation?.globalWatermark,
      sourceProgress: view.evaluation?.sourceProgress,
      eventCount: view.runtime?.events?.length,
    };
  } else result.case.http = response.status;
} catch (error) { result.case.error = error instanceof Error ? error.name : 'unknown'; }

console.log(JSON.stringify(result));
