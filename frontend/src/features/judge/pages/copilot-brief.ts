import type { FulfillmentProductView } from './product-view.js';
import type { Source } from './demo-data.js';
import { appPath } from '../../../lib/app-path.js';
import { decisionGates } from './decision-evidence.js';

export type CopilotBrief = {
  available: boolean;
  source: 'live' | 'demo';
  caseId: string;
  summary: string;
  reasoningSummary: string;
  recommendedAction: { label: string; quantity: number | null; reason: string };
  coordination: { sales: string; production: string; quality: string; warehouse: string };
  evidenceRefs: { system: Source | 'SOURCE_PROGRESS'; label: string; value: string }[];
  limitations: string[];
};
export type CopilotState = 'CONFLICT' | 'WAITING_FOR_EXECUTION' | 'CLOSED';
export const DEMO_COPILOT_BRIEF: CopilotBrief = {
  available: true, source: 'demo', caseId: 'SO-IND-001',
  summary: '当前生产和质量均支持 96 件，仓库仍计划按 100 件执行，当前存在 4 件执行缺口。',
  reasoningSummary: '生产完成数量与质量放行数量均为 96 件，当前仓库计划数量为 100 件，因此当前仓库执行计划超过可放行数量。',
  recommendedAction: { label: '按 96 件执行当前内部处置', quantity: 96, reason: '当前生产完成和质量放行均为 96 件，建议先将仓库执行数量调整至 96 件，并等待来源系统更新后重新复核。' },
  coordination: {
    sales: '客户原订单要求仍为 100 件，当前内部正在按 96 件可执行状态进行处置。',
    production: '当前已完成 96 件生产，继续保持现有生产事实。',
    quality: '当前已放行 96 件，作为本次可执行数量依据。',
    warehouse: '当前计划执行 100 件，待按已确认的内部处理方案调整至 96 件。',
  },
  evidenceRefs: [
    { system: 'ERP', label: '客户订单要求', value: '100 件' },
    { system: 'MES', label: '生产完成', value: '96 件' },
    { system: 'QMS', label: '质量放行', value: '96 件' },
    { system: 'WMS', label: '仓库计划', value: '100 件' },
  ],
  limitations: ['当前建议仅基于已提供的内部履约事实。', '不代表客户已经接受数量调整。', '客户原订单要求仍保持 100 件。'],
};
export const DEMO_COPILOT_RESULTS: Record<CopilotState, CopilotBrief> = {
  CONFLICT: DEMO_COPILOT_BRIEF,
  WAITING_FOR_EXECUTION: {
    ...DEMO_COPILOT_BRIEF,
    summary: '处理方案已经确认，当前仍在等待仓库执行状态更新。',
    reasoningSummary: '内部方案已确认，但仓库来源仍为 100 件。确认动作没有改写来源事实，需要等待新的执行记录。',
    recommendedAction: { label: '等待仓库执行，并在来源状态更新后重新复核', quantity: 96, reason: '仓库来源仍计划 100 件；收到新的 96 件执行记录后再完成复核。' },
    coordination: { ...DEMO_COPILOT_BRIEF.coordination, warehouse: '按 96 件执行的方案已确认，当前仓库来源仍为 100 件，等待仓库更新执行状态。' },
  },
  CLOSED: {
    ...DEMO_COPILOT_BRIEF,
    summary: '当前生产、质量和仓库执行数量均为 96 件，内部履约状态已经重新一致。客户原订单要求仍保持 100 件。',
    reasoningSummary: '新的仓库执行记录为 96 件，与生产完成和质量放行一致，本次内部差异已完成复核；客户剩余 4 件需求仍需跟进。',
    recommendedAction: { label: '生成处理总结', quantity: null, reason: '本次内部差异已完成复核，可记录处理经过并继续跟进剩余客户需求。' },
    coordination: {
      sales: '客户原订单仍为 100 件，本次内部差异已完成复核，剩余 4 件需求继续保留。',
      production: '当前完工 96 件，继续保持生产事实并跟进剩余需求。',
      quality: '当前放行 96 件，与本次仓库执行数量一致。',
      warehouse: '仓库新的执行事实为 96 件，与质量放行一致，本次内部差异已完成复核。',
    },
    evidenceRefs: DEMO_COPILOT_BRIEF.evidenceRefs.map(ref => ref.system === 'WMS' ? { ...ref, label: '仓库执行', value: '96 件' } : ref),
  },
};
export function factVersion(view: FulfillmentProductView) {
  return JSON.stringify([view.case.id, view.case.phase, view.facts.map(fact => [fact.source, fact.quantity, fact.instance, fact.sourceTime])]);
}
function demoFor(view: FulfillmentProductView): CopilotBrief {
  const phase = view.case.phase;
  const blocked = decisionGates(view).slice(0, 3).some(gate => gate.state !== 'PASS');
  if (blocked) return {
    ...DEMO_COPILOT_BRIEF, caseId: view.case.id,
    summary: view.case.quantities[2] === null ? `当前生产完成 ${view.case.quantities[1]} 件，质量数据等待更新，仓库计划 ${view.case.quantities[3]} 件。` : '当前来源关联或时间覆盖尚未通过，等待证据补齐后再判断数量。',
    reasoningSummary: '来源完整性、业务身份与共同水位必须先通过，当前不生成数量调整建议。',
    recommendedAction: { label: '等待来源证据更新', quantity: null, reason: '先补齐来源关联与判断时间覆盖，再进行内部处置。' },
    coordination: { sales: `客户订单要求仍为 ${view.case.quantities[0]} 件。`, production: `当前生产完成 ${view.case.quantities[1]} 件，保持来源事实。`, quality: '等待质量来源与时间覆盖证据齐备。', warehouse: `当前仓库记录为 ${view.case.quantities[3]} 件，证据齐备前不作数量调整。` },
    evidenceRefs: view.facts.map(fact => ({ system: fact.source, label: fact.label, value: fact.quantity === null ? '等待来源更新' : `${fact.quantity} 件` })),
    limitations: ['当前来源或时间 Gate 未通过，只提供等待及协调说明。', 'AI 不决定工业事实。', `客户原订单要求仍保持 ${view.case.quantities[0]} 件。`],
  };
  const state: CopilotState = phase === 'closed' ? 'CLOSED' : phase === 'execution' ? 'WAITING_FOR_EXECUTION' : 'CONFLICT';
  const q = view.case.quantities;
  if (view.case.id === 'SO-IND-001' && q[0] === 100 && q[1] === 96 && q[2] === 96 && q[3] === (state === 'CLOSED' ? 96 : 100)) return DEMO_COPILOT_RESULTS[state];
  const [required, produced, released, warehouse] = q;
  const waitingQuality = released === null;
  const remaining = Math.max(0, required - (released ?? 0));
  return {
    ...DEMO_COPILOT_RESULTS[state], caseId: view.case.id,
    summary: waitingQuality ? `当前生产完成 ${produced} 件，质量数据等待更新，仓库计划 ${warehouse} 件。`
      : phase === 'closed' ? `当前生产完成 ${produced} 件、质量放行 ${released} 件、仓库执行 ${warehouse} 件，本次内部差异已完成复核。客户原订单保持 ${required} 件。`
        : phase === 'execution' ? '处理方案已经确认，当前仍在等待仓库执行状态更新。'
          : phase === 'recheck' ? `新的来源事实已到达，质量放行 ${released} 件、仓库执行 ${warehouse} 件，等待重新核对。`
            : `当前生产完成 ${produced} 件、质量放行 ${released} 件，仓库计划 ${warehouse} 件。`,
    reasoningSummary: waitingQuality ? '质量来源尚未覆盖判断时间，当前不生成数量处置。' : `当前质量放行 ${released} 件，仓库来源记录 ${warehouse} 件，依据同一订单行的来源事实进行内部处置。`,
    recommendedAction: {
      label: waitingQuality ? '等待质量数据更新' : phase === 'closed' ? '生成处理总结' : phase === 'execution' ? '等待仓库执行，并在来源状态更新后重新复核' : phase === 'recheck' ? '重新核对新的来源事实' : `按 ${released} 件执行当前内部处置`,
      quantity: waitingQuality || phase === 'closed' || phase === 'recheck' ? null : released,
      reason: waitingQuality ? '质量来源更新后再比较数量。' : phase === 'recheck' ? '新来源已到达，先核对业务关系、共同水位与执行数量，再关闭内部差异。' : phase === 'closed' ? '本次内部差异已复核，可生成处理记录。' : `以当前放行的 ${released} 件为执行依据，等待来源事实更新后复核。`,
    },
    coordination: {
      sales: `客户原订单保持 ${required} 件${remaining > 0 ? `，剩余 ${remaining} 件需求继续保留` : ''}。`,
      production: `当前生产完成 ${produced} 件，维持现有生产事实。`,
      quality: waitingQuality ? '质量来源记录等待更新，齐备后再确定可执行数量。' : `当前质量放行 ${released} 件，作为本次执行依据。`,
      warehouse: waitingQuality ? `当前计划 ${warehouse} 件，等待质量数据齐备。` : phase === 'closed' || phase === 'recheck' ? `新的仓库执行记录为 ${warehouse} 件，按当前状态完成复核。` : phase === 'execution' ? `处理方案已确认，当前来源仍为 ${warehouse} 件，等待更新至 ${released} 件。` : `当前计划 ${warehouse} 件，待人工确认后按 ${released} 件执行。`,
    },
    evidenceRefs: view.facts.map(fact => ({ system: fact.source, label: fact.source === 'WMS' && (phase === 'closed' || phase === 'recheck') ? '仓库执行' : fact.label, value: fact.quantity === null ? '等待来源更新' : `${fact.quantity} 件` })),
    limitations: ['当前建议仅基于已提供的内部履约事实。', '不代表客户已经接受数量调整。', `客户原订单要求仍保持 ${required} 件。`],
  };
}
/** The page only calls getCopilotBrief(caseId). Replace this data source when the live API exists. */
export function createCopilotAdapter(view: FulfillmentProductView) {
  return {
    async getCopilotBrief(caseId: string): Promise<CopilotBrief> {
      if (caseId === 'SO-IND-001') {
        try {
          const response = await fetch(appPath('/api/copilot/brief'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseId }), signal: AbortSignal.timeout(65000) });
          if (!response.ok) throw new Error('copilot_unavailable');
          const result = await response.json() as { available: boolean; output?: Omit<CopilotBrief, 'available' | 'source' | 'caseId'> };
          if (result.available && result.output) return { ...result.output, available: true, source: 'live', caseId };
        } catch { /* The approved demo fallback is confined to this data adapter. */ }
      }
      // Explicit local demo latency for visible loading; no fetch or forged network response.
      await new Promise(resolve => setTimeout(resolve, 500));
      return { ...demoFor(view), caseId };
      // Future live data source: POST /api/copilot/brief, returning the same CopilotBrief.
    },
  };
}
