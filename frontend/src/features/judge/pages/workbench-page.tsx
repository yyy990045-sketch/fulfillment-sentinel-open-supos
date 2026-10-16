import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, Circle, CircleAlert, Layers3, MessageSquare } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { ScrollArea } from '../../../components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet.js';
import { cn } from '../../../lib/utils.js';
import { mappings, phaseLabels, sources } from './demo-data.js';
import { useProduct } from './product-state.js';
import { ProductShell } from './product-shell.js';
import { displayTime } from './product-view.js';
import { DecisionEvidence, decisionGates } from './decision-evidence.js';
import { CopilotPanel } from './copilot-panel.js';
import { ReviewDecision, ReviewReadback } from './review-evidence.js';
import { anchor, SpatialScene, type SpatialNode } from './spatial-scene.js';

const steps = ['发现异常', '确认处理', '仓库执行', '重新核对', '完成'];
const labels = ['订单要求', '生产完成', '质检放行', '仓库计划'];

export function WorkbenchPage() {
  const { view, views, selectOrder: setSelected, advance, addNote, loading, backendError, refresh, actionBusy, actionError, review, reviewStep } = useProduct();
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

  // UI-R10: 主业务场景。四源横向铺开，冲突落在 QMS→WMS 断口。
  // 右侧留给 Action Dock；四源刻意减小 scale，避免 3D 体块向下盖住自己的事实数字。
  const nodes: SpatialNode[] = [
    { id: 'ERP', kind: 'order', x: 148, y: 268, scale: 1.5 },
    { id: 'MES', kind: 'factory', x: 408, y: 248, scale: 1.5 },
    { id: 'QMS', kind: 'quality', x: 652, y: 268, scale: 1.5, waiting: released === null },
    { id: 'WMS', kind: 'warehouse', x: 888, y: 268, scale: 1.55, risk: conflict },
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
      : `同一订单的质量放行与仓库执行均为 ${released} 件，${order.phase === 'closed' ? '已完成复核' : '可以重新核对'}。`;

  return <ProductShell page='workbench'><main className='desktop-space relative'>

    {/* ── L2/L4 业务身份条：紧凑，仅占一行 + 一行结论，把高度让给主场景 ── */}
    <header className='flex items-end justify-between gap-6 pt-5'>
      <div className='flex min-w-0 items-center gap-5'>
        <Button variant='ghost' className='queue-entry' onClick={() => setDrawer('queue')}>待处理 <b>{orders.filter(item => item.phase !== 'closed').length}</b><ChevronDown /></Button>
        <button className='flex items-center gap-2.5 text-left' onClick={() => setDrawer('order')} aria-label='查看当前订单信息'>
          <h1 className='t-l2'>{order.id}</h1><ChevronDown className='size-4 text-muted-foreground' />
        </button>
        <span className='rule-y h-6' />
        <p className='t-l4 flex min-w-0 items-center gap-3 truncate font-normal text-muted-foreground'>
          <span className='text-foreground'>{order.customer}</span><span>{order.product}</span>
          <span>行 {order.line}</span><span>{order.due} 交付</span><span>{order.owner}</span>
        </p>
      </div>
      <span className={cn('flex shrink-0 items-center gap-2 t-l4', conflict ? 'text-risk' : 'text-primary')}>
        <span className='size-1.5 rounded-full bg-current' />{phaseLabels[order.phase]}
      </span>
    </header>

    {/* ── L1：结论降为"编辑性陈述"，不再与冲突数字抢第一视觉 —— 字号由 t-l1 下调 12% ── */}
    <div className='mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1'>
      <p className={cn('t-l1-editorial', conflict ? 'text-risk' : 'text-primary')}>{reason}</p>
      <p className='t-l4 font-normal text-muted-foreground'>
        客户原订单仍为 {order.quantities[0]} 件 · 当前可交付 {released ?? '等待质量覆盖'}{released !== null && ' 件'} · {released !== null ? remaining > 0 ? `剩余 ${remaining} 件继续履约` : '当前客户需求已覆盖' : '后续业务判断暂不执行'}
      </p>
      {(loading || backendError) && <span role='status' className='t-l5'>{loading ? '正在同步订单状态…' : <><span>暂时无法同步，当前展示演示案例</span><button className='ml-2 text-primary' onClick={refresh}>重新同步</button></>}</span>}
    </div>

    {/* ── 处理流程：细规则线上的五段轨，非卡片 ── */}
    <ol className='rule-x mt-4 flex w-fit items-center gap-4 pt-3' aria-label='处理流程'>{steps.map((label, i) => <li key={label} className='flex items-center gap-4'><button className={cn('t-l5 flex items-center gap-2 text-muted-foreground', i === step && 'font-semibold text-primary', i < step && 'text-primary')} onClick={() => { setHistoryStep(i); setDrawer('history'); }}>{i < step ? <Check className='size-3.5' /> : i === step ? <span className='size-1.5 rounded-full bg-primary ring-4 ring-primary/10' /> : <Circle className='size-3 text-muted-foreground/40' />}{label}</button>{i < 4 && <ArrowRight className='size-3 text-primary/20' />}</li>)}</ol>

    {review && <ReviewDecision view={view} open={() => setDrawer('gates')} />}
    {review && reviewStep === 3 && selected === 'SO-IND-001' && <ReviewReadback view={view} />}

    {/* ══ 主业务场景：第一视觉中心。QMS96 → WMS100 的断裂与 +4 是画面最大元素 ══ */}
    <SpatialScene nodes={nodes} links={[{ from: 'ERP', to: 'MES' }, { from: 'MES', to: 'QMS', stopped: released === null }, { from: 'QMS', to: 'WMS', risk: conflict, stopped: released === null }]} className='work-scene'>
      <div className='scene-baseplane' />
      <div className='scene-horizon' />

      {/* 四源事实：数字是页面绝对第一视觉（t-fact-hero），标签降到 L5 */}
      {nodes.map((node, i) => <button key={node.id} className='scene-object-label text-center' style={anchor(node.x, node.y + 92)} onClick={() => setDrawer('source')} aria-label={`${sources[i]} 来源事实`}>
        <span className='object-hit' />
        <span className='t-l5 block text-muted-foreground'>{currentLabels[i]} <small className='ml-1'>{sources[i]}</small></span>
        <motion.strong key={order.quantities[i]} initial={{ opacity: .6, y: 3 }} animate={{ opacity: 1, y: 0 }} className={cn('t-fact-hero mt-1', node.risk && 'text-risk', order.quantities[i] === null && 'text-4xl text-muted-foreground')}>
          {order.quantities[i] ?? '等待'}{order.quantities[i] !== null && <small className='ml-1.5 text-base font-normal text-muted-foreground'>件</small>}
        </motion.strong>
        <span className='t-l5 mt-2 block text-muted-foreground'>来源 {displayTime(view.facts[i]!.sourceTime)}</span>
        <span className='t-l5 mt-0.5 block text-primary'>{Date.parse(view.facts[i]!.progressTime) >= Date.parse(view.evidence.boundary) ? '来源进度已覆盖' : '等待来源覆盖交期＋1小时'}</span>
      </button>)}

      {/* 冲突章：+4 是页面最大字号 —— 5 秒内必须先看到它。落在 QMS→WMS 断口正上方 */}
      <div className='absolute -translate-x-1/2 text-center' style={anchor(788, 58)}>
        {conflict ? <>
          <span className='t-l3 inline-flex items-center gap-1.5 font-semibold text-risk'><CircleAlert className='size-5' />计划超过可放行</span>
          <p className='t-gap-hero mt-1 text-risk'>{gap}<small className='ml-2 text-2xl font-normal'>件</small></p>
        </> : <p className='t-l3 flex items-center gap-2 text-primary'><Check className='size-5' />{released === null ? '等待质量来源' : '执行数量已对齐'}</p>}
      </div>

      {/* 业务语言，不是技术字段：客户原订单不受内部处置影响 */}
      <p className='t-l4 absolute max-w-[430px] text-muted-foreground' style={anchor(148, 520)}>客户原订单仍为 {order.quantities[0]} 件，内部处置不改变原始订单要求。</p>
        <section aria-label='当前处置动作' className='work-action text-center' style={anchor(1144, 178)}>
          <p className='t-l5 text-muted-foreground'>本次可执行数量：{released === null ? '等待来源覆盖' : `${released} 件`}</p>
          <motion.p key={order.phase} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className='t-l3 mt-1.5'>{action.title}</motion.p>
          <Button className='mt-3 min-w-36 rounded-full px-7' onClick={() => void act()} disabled={actionBusy || (selected === 'SO-IND-001' && (loading || backendError || order.origin !== 'backend-live'))}>{actionBusy ? '正在同步处理状态…' : action.button}<ArrowRight /></Button>
          <p className='t-l5 mt-3 text-muted-foreground'>{order.phase === 'decision' ? '确认只授权内部方案，仓库事实须由来源更新。' : order.phase === 'execution' ? '已授权内部方案；仓库来源仍未改变。' : order.phase === 'closed' ? '内部差异已复核，客户剩余需求继续保留。' : '来源证据齐备后继续处理。'}</p>
          <div className='mt-1.5 flex justify-center gap-2'>
            <Button variant='ghost' size='sm' onClick={() => navigate(`/runtime?case=${selected}&tab=data`)}><Layers3 />查看来源</Button>
            <Button variant='ghost' size='sm' onClick={() => setDrawer('gates')}>查看判断依据</Button>
            <Button variant='ghost' size='sm' onClick={() => setDrawer('note')}><MessageSquare />添加备注{(notes[selected] ?? []).length > 0 && <span className='size-1.5 rounded-full bg-primary' />}</Button>
          </div>
          {actionError && <p role='alert' className='t-l5 mt-2 text-risk'>{actionError}</p>}
          <CopilotPanel key={selected} review={review} evidenceRequest={evidence === 'ai' ? params.get('request') ?? 'evidence' : null} view={view} expanded={copilotExpanded} onExpanded={expanded => setExpandedCase(expanded ? selected : null)} />
        </section>
    </SpatialScene>

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
