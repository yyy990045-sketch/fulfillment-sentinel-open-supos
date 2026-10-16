import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, MessageSquare, ClipboardCheck, History } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { ScrollArea } from '../../../components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet.js';
import { cn } from '../../../lib/utils.js';
import { mappings, phaseLabels, sources } from './demo-data.js';
import { useProduct } from './product-state.js';
import { ProductShell } from './product-shell.js';
import { displayTime } from './product-view.js';
import { DecisionEvidence, decisionGates, gateLabel } from './decision-evidence.js';
import { CopilotPanel } from './copilot-panel.js';
import { anchor, SpatialScene, type SpatialNode } from './spatial-scene.js';

const steps = ['发现异常', '确认处理', '仓库执行', '重新核对', '完成'];
const labels = ['订单要求', '生产完成', '质检放行', '仓库计划'];

export function WorkbenchPage() {
  const { view, views, selectOrder: setSelected, advance, addNote, loading, backendError, refresh, actionBusy, actionError, review } = useProduct();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const evidence = review ? params.get('evidence') : null;
  const evidenceRequest = params.get('request');
  const orders = views.map(item => item.case); const order = view.case; const selected = order.id;
  const notes = { [selected]: order.notes };
  const [drawer, setDrawer] = useState<'queue' | 'source' | 'note' | 'history' | 'order' | 'gates' | null>(null);
  const [historyStep, setHistoryStep] = useState(1);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const copilotExpanded = expandedCase === selected;
  const [note, setNote] = useState(''); const [error, setError] = useState('');
  useEffect(() => { if (evidence === 'gates') setDrawer('gates'); }, [evidence, selected, evidenceRequest]);

  const currentLabels = labels.map((label, i) => i === 3 && (order.phase === 'recheck' || order.phase === 'closed') ? '仓库执行' : label);
  const released = order.quantities[2];
  const gap = released === null ? 0 : Math.max(0, order.quantities[3] - released);
  const step = { quality: 0, decision: 1, execution: 2, recheck: 3, closed: 5 }[order.phase];
  const conflict = gap > 0;

  const nodes: SpatialNode[] = [
    { id: 'ERP', kind: 'order', x: 154, y: 224, scale: 1.5 },
    { id: 'MES', kind: 'factory', x: 486, y: 204, scale: 1.5 },
    { id: 'QMS', kind: 'quality', x: 810, y: 224, scale: 1.5, waiting: released === null },
    { id: 'WMS', kind: 'warehouse', x: 1146, y: 224, scale: 1.55, risk: conflict },
  ];

  async function act() {
    if (order.phase === 'closed' && selected === 'SO-IND-004') { navigate(`/runtime?case=${selected}&tab=data`); return; }
    if (order.phase === 'recheck') { setDrawer('gates'); return; }
    const succeeded = await advance(selected);
    if (succeeded && order.phase === 'execution') navigate(`/runtime?case=${selected}&tab=data&pending=1`);
  }
  const action = {
    quality: { title: '等待质量数据更新', button: '模拟质量来源更新' },
    decision: { title: `建议仓库执行数量调整至 ${released} 件`, button: '确认当前处理方案' },
    execution: { title: `方案已确认，等待仓库执行 ${released} 件`, button: '模拟仓库执行' },
    recheck: { title: '新执行事实已到达，可以重新核对', button: '重新核对' },
    closed: { title: '仓库执行与质量放行一致', button: selected === 'SO-IND-004' ? '重放完成事件' : selected === 'SO-IND-001' ? '同步最新状态' : '重新演示' },
  }[order.phase];
  function saveNote(event: FormEvent) { event.preventDefault(); if (!note.trim()) { setError('请填写处理备注。'); return; } addNote(selected, note.trim()); setNote(''); setError(''); setDrawer(null); }
  const timeline = view.workflow.history;
  const remaining = order.quantities[0] - (released ?? 0);
  const reason = released === null
    ? '质量放行记录尚未到达，等待质量数据更新。'
    : conflict
      ? `同一订单的质量放行 ${released} 件，仓库仍计划执行 ${order.quantities[3]} 件。`
      : `同一订单的质量放行与仓库执行均为 ${released} 件，${view.workflow.status === 'REVALIDATED_CLOSED' ? '已完成复核' : view.workflow.status === 'NO_CONFLICT' ? '当前没有数量冲突' : '可以重新核对'}。`;

  const gates = decisionGates(view);
  const authorized = ['execution', 'recheck', 'closed'].includes(order.phase) && view.workflow.status !== 'NO_CONFLICT';
  const closed = view.workflow.status === 'REVALIDATED_CLOSED';
  const noConflict = view.workflow.status === 'NO_CONFLICT';
  const warehouseEvents = view.events.filter(event => event.source === 'WMS');
  const update = warehouseEvents.filter(event => event.before !== undefined && !event.pending).at(-1);
  const warehouseChanged = Boolean(update);
  const title = noConflict ? '当前履约数量无冲突' : closed ? '内部差异已复核，客户需求继续跟踪' : order.phase === 'execution' ? '方案已确认，等待仓库来源更新' : order.phase === 'quality' ? '判断条件尚未齐备，暂不处置数量' : order.phase === 'recheck' ? '仓库新事实已到达，等待重新核对' : `${gap} 件执行缺口，需要调整仓库计划`;
  const mainDisabled = actionBusy || (selected === 'SO-IND-001' && (loading || backendError || order.origin !== 'backend-live'));

  return <ProductShell page='workbench'><main className='desktop-space workflow-workbench'>
    <header className='case-toolbar'>
      <div className='flex items-center gap-4'>
        <Button variant='ghost' className='queue-entry' onClick={() => setDrawer('queue')}>订单队列 <b>{orders.filter(item => item.phase !== 'closed').length} 待处理</b><ChevronDown /></Button>
        <button className='flex items-center gap-2 text-left' onClick={() => setDrawer('order')} aria-label='查看当前订单信息'><h1 className='t-l2'>{order.id}</h1><ChevronDown className='size-4 text-muted-foreground' /></button>
        <span className='t-l5 text-muted-foreground'>{order.customer} · {order.product} · {order.line}</span>
      </div>
      <span className='source-caption'>{view.workflow.actionMode === 'runtime' ? '平台链路 · 受控模拟工业来源' : '预置案例 · 本地交互演示'}</span>
    </header>
    <section className='case-conclusion' aria-label='当前履约风险'>
      <div><p className='eyebrow'>{closed ? '执行核验' : '履约风险处置'}</p><h2 className={cn('case-headline', conflict ? 'text-risk' : 'text-primary')}>{title}</h2><p className='t-l4 mt-2 text-muted-foreground'>{reason}</p></div>
      <div className={cn('risk-quantity', conflict && 'text-risk')}><span className='t-l5'>{released === null ? '等待来源' : closed || noConflict ? '待继续履约' : '执行缺口'}</span><strong>{released === null ? '—' : conflict ? gap : Math.max(0, remaining)}<small>件</small></strong></div>
    </section>
    {(loading || backendError) && <p role='status' className='sync-message'>{loading ? '正在读取平台来源状态…' : <><span>来源同步失败，当前显示的历史或演示信息不作为最新运行事实。</span><button className='ml-3 underline' onClick={refresh}>重新同步</button></>}</p>}

    <div className='case-workspace'>
      <section aria-label='来源事实与决策依据' className='case-investigation'>
        <div className='section-heading'><h3>核对同一订单的四个来源</h3><button onClick={() => setDrawer('source')}>查看来源记录<ArrowRight className='size-3.5' /></button></div>
        <SpatialScene nodes={nodes} links={[{ from: 'ERP', to: 'MES' }, { from: 'MES', to: 'QMS', stopped: released === null }, { from: 'QMS', to: 'WMS', risk: conflict, stopped: released === null }]} className='work-scene'>
          <div className='scene-baseplane' />
          {nodes.map((node, i) => <button key={node.id} className='scene-object-label text-center' style={anchor(node.x, node.y + 114)} onClick={() => setDrawer('source')} aria-label={`${sources[i]} 来源事实`}>
            <span className='object-hit' /><span className='source-object-name'>{currentLabels[i]} <small>{sources[i]}</small></span>
            <motion.strong key={order.quantities[i]} initial={{ opacity: .6, y: 3 }} animate={{ opacity: 1, y: 0 }} className={cn('source-object-quantity', node.risk && 'text-risk')}>{order.quantities[i] ?? '等待'}{order.quantities[i] !== null && <small>件</small>}</motion.strong>
            <span className='t-l5 mt-3 block text-muted-foreground'>事实 {displayTime(view.facts[i]!.sourceTime)}</span>
            <span className='t-l5 mt-1 block text-muted-foreground'>进度 {displayTime(view.facts[i]!.progressTime)}</span>
          </button>)}
          <span className={cn('quantity-link-label', conflict && 'text-risk')} style={anchor(976, 116)}>{released === null ? '等待覆盖' : conflict ? `超出 ${gap} 件` : '数量一致'}</span>
        </SpatialScene>
        <div className='visible-evidence' aria-label='决策依据摘要'>
          <div className='section-heading'><h3>为什么可以作出这个判断？</h3><button onClick={() => setDrawer('gates')}>查看判断依据<ArrowRight className='size-3.5' /></button></div>
          <ol>{gates.slice(0, 4).map((gate, i) => <li key={gate.label}><button onClick={() => setDrawer('gates')}><span className='t-l5 text-muted-foreground'>0{i + 1} · {gate.label}</span><strong className={cn(gate.state === 'CONFLICT' || gate.state === 'STOP' ? 'text-risk' : 'text-primary')}>{gateLabel(gate.state)}</strong><span className='t-l5'>{i === 0 ? released === null ? '质量来源尚未齐备' : 'ERP / MES / QMS / WMS' : i === 1 ? view.evidence.resolved ? '订单行、批次与发运关联' : '订单关联未能解析' : i === 2 ? `水位 ${displayTime(view.evidence.watermark)} / 边界 ${displayTime(view.evidence.boundary)}` : released === null ? '条件未齐，停止数量判断' : `质量 ${released} / 仓库 ${order.quantities[3]}`}</span></button></li>)}</ol>
        </div>
      </section>

      <section aria-label='当前处置动作' className='decision-dock'>
        <p className='eyebrow'>当前动作 · {noConflict ? '无须处置' : phaseLabels[order.phase]}</p>
        <h3 className='decision-title'>{noConflict ? '保持来源同步，持续核对' : action.title}</h3>
        <div className='plan-quantity'><span>{closed ? '当前仓库执行' : '本次内部方案'}</span><strong>{released === null ? '等待' : released}<small>{released !== null && '件'}</small></strong><span>客户原订单 {order.quantities[0]} 件</span></div>
        <Button className='primary-case-action' onClick={() => void act()} disabled={mainDisabled}>{actionBusy ? '正在同步处理状态…' : action.button}<ArrowRight /></Button>
        <p className='action-boundary'>{order.phase === 'decision' ? '确认仅记录内部处理意图，不改变仓库来源数量。' : order.phase === 'execution' ? `已确认 ${released} 件；当前仓库仍为 ${order.quantities[3]} 件。只有新来源事实才能推进核验。` : closed ? '关闭的是本次内部差异，不代表已经发货或客户接受短交付。' : noConflict ? '当前无数量冲突，不代表经过人工处置及复核关闭。' : '来源证据齐备后继续处理。'}</p>
        {actionError && <p role='alert' className='t-l5 mt-2 text-risk'>{actionError}</p>}
        <div className='case-utilities'><Button variant='ghost' size='sm' onClick={() => setDrawer('note')}><MessageSquare />添加备注{order.notes.length > 0 && <span>({order.notes.length})</span>}</Button><Button variant='ghost' size='sm' onClick={() => { setHistoryStep(step); setDrawer('history'); }}><History />查看处理记录</Button></div>
        {order.notes.length > 0 && <p className='latest-case-note'><MessageSquare className='size-3.5 shrink-0' /><span>{order.notes.at(-1)}</span></p>}
        <div className='copilot-dock'><CopilotPanel key={selected} review={review} evidenceRequest={evidence === 'ai' ? params.get('request') ?? 'evidence' : null} view={view} expanded={copilotExpanded} onExpanded={expanded => setExpandedCase(expanded ? selected : null)} /></div>
      </section>
    </div>

    <section className='execution-comparison' aria-label='授权与执行核验对照'>
      <div className='execution-heading'><ClipboardCheck className='size-5' /><div><h3>授权与执行核验</h3><p>三件不同的事，逐项留证</p></div></div>
      <button onClick={() => { setHistoryStep(1); setDrawer('history'); }}><span className='eyebrow'>01 内部授权</span><strong>{authorized ? `已确认 ${released} 件` : noConflict ? '无处置授权' : '尚未确认'}</strong><small>{authorized ? '人工处理意图，未改写来源' : '等待负责人确认方案'}</small></button>
      <ArrowRight className='execution-arrow' />
      <button onClick={() => navigate(`/runtime?case=${selected}&tab=data${warehouseChanged ? '&stage=1&qty=' + order.quantities[3] : ''}`)}><span className='eyebrow'>02 仓库来源回读</span><strong>{warehouseChanged ? `${update!.before} → ${update!.value} 件` : `当前 ${order.quantities[3]} 件`}</strong><small>{warehouseChanged ? `新来源事实 · ${update!.time}` : authorized && !closed ? '等待新的仓库来源事实' : '查看当前来源记录'}</small></button>
      <ArrowRight className='execution-arrow' />
      <button onClick={() => setDrawer('gates')}><span className='eyebrow'>03 服务端复核</span><strong className={closed ? 'text-primary' : ''}>{closed ? '内部差异已关闭' : noConflict ? '当前无冲突' : order.phase === 'recheck' ? '等待重新核对' : '尚未完成复核'}</strong><small>{released === null ? '数量处置尚未就绪' : remaining > 0 ? `客户剩余 ${remaining} 件需求继续保留` : '客户需求数量已覆盖'}</small></button>
    </section>
    <Sheet open={drawer !== null} onOpenChange={open => { if (!open) setDrawer(null); }}><SheetContent><SheetHeader><SheetTitle>{drawer === 'queue' ? '订单队列' : drawer === 'note' ? '处理备注' : drawer === 'history' ? '处理历史' : drawer === 'order' ? order.id : drawer === 'gates' ? '为什么这样判断？' : '来源事实'}</SheetTitle><SheetDescription>{drawer === 'queue' ? '选择当前需要处理的订单' : `${order.id} · ${order.line}`}</SheetDescription></SheetHeader><ScrollArea className='flex-1 pr-3'>
      {drawer === 'gates' && <><DecisionEvidence view={view} />{order.phase === 'recheck' && <Button className='mt-6 rounded-full' disabled={decisionGates(view).slice(0, 4).some(gate => gate.state !== 'PASS')} onClick={() => { advance(selected); setDrawer(null); }}>依据已核对，完成复核<Check /></Button>}</>}
      {drawer === 'queue' && <div className='space-y-2'>{[false, true].map(closed => <section key={String(closed)}><h3 className='my-4 t-l5'>{closed ? '已处理' : '待处理'}</h3>{orders.filter(item => (item.phase === 'closed') === closed).map(item => <button key={item.id} onClick={() => { setSelected(item.id); setDrawer(null); }} className='surface-inset mb-2 w-full p-5 text-left hover:bg-secondary'><b className='text-base'>{item.id}</b><span className='t-l4 mt-2 block text-primary'>{phaseLabels[item.phase]}</span><span className='t-l5 mt-1 block text-muted-foreground'>{item.phase === 'quality' ? '质量数据尚未覆盖判断时间' : item.phase === 'execution' ? '方案已确认，等待仓库更新' : item.phase === 'closed' ? '执行数量已经重新一致' : '发货计划超过可放行数量'}</span><small className='t-l5 mt-3 block text-muted-foreground'>{item.priority} · {item.customer} · {item.due}</small></button>)}{closed && orders.every(item => item.phase !== 'closed') && <p className='t-l4 text-muted-foreground'>处理完成的订单会保留在这里。</p>}</section>)}</div>}
      {drawer === 'source' && sources.map((source, i) => <section key={source} className='mb-8'><h3 className='t-l3'>{source} · {currentLabels[i]}</h3><p className='mt-2 t-l1 tabular-nums'>{order.quantities[i] === null ? <span className='text-muted-foreground'>等待</span> : `${order.quantities[i]} 件`}</p><p className='t-l5 mt-3 text-muted-foreground'>来源时间 {displayTime(view.facts[i]!.sourceTime)} · 进度 {displayTime(view.facts[i]!.progressTime)}</p><p className='t-l5 mt-3 text-muted-foreground'>{order.line} · {i === 1 || i === 2 ? order.lot : order.id}</p><p className='t-meta mt-3 break-all'>{mappings[source].topic}</p></section>)}
      {drawer === 'order' && <div className='space-y-6'><p className='t-l2'>{order.customer}<span className='mt-2 block t-l4 font-normal text-muted-foreground'>{order.product}</span></p><p className='t-l4'>{order.due} 交付 · {order.priority}</p><p className='t-l4'>{order.owner}</p><p className='t-l4'>订单行 {order.line} · 生产批次 {order.lot}</p><p className='t-l4 text-primary'>{view.workflow.externalObligation}</p><Button variant='ghost' onClick={() => setDrawer('source')}>查看来源详情<ArrowRight /></Button><p className='t-l5 text-muted-foreground'>客户、产品与负责人为演示展示资料。主案例通过后端内部处置及 RAW 演示执行接口连接真实 Runtime；其他案例保留本地演示。</p></div>}
      {drawer === 'history' && <><p className='mb-6 t-l4 text-primary'>{steps[Math.min(historyStep, 4)]} · {historyStep < step ? '已完成' : historyStep === step ? '当前阶段' : '后续阶段'}</p><ol className='space-y-7'>{timeline.map((entry, i) => <li key={i}><time className='t-l5 text-muted-foreground'>{entry.time}</time><p className='mt-2 t-l4 font-normal'>{entry.text}</p>{entry.step === historyStep && <small className='t-l5 mt-2 block text-primary'>对应当前查看步骤</small>}</li>)}</ol></>}
      {drawer === 'note' && <><div className='mb-7 space-y-4'>{(notes[selected] ?? []).map((text, i) => <p key={i} className='t-l4 font-normal'>{text}</p>)}</div><form onSubmit={saveNote} className='space-y-4'><label htmlFor='note' className='t-l4'>添加处理备注</label><textarea id='note' value={note} onChange={event => { setNote(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'note-error' : undefined} className='min-h-36 w-full rounded-lg border border-border bg-background p-4 text-sm' placeholder='记录本次调整的业务原因' />{error && <p id='note-error' role='alert' className='t-l4 text-risk'>{error}</p>}<Button type='submit'>保存备注<Check /></Button></form></>}
    </ScrollArea></SheetContent></Sheet>
  </main></ProductShell>;
}
