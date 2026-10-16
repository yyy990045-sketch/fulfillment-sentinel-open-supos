import type { ProductView as RuntimeProductView } from '../../../../../src/integrations/open-supos/product-view.js';
import type { JudgeManifestView } from '../types.js';
import { DEMO_DATA as DEMO_ORDERS, mappings, objects, scenarios, sources, type Order, type Phase, type Source } from './demo-data.js';
export type ProductEvent = { id: string; eventId?: string; source: Source | 'SENTINEL'; time: string; text: string; value: number; before?: number; pending?: boolean; sourceTime?: string; topic: string; businessRef: string; stages: string[]; reached?: number; isLatest?: boolean };
export type ProductFact = { source: Source; label: string; quantity: number | null; instance: string; sourceTime: string; topic: string; progressTime: string };
export type ProductScenario = { id: string; label: string; result: string; reason: string; quantities: Order['quantities']; status: string; relation: string; watermark: string; sourceProgress: Record<string, string>; disposition: string };
export type FulfillmentProductView = {
  case: Order & { dueAt: string; notes: string[]; origin: 'demo' | 'backend-demo' | 'backend-live' };
  facts: ProductFact[];
  evidence: { lineage: string; resolved: boolean; watermark: string; boundary: string; productionState: string; authority: string };
  pendingEventId?: string;
  workflow: { phase: Phase; status: string; history: { time: string; text: string; step: number }[]; actionMode: 'local-demo' | 'runtime'; reason: string; externalObligation: string };
  events: ProductEvent[];
  runtime: { eventMode: 'demo' | 'snapshot'; receivedToday: number; components: { name: string; purpose: string; summary: string }[]; flows: { source: Source; kind: string; input: string; output: string }[] };
  uns: { name: string; label: string; source: Source; instance: string; quantity: number | null; relation: string; updated: string; topic: string; mapping: { raw: string; canonical: string }[] }[];
  validation: ProductScenario[];
};
const statuses: Record<Phase, string> = { quality: 'WAITING_FOR_SOURCE_PROGRESS', decision: 'FULFILLMENT_STATE_CONFLICT', execution: 'WAITING_FOR_EXECUTION_VERIFICATION', recheck: 'WAITING_FOR_REVALIDATION', closed: 'REVALIDATED_CLOSED' };
export function displayTime(value: string) { return value.includes('T') ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false }) : value; }
function seed(order: Order): FulfillmentProductView {
  const dueAt = `2026-10-${['08', '09', '10', '11'][Number(order.id.slice(-3)) - 1]}T09:00:00+08:00`;
  const boundary = dueAt.replace('09:00', '10:00'); const date = dueAt.slice(0, 10);
  const refs = [`${order.id} / ${order.line}`, `WO-${order.id.replace('SO-', '')}`, order.lot, `SL-${order.id.replace('SO-', '')}`];
  const facts = sources.map((source, i): ProductFact => ({ source, label: ['客户订单', '生产完成', '质量放行', '仓库计划'][i]!, quantity: order.quantities[i]!, instance: refs[i]!, sourceTime: `${date}T${['10:31:02', '10:31:04', '10:31:05', '10:31:08'][i]}+08:00`, topic: mappings[source].topic, progressTime: `${date}T${order.phase === 'quality' && source === 'QMS' ? '09:00:00' : '10:31:09'}+08:00` }));
  const events = facts.filter(fact => fact.quantity !== null).map((fact): ProductEvent => ({ id: `${order.id}-${fact.source}`, source: fact.source, sourceTime: fact.sourceTime, time: displayTime(fact.sourceTime), text: `${fact.label} ${fact.quantity} 件`, value: fact.quantity!, topic: fact.topic, businessRef: fact.instance, stages: [fact.source, 'EMQX', 'Node-RED', 'UNS', '履约哨兵'] }));
  return {
    case: { ...order, dueAt, notes: [], origin: 'demo' }, facts,
    evidence: { lineage: `${refs[0]} → ${refs[1]} → ${order.lot} → ${refs[3]}`, resolved: true, watermark: `${date}T${order.phase === 'quality' ? '09:00:00' : '10:31:09'}+08:00`, boundary, productionState: 'terminal', authority: order.phase === 'execution' || order.phase === 'closed' ? '演示人工确认' : '等待人工确认' },
    workflow: { phase: order.phase, status: statuses[order.phase], history: [{ time: '09:20', text: order.phase === 'quality' ? '等待质量来源更新' : '发现履约差异', step: 0 }, { time: '09:22', text: '订单行与生产批次关联已确认', step: 0 }, ...(order.phase === 'quality' ? [] : [{ time: '09:25', text: '生成当前处理建议', step: 1 }]), ...(order.phase === 'execution' || order.phase === 'closed' ? [{ time: '09:28', text: `已确认按 ${order.quantities[2]} 件执行`, step: 1 }] : []), ...(order.phase === 'closed' ? [{ time: '10:31:08', text: `仓库执行 ${order.quantities[3]} 件`, step: 2 }, { time: '10:31:10', text: '来源关联、共同水位与执行事实复核通过', step: 4 }] : [])], actionMode: 'local-demo', reason: '仓库计划不得超过当前质量放行数量。', externalObligation: `客户订单要求仍为 ${order.quantities[0]} 件，内部处置不改写订单承诺。` }, events: order.phase === 'quality' ? events : [...events, sentinelEvent(order.id, order.phase === 'closed' ? '重新验证完成' : '履约风险确认', order.quantities[3])],
    runtime: { eventMode: 'demo', receivedToday: 1284, components: [{ name: 'EMQX', purpose: '接收四源 MQTT 事件', summary: '今日接收 1,284 条演示事件' }, { name: 'Node-RED', purpose: '字段识别与关系规范化', summary: '8 条 Source Flow' }, { name: 'UNS', purpose: '统一业务对象与关联', summary: '5 个业务模型' }], flows: sources.flatMap(source => [{ source, kind: '业务事实', input: mappings[source].input, output: mappings[source].topic }, { source, kind: '来源进度', input: `/source/j2/progress/${source.toLowerCase()}`, output: '/supos/J2_SourceProgress' }]) },
    uns: objects.map((object, i) => ({ name: object.name, label: object.label, source: object.source, instance: [refs[0], refs[1], order.lot, `QL-${order.id.replace('SO-', '')}`, refs[3]][i]!, quantity: order.quantities[[0, 1, 1, 2, 3][i]!]!, relation: i === 4 ? `sourceOrderLineRef → ${refs[0]}` : `${object.relation} → ${order.lot}`, updated: facts.find(fact => fact.source === object.source)!.sourceTime, topic: mappings[object.source].topic, mapping: mappings[object.source].raw.map((raw, index) => ({ raw, canonical: mappings[object.source].canonical[index]! })) })),
    validation: scenarios.map((scenario, i) => ({ id: ['missing', 'lineage', 'conflict', 'complete'][i]!, label: scenario.label, result: i === 1 ? '无法确认同一笔订单' : i === 3 ? '已完成复核' : scenario.result, reason: scenario.reason, quantities: [100, 96, i === 0 ? null : 96, i === 3 ? 96 : 100], status: ['WAITING_FOR_SOURCE_PROGRESS', 'LINEAGE_UNRESOLVED', 'FULFILLMENT_STATE_CONFLICT', 'REVALIDATED_CLOSED'][i]!, relation: i === 1 ? 'ERP SO-001 × MES SO-999' : '同一订单行与生产批次', watermark: '10:31:02 至 10:31:09', sourceProgress: { ERP: '已覆盖', MES: '已覆盖', QMS: i === 0 ? '等待覆盖' : '已覆盖', WMS: '已覆盖' }, disposition: '内部处置不改变客户原始需求' })),
  };
}
function sentinelEvent(id: string, text: string, value: number, time = '10:31:10'): ProductEvent { return { id: `${id}-sentinel-${text}`, source: 'SENTINEL', time, text, value, topic: '履约判定记录', businessRef: id, stages: ['履约哨兵'] }; }
export const DEMO_DATA: FulfillmentProductView[] = DEMO_ORDERS.map(seed);
/** Existing read API and seeded demo share exactly one front-end shape. */
export function fromManifest(manifest: JudgeManifestView): FulfillmentProductView | null {
  const contract = manifest.fulfillment;
  if (!contract || contract.businessKey !== 'SO-IND-001' || contract.cases.length === 0) return null;
  const current = contract.cases.find(item => item.caseId === contract.currentCase);
  if (!current) return null;
  const live = manifest.liveFulfillment; const data = live?.facts ?? contract.facts;
  const status = live?.status ?? current.status;
  const phase: Phase = status === 'REVALIDATED_CLOSED' ? 'closed' : status === 'WAITING_FOR_EXECUTION_VERIFICATION' ? 'execution' : status === 'WAITING_FOR_SOURCE_PROGRESS' ? 'quality' : 'decision';
  const base = DEMO_DATA[0]!;
  const quantities: Order['quantities'] = [data.requiredQty, data.completedQty, status === 'WAITING_FOR_SOURCE_PROGRESS' ? null : data.releasedQty, data.executionCommittedQty];
  const refs = [contract.facts.sourceOrderLineRef, contract.facts.workOrderRef, contract.facts.productionLotRef, contract.facts.shipmentSourceRef];
  const facts = base.facts.map((fact, i) => {
    const source = live?.sources.find(item => item.systemType.toUpperCase() === fact.source || item.systemKey.startsWith(fact.source));
    return { ...fact, quantity: quantities[i]!, instance: source?.businessRef ?? refs[i]!, sourceTime: source?.sourceTime ?? data.dueAt.slice(0, 10) + fact.sourceTime.slice(10), progressTime: live?.sourceProgress[fact.source] ?? contract.facts.sourceProgress[fact.source]!, topic: source?.canonicalTopic ?? fact.topic };
  });
  const events = facts.filter(fact => fact.quantity !== null).map((fact): ProductEvent => ({ id: `backend-${fact.source}-${fact.sourceTime}`, source: fact.source, sourceTime: fact.sourceTime, time: displayTime(fact.sourceTime), text: `${fact.label} ${fact.quantity} 件`, value: fact.quantity!, topic: fact.topic, businessRef: fact.instance, stages: [fact.source, 'EMQX', 'Node-RED', 'UNS', '履约哨兵'] }));
  return { ...base,
    evidence: { lineage: live?.lineage.relation ?? current.lineage.relation, resolved: (live?.lineage.status ?? current.lineage.status) === 'RESOLVED', watermark: live?.globalWatermark ?? current.globalWatermark, boundary: live?.dueAtWithGrace ?? current.dueAtWithGrace, productionState: data.productionState, authority: live?.disposition.authority ?? current.disposition.authority },
    case: { ...base.case, id: contract.businessKey, quantities, phase, dueAt: data.dueAt, due: new Date(data.dueAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }), lot: contract.facts.productionLotRef, origin: live ? 'backend-live' : 'backend-demo' }, facts, events: [...events, sentinelEvent(contract.businessKey, phase === 'closed' ? '重新验证完成' : phase === 'quality' ? '等待来源覆盖' : '履约风险确认', quantities[3], displayTime(new Date(Date.parse(live?.globalWatermark ?? current.globalWatermark) + 1000).toISOString()))],
    workflow: { ...base.workflow, phase, status, reason: live?.reason ?? current.reason, externalObligation: live?.externalObligation ?? current.externalObligation },
    runtime: { ...base.runtime, eventMode: 'snapshot' },
    uns: base.uns.map((model, i) => ({ ...model, instance: [refs[0], refs[1], refs[2], refs[2], refs[3]][i]!, quantity: quantities[[0, 1, 1, 2, 3][i]!]!, updated: facts.find(fact => fact.source === model.source)!.sourceTime, topic: facts.find(fact => fact.source === model.source)!.topic, relation: i === 4 ? `sourceOrderLineRef → ${refs[0]}` : (live?.lineage.relation ?? contract.lineage.relation) })),
    validation: base.validation.map((scenario, i) => { const reference = contract.cases.find(item => item.caseId === (['B', null, 'C', 'E'][i])); return reference ? { ...scenario, quantities: [reference.facts.requiredQty, reference.facts.completedQty, i === 0 ? null : reference.facts.releasedQty, reference.facts.executionCommittedQty], status: reference.status, reason: reference.reason, relation: reference.lineage.relation, watermark: reference.globalWatermark, sourceProgress: reference.facts.sourceProgress, disposition: reference.externalObligation } : scenario; }),
  };
}
export function advanceDemo(view: FulfillmentProductView): FulfillmentProductView {
  const time = displayTime(new Date(Math.max(Date.parse(view.evidence.watermark), ...view.facts.map(fact => Date.parse(fact.sourceTime))) + 2000).toISOString()); const order = view.case;
  const q = [...order.quantities] as Order['quantities'];
  const next: Record<Phase, Phase> = { quality: 'recheck', decision: 'execution', execution: 'recheck', recheck: 'closed', closed: 'decision' };
  if (order.phase === 'execution') return queueWarehouseEvent(view);
  if (order.phase === 'closed') { const seed = DEMO_DATA.find(item => item.case.id === order.id)!; return { ...seed, case: { ...seed.case, notes: order.notes } }; }
  if (order.phase === 'quality') q[2] = q[1];
  const phase = next[order.phase];
  const text = order.phase === 'quality' ? `质量来源更新：放行 ${q[2]} 件` : order.phase === 'decision' ? `已确认按 ${q[2]} 件执行，等待仓库新事实` : '来源关系与执行数量已完成复核';
  const changedSource = order.phase === 'quality' ? 'QMS' : null;
  const facts = view.facts.map((fact, i) => ({ ...fact, quantity: q[i]!, ...(fact.source === changedSource ? { sourceTime: view.evidence.boundary, progressTime: view.evidence.boundary } : {}) }));
  const fact = facts.find(item => item.source === changedSource);
  return { ...view, evidence: { ...view.evidence, ...(order.phase === 'quality' ? { watermark: view.evidence.boundary } : {}), authority: phase === 'execution' ? '演示人工确认' : view.evidence.authority }, case: { ...order, quantities: q, phase }, facts,
    workflow: { ...view.workflow, phase, status: statuses[phase], history: [...view.workflow.history, { time, text, step: { quality: 0, decision: 1, execution: 4, recheck: 4, closed: 0 }[order.phase] }] },
    events: fact ? [...view.events, { id: `demo-${Date.now()}`, source: fact.source, sourceTime: fact.sourceTime, time, text, value: fact.quantity!, topic: fact.topic, businessRef: fact.instance, stages: [fact.source, 'EMQX', 'Node-RED', 'UNS', '履约哨兵'] }] : order.phase === 'recheck' ? [...view.events, sentinelEvent(order.id, '重新验证完成', q[3], time)] : view.events,
    uns: view.uns.map((model, i) => ({ ...model, quantity: q[[0, 1, 1, 2, 3][i]!]!, ...(model.source === changedSource ? { updated: time } : {}) })),
  };
}

export function queueWarehouseEvent(view: FulfillmentProductView): FulfillmentProductView {
  if (view.pendingEventId) return view;
  const id = view.case.id + '-wms-update-' + Date.now();
  const sourceTime = new Date(Date.parse(view.evidence.watermark) + 60000).toISOString();
  const time = displayTime(sourceTime);
  return { ...view, pendingEventId: id, events: [...view.events, { id, source: 'WMS', time, sourceTime, text: '执行更新 ' + view.case.quantities[2] + ' 件', value: view.case.quantities[2]!, before: view.case.quantities[3], pending: true, topic: view.facts[3]!.topic, businessRef: view.facts[3]!.instance, stages: ['WMS', 'EMQX', 'Node-RED', 'UNS', '履约哨兵'] }] };
}
export function deliverWarehouseEvent(view: FulfillmentProductView, eventId: string, finished: boolean): FulfillmentProductView {
  if (view.pendingEventId !== eventId) return view;
  const event = view.events.find(item => item.id === eventId)!;
  const q = [...view.case.quantities] as Order['quantities']; q[3] = event.value;
  const advanced = event.sourceTime!;
  const facts = view.facts.map(fact => fact.source === 'WMS' ? { ...fact, quantity: event.value, sourceTime: advanced, progressTime: advanced, label: '仓库执行' } : fact);
  const watermark = facts.reduce((earliest, fact) => Date.parse(fact.progressTime) < Date.parse(earliest) ? fact.progressTime : earliest, facts[0]!.progressTime);
  return { ...view, pendingEventId: finished ? undefined : eventId,
    case: { ...view.case, quantities: q, phase: finished ? 'recheck' : view.case.phase },
    facts,
    evidence: { ...view.evidence, watermark },
    uns: view.uns.map(model => model.source === 'WMS' ? { ...model, quantity: event.value, updated: advanced } : model),
    events: view.events.map(item => item.id === eventId ? { ...item, pending: !finished } : item),
    workflow: { ...view.workflow, phase: finished ? 'recheck' : view.workflow.phase, status: finished ? 'WAITING_FOR_REVALIDATION' : view.workflow.status,
      history: finished ? [...view.workflow.history, { time: event.time, text: 'WMS 新事实 ' + event.value + ' 件已交付，等待重新核对', step: 3 }] : view.workflow.history }
  };
}

export function fromRuntime(data: RuntimeProductView): FulfillmentProductView {
  const base = DEMO_DATA[0]!;
  const e = data.evaluation; const status = data.workflow.status;
  const phase: Phase = status === 'REVALIDATED_CLOSED' || status === 'NO_CONFLICT' ? 'closed' : status === 'WAITING_FOR_EXECUTION_VERIFICATION' ? 'execution' : status === 'WAITING_FOR_SOURCE_PROGRESS' || status.startsWith('NOT_EVALUABLE') ? 'quality' : 'decision';
  const quantities: Order['quantities'] = [data.facts.order.qty ?? 0, data.facts.production.qty ?? 0, data.facts.quality.qty, data.facts.shipment.qty ?? 0];
  const refs = [e.facts.sourceOrderLineRef, e.facts.workOrderRef, e.facts.productionLotRef, e.facts.shipmentSourceRef];
  const cells = [data.facts.order, data.facts.production, data.facts.quality, data.facts.shipment];
  const qualityRef = data.runtime.events.find(event => event.source === 'QMS' && event.canonicalTopic === '/supos/J2_QMS_Quality')?.businessRef;
  const facts = base.facts.map((f, i) => ({ ...f, quantity: cells[i]!.qty, instance: i === 2 ? qualityRef ?? refs[i]! : refs[i]!, sourceTime: cells[i]!.updatedAt, progressTime: e.sourceProgress[f.source], topic: data.uns.sourceFlow[i]!.canonicalTopic, label: i === 3 && phase === 'closed' ? '仓库执行' : f.label }));
  // The running integration API exposes canonical summaries, not hop telemetry.
  // An observation locator is a UI key only; it must never be called an event ID.
  type ObservedEvent = Partial<RuntimeProductView['runtime']['events'][number]> & { source: string; sourceTime: string; canonicalTopic: string; businessRef: string; summary?: string; eventType?: string };
  const observations = data.runtime.events as ObservedEvent[];
  const events: ProductEvent[] = observations.filter(ev => !ev.isSourceProgress && ev.eventType !== 'SOURCE_PROGRESS' && ev.canonicalTopic !== '/supos/J2_SourceProgress' && sources.includes(ev.source as Source)).slice().reverse().flatMap(ev => {
    const source = ev.source as Source; const i = sources.indexOf(source);
    const summaryValue = ev.summary?.match(/=(\d+(?:\.\d+)?)$/);
    const qty = ev.quantity ?? (summaryValue ? Number(summaryValue[1]) : null);
    if (qty === null) return [];
    return [{ id: ev.id ?? `observation:${ev.canonicalTopic}:${ev.businessRef}:${ev.sourceTime}:${qty}`, eventId: ev.id, source, sourceTime: ev.sourceTime, time: displayTime(ev.receivedAt ?? ev.sourceTime), text: facts[i]!.label + ' ' + qty + ' 件', value: qty, topic: ev.canonicalTopic, businessRef: ev.businessRef, stages: [source, 'EMQX', 'Node-RED', 'UNS', '履约哨兵'], isLatest: ev.isLatest }];
  });
  const uniqueEvents = [...new Map(events.map(event => [event.id, event])).values()];
  const initialWms = events.find(ev => ev.source === 'WMS');
  const latestWms = events.filter(ev => ev.source === 'WMS').at(-1);
  if (latestWms && initialWms && latestWms.id !== initialWms.id && latestWms.value !== initialWms.value) latestWms.before = initialWms.value;
  const history = data.workflow.history.map(h => ({ time: displayTime(h.at), text: ({ ANOMALY_FOUND: '来源履约差异已识别', DECISION_MADE: '内部方案已确认，来源事实保持不变' } as Record<string, string>)[h.step] ?? h.step, step: h.step === 'DECISION_MADE' ? 1 : 0 }));
  if (phase === 'closed') history.push({ time: events.at(-1)?.time ?? displayTime(e.globalWatermark), text: '新仓库事实与四源共同水位复核通过', step: 4 });
  if (!history.length) history.push({ time: '当前', text: e.reason, step: 0 });
  return { ...base, case: { ...base.case, id: data.case.id, quantities, phase, dueAt: data.case.dueAt, due: new Date(data.case.dueAt).toLocaleDateString('zh-CN'), lot: e.facts.productionLotRef, owner: data.case.owner, origin: 'backend-live' }, facts, events: uniqueEvents,
    evidence: { lineage: e.lineage.relation, resolved: e.lineage.status === 'RESOLVED', watermark: e.globalWatermark, boundary: e.dueAtWithGrace, productionState: e.facts.productionState, authority: e.disposition.authority },
    workflow: { phase, status, history, actionMode: 'runtime', reason: e.reason, externalObligation: e.externalObligation },
    runtime: { ...base.runtime, eventMode: 'snapshot', components: base.runtime.components.map(c => ({ ...c, summary: c.name === 'EMQX' ? data.runtime.connected ? '来源 MQTT 连接已建立' : '来源 MQTT 连接未建立' : c.name === 'Node-RED' ? '8 条既有字段映射路径' : '业务对象与跨源引用' })) },
    uns: base.uns.map((m, i) => ({ ...m, instance: [refs[0], refs[1], refs[2], qualityRef ?? refs[2], refs[3]][i]!, quantity: quantities[[0,1,1,2,3][i]!]!, updated: facts.find(f => f.source === m.source)!.sourceTime, topic: facts.find(f => f.source === m.source)!.topic, relation: e.lineage.relation })) };
}
