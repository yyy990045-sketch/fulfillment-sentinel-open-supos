import { readFileSync } from 'node:fs';
import { connectAsync } from 'mqtt';

const broker = process.env.J2_MQTT_URL;
if (!broker) throw new Error('J2_MQTT_URL_REQUIRED');
if (process.env.DEMO_RESET_AUTHORIZED !== 'YES') throw new Error('DEMO_RESET_AUTHORIZATION_REQUIRED');

const base = `http://127.0.0.1:${process.env.PORT || '3410'}`;
const reset = await fetch(`${base}/api/v2/demo/fulfillment/reset`, { method: 'POST' });
if (!reset.ok) throw new Error(`SESSION_RESET_FAILED_${reset.status}`);
const resetBody = await reset.json();
if (resetBody.session?.observations !== 0 || resetBody.session?.disposition?.status !== 'none') {
  throw new Error('SESSION_RESET_NOT_VERIFIED');
}

// The first read establishes the canonical subscription before RAW is published.
await fetch(`${base}/api/v2/demo/fulfillment/product-view`);
const events = JSON.parse(readFileSync('deploy/demo-seed.json', 'utf8'));
if (events.length !== 8 || new Set(events.map(event => event.topic)).size !== 8
  || events.some(event => !event.topic.startsWith('/source/j2/'))) {
  throw new Error('UNEXPECTED_DEMO_SEED');
}

const client = await connectAsync(broker, { reconnectPeriod: 0, connectTimeout: 8000 });
try {
  for (const event of events) await client.publishAsync(event.topic, JSON.stringify(event.payload));
} finally {
  await client.endAsync();
}
let verified;
for (let attempt = 0; attempt < 40; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 250));
  const response = await fetch(`${base}/api/v2/demo/fulfillment/product-view`);
  if (!response.ok) continue;
  const view = await response.json();
  if (view.runtime?.events?.length !== 8) continue;
  verified = view;
  break;
}
if (!verified || verified.evaluation?.status !== 'FULFILLMENT_STATE_CONFLICT'
  || verified.facts?.order?.qty !== 100 || verified.facts?.production?.qty !== 96
  || verified.facts?.quality?.qty !== 96 || verified.facts?.shipment?.qty !== 100
  || ['ERP', 'MES', 'QMS', 'WMS'].some(key =>
    verified.evaluation?.sourceProgress?.[key] !== '2026-03-01T07:00:00.000Z')) {
  throw new Error('SEED_RESULT_UNEXPECTED');
}
console.log(JSON.stringify({ published: events.length, status: verified.evaluation.status,
  facts: [100, 96, 96, 100], watermark: verified.evaluation.globalWatermark,
  eventCount: verified.runtime.events.length }));
