import { Check, ArrowRight, CircleAlert, Clock3 } from 'lucide-react';
import { cn } from '../../../lib/utils.js';
import { sources } from './demo-data.js';
import { displayTime, type FulfillmentProductView } from './product-view.js';
export type DecisionGate = { label: string; state: 'PASS' | 'STOP' | 'CONFLICT' | 'WAITING' | 'NOT_RUN'; detail: string };
// UI-R10.1：中文为主语言，PASS/WAITING/CONFLICT 只作小 metadata
export function gateLabel(state: DecisionGate['state']) {
  return state === 'PASS' ? '通过' : state === 'WAITING' ? '等待' : state === 'CONFLICT' ? '冲突' : state === 'STOP' ? '中止' : '未执行';
}
export function decisionGates(view: FulfillmentProductView, scenario?: number): DecisionGate[] {
  const missing = scenario === 0 || (scenario === undefined && view.case.phase === 'quality');
  const mismatch = scenario === 1 || !view.evidence.resolved;
  const ready = !missing && !!view.evidence.watermark && Date.parse(view.evidence.watermark) >= Date.parse(view.evidence.boundary);
  const conflict = scenario === 2 || (scenario === undefined && view.case.quantities[2] !== null && view.case.quantities[3] > view.case.quantities[2]);
  const closed = scenario === 3 || (scenario === undefined && view.case.phase === 'closed');
  return [
    { label: '来源完整性', state: missing ? 'WAITING' : 'PASS', detail: missing ? 'ERP ✓ · MES ✓ · QMS 等待覆盖 · WMS ✓' : 'ERP ✓ · MES ✓ · QMS ✓ · WMS ✓' },
    { label: '业务身份关联', state: missing ? 'NOT_RUN' : mismatch ? 'STOP' : 'PASS', detail: missing ? '后续业务判断暂不执行' : mismatch ? 'ERP SO-001 ≠ MES SO-999' : '订单行 → 工单 → 批次 → 质量 → 发运' },
    { label: '时间边界', state: missing || mismatch ? 'NOT_RUN' : ready || scenario !== undefined ? 'PASS' : 'WAITING', detail: '共同水位 ' + displayTime(view.evidence.watermark) + ' / 交期＋1h ' + displayTime(view.evidence.boundary) },
    { label: '履约约束', state: missing || mismatch || !ready && scenario === undefined ? 'NOT_RUN' : conflict ? 'CONFLICT' : 'PASS', detail: missing || mismatch ? '停止数量比较' : conflict ? '生产已终结 · 仓库计划超出质量放行 ' + (scenario === 2 ? 4 : view.case.quantities[3] - view.case.quantities[2]!) + ' 件' : '新执行事实与质量放行一致' },
    { label: 'Revalidation', state: closed ? 'PASS' : 'NOT_RUN', detail: closed ? '新 WMS 事实＋共同水位覆盖＋重新核对' : view.case.phase === 'execution' ? '人工已确认；来源现实仍等待更新' : view.case.phase === 'recheck' ? '新来源已到达，等待人工重新核对' : '收到新执行事实后复核' },
  ];
}
export function GateRail({ gates, active, onSelect }: { gates: DecisionGate[]; active?: number; onSelect?: (index: number) => void }) {
  // UI-R10.1：五闸是"逐级决策"，不是并列五项。规律：
  //   闸口按顺序放行；遇到第一个非 PASS 就停住，其后闸口一律退场（dimmed + 不连续）。
  const stopped = gates.findIndex(gate => gate.state === 'CONFLICT' || gate.state === 'STOP' || gate.state === 'WAITING');
  const stopAt = stopped < 0 ? gates.length - 1 : stopped;
  return <div className='gate-tunnel'>
    <div className='flex items-baseline justify-between pb-4'>
      <h2 className='t-l4 font-semibold'>逐级决策</h2>
      <p className='t-l5 text-muted-foreground'>判断逐闸放行，遇到第一道不通过即停止，其后闸口不再执行</p>
    </div>
    <div className='relative'>
      <span className='gate-tunnel-track' data-stop={stopAt} />
      <ol aria-label='决策闸口'>{gates.map((gate, i) => {
        const blocked = gate.state === 'CONFLICT' || gate.state === 'STOP';
        const waiting = gate.state === 'WAITING';
        const after = i > stopAt;
        const tone = blocked ? 'block' : waiting ? 'wait' : after ? 'after' : 'pass';
        return <li key={gate.label} data-state={active === i ? 'active' : 'idle'} data-tone={tone}>
          <button onClick={() => onSelect?.(i)} className='w-full text-left' aria-label={`${gate.label} ${gateLabel(gate.state)}`}>
            <span className='t-l5 flex items-center gap-2 text-muted-foreground'>
              <span className='gate-dot' data-tone={tone} />
              <span className={cn(active === i && 'font-semibold text-primary')}>{gate.label}</span>
            </span>
            <strong className={cn('t-l2 mt-2 flex items-baseline gap-2',
              blocked ? 'text-risk' : waiting ? 'text-muted-foreground' : after ? 'text-muted-foreground/45' : 'text-primary')}>
              {gateLabel(gate.state)}
              <small className='t-meta font-normal uppercase'>{gate.state === 'NOT_RUN' ? 'not-run' : gate.state.toLowerCase()}</small>
            </strong>
            <span className={cn('t-l5 mt-1.5 block leading-5', after ? 'text-muted-foreground/45' : 'text-muted-foreground')}>{gate.detail}</span>
            {i === stopAt && (blocked || waiting) && <span className={cn('t-l5 mt-2 inline-flex items-center gap-1.5 font-semibold', blocked ? 'text-risk' : 'text-muted-foreground')}>
              <span className='gate-stop-flag' data-tone={tone} />判断在此停止
            </span>}
          </button>
        </li>;
      })}</ol>
    </div>
  </div>;
}
export function DecisionEvidence({ view }: { view: FulfillmentProductView }) {
  const gates = decisionGates(view); const phase = view.case.phase;
  return <div className='space-y-7'>
    {view.case.origin === 'backend-demo' && <p className='text-[11px] leading-5 text-muted-foreground'>来源事实时间为案例重放时间；覆盖进度保留 manifest 的独立来源时间。</p>}
    <section><header className='flex items-center justify-between'><h3 className='text-sm font-semibold'>同一业务对象</h3><b className={view.evidence.resolved ? 'text-primary text-xs' : 'text-risk text-xs'}>{view.evidence.resolved ? 'PASS' : 'STOP'}</b></header><div className='mt-4 space-y-3'>{view.facts.map(fact => <p key={fact.source} className='flex items-start gap-3 text-xs'><span className='w-9 shrink-0 font-medium'>{fact.source}</span><ArrowRight className='size-3 shrink-0 text-primary/40' /><span className='break-all text-muted-foreground'>{fact.instance}</span></p>)}</div><p className='mt-4 break-all text-xs leading-6 text-primary'>{view.evidence.lineage}</p></section>
    <section><header className='flex justify-between'><h3 className='text-sm font-semibold'>来源与时间覆盖</h3><b className='text-xs text-primary'>{gates[0]!.state === 'PASS' && gates[2]!.state === 'PASS' ? 'PASS' : 'WAITING'}</b></header><div className='mt-4 grid grid-cols-2 gap-x-4 gap-y-3'>{view.facts.map(fact => <p key={fact.source} className='text-xs'><b>{fact.source}</b><span className='ml-2 text-muted-foreground'>{displayTime(fact.sourceTime)}</span><span className='mt-1 block text-muted-foreground'>进度 {displayTime(fact.progressTime)}</span></p>)}</div><p className='mt-4 text-xs leading-6'>交期＋1 小时：{displayTime(view.evidence.boundary)}<br />共同水位：{displayTime(view.evidence.watermark)}<br />生产状态：{view.evidence.productionState === 'terminal' ? '已终结' : '生产中'}</p></section>
    <section><header className='flex justify-between'><h3 className='text-sm font-semibold'>履约约束</h3><b className={cn('text-xs', gates[3]!.state === 'CONFLICT' ? 'text-risk' : 'text-primary')}>{gates[3]!.state === 'NOT_RUN' ? '不执行' : gates[3]!.state}</b></header><p className='mt-3 text-sm'>质量放行 {view.case.quantities[2] ?? '等待'} → 仓库{phase === 'closed' || phase === 'recheck' ? '执行' : '计划'} {view.case.quantities[3]}</p><p className='mt-2 text-xs text-muted-foreground'>{gates[3]!.detail}</p><p className='mt-2 text-xs text-muted-foreground'>客户要求 {view.case.quantities[0]} 件，生产终结与来源覆盖成立后才进入约束判断。</p></section>
    <section><h3 className='text-sm font-semibold'>当前状态</h3><p className='mt-3 text-primary text-sm'>{phase === 'decision' ? '等待人工确认' : phase === 'execution' ? '已确认方案；等待仓库新事实' : phase === 'recheck' ? '来源已更新；等待人工重新核对' : phase === 'closed' ? '已完成复核' : '等待质量来源覆盖'}</p><p className='mt-2 text-xs text-muted-foreground'>{gates[4]!.detail}</p><p className='mt-3 text-xs leading-6 text-muted-foreground'>人工确认 ≠ 来源现实更新。客户原订单仍为 {view.case.quantities[0]} 件。</p></section>
  </div>;
}
