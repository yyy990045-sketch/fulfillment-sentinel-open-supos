import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, HelpCircle, Play, RotateCcw } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { ScrollArea } from '../../../components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet.js';
import { cn } from '../../../lib/utils.js';
import { sources } from './demo-data.js';
import { GateRail, decisionGates } from './decision-evidence.js';
import { ProductShell } from './product-shell.js';
import { useProduct } from './product-state.js';
import { anchor, SpatialScene, type Playback, type SpatialNode } from './spatial-scene.js';
const labels = ['来源未齐', '订单关联错误', '履约冲突', '执行完成'];
function ValidationWorkspace({ selected, onSelect }: { selected: number; onSelect: (index: number) => void }) {
  const { views } = useProduct(); const product = views[0]!; const scenario = product.validation[selected]!;
  const [played, setPlayed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [playback, setPlayback] = useState<Playback | null>(() => selected === 0 ? { key: 'initial', route: ['ERP', 'MES', 'QMS'], duration: 1500 } : selected === 3 ? { key: 'initial', route: ['QMS', 'WMS'], duration: 1600 } : null);
  function select(index: number) { onSelect(index); setPlayed(false); setPlayback(index === 0 ? { key: `missing-${Date.now()}`, route: ['ERP', 'MES', 'QMS'], duration: 1500 } : index === 3 ? { key: `execution-${Date.now()}`, route: ['QMS', 'WMS'], duration: 1600 } : null); }
  const nodes: SpatialNode[] = selected === 1 ? [{ id: 'ERP', kind: 'order', x: 420, y: 158, scale: 1.5 }, { id: 'MES', kind: 'factory', x: 900, y: 158, scale: 1.5 }] : selected === 0 ? [{ id: 'QMS', kind: 'quality', x: 660, y: 158, scale: 1.7, waiting: true }] : [{ id: 'QMS', kind: 'quality', x: 456, y: 158, scale: 1.7 }, { id: 'WMS', kind: 'warehouse', x: 880, y: 158, scale: 1.7, risk: selected === 2 || !played }];
  const links = selected === 1 ? [{ from: 'ERP', to: 'MES', broken: true }] : selected === 0 ? [] : [{ from: 'QMS', to: 'WMS', risk: selected === 2 || !played }];
  const scenarioView = { ...product, case: { ...product.case, quantities: scenario.quantities, phase: (selected === 0 ? 'quality' : selected === 3 && played ? 'closed' : 'decision') as typeof product.case.phase }, evidence: { ...product.evidence, watermark: selected === 0 ? product.case.dueAt : scenario.watermark.includes('T') ? scenario.watermark : product.evidence.watermark, resolved: selected !== 1 } };
  const gates = decisionGates(scenarioView, selected).map((gate, i) => selected === 3 && !played && i === 4 ? { ...gate, state: 'WAITING' as const, detail: '等待新来源交付与复核' } : gate);
  const result = selected === 3 && !played ? '仓库新事实正在到达' : scenario.result;
  // 每个场景停在哪个 Gate —— 让四个场景看起来属于同一决策系统
  const stoppedAt = [0, 1, 3, 4][selected]!;
  const explanation = [
    '质量来源未覆盖判断时间。后续业务判断暂不执行。',
    '业务身份关联未通过，停止数量判断。',
    '来源、业务关联和共同水位通过后，才执行跨系统履约约束。',
    played ? '新的仓库执行事实已更新为 96 件，与质量放行一致；本次差异关闭，客户剩余 4 件需求仍保留。' : '模拟新的仓库执行事实进入判断，确认方案本身不会改写仓库来源记录。',
  ][selected]!;
  return <ProductShell page='validation'><main className='desktop-space pt-5'><div className='flex items-center justify-between'><h1 className='t-l2'>验证中心</h1><div role='group' aria-label='验证场景' className='flex rounded-full bg-secondary/75 p-1'>{labels.map((label, i) => <Button key={label} variant='ghost' aria-pressed={selected === i} className={cn('rounded-full t-l5 px-5', selected === i && 'bg-background font-semibold text-primary shadow-sm')} onClick={() => select(i)}>{label}</Button>)}</div></div>
    <p className='t-l5 mt-2 text-muted-foreground'>既有 Judge 门禁的独立场景演示 · 当前{selected === 3 && played ? '通过' : '停在'} <b className='text-primary'>{gates[stoppedAt]!.label}</b></p>
    <div className='validation-gates'><GateRail gates={gates} active={stoppedAt} onSelect={() => setSheet(true)} /></div>
    <SpatialScene nodes={nodes} links={links} playback={selected === 0 ? null : playback} onPlayed={() => { setPlayback(null); if (selected === 3) setPlayed(true); }} className='lab-scene'>
      <div className='scene-baseplane' />
      {nodes.map((node, i) => <button key={node.id} className='scene-object-label w-56 text-center' style={anchor(node.x, node.y + 152)} onClick={() => setSheet(true)} aria-label={`${node.id} 场景事实`}><span className='object-hit' /><span className='t-l5 block text-muted-foreground'>{node.id} · {selected === 1 ? i === 0 ? '订单要求' : '所属订单' : node.id === 'QMS' ? '质量放行' : node.id === 'WMS' ? selected === 3 ? '仓库执行' : '仓库计划' : i === 0 ? '订单要求' : '生产完成'}</span>{selected === 1 ? <strong className={cn('t-fact mt-3 block', i === 1 && 'text-risk')}>{i === 0 ? 'SO-001' : 'SO-999'}</strong> : <motion.strong key={selected === 3 ? String(played) : `${selected}-${i}`} initial={{ opacity: .5, y: 5 }} animate={{ opacity: 1, y: 0 }} className={cn('t-fact mt-2 block', node.risk && 'text-risk', node.waiting && 'text-3xl text-muted-foreground')}>{selected === 3 ? node.id === 'QMS' || played ? scenario.quantities[3] : product.validation[2]!.quantities[3] : node.waiting ? '等待' : scenario.quantities[sources.indexOf(node.id as typeof sources[number])]}{!node.waiting && <small className='ml-1 t-l5 font-normal text-muted-foreground'>件</small>}</motion.strong>}</button>)}
      {selected === 1 && <span className='t-l4 absolute -translate-x-1/2 text-risk' style={anchor(660, 148)}>订单关系断开</span>}
      {selected === 0 && <span className='t-l5 absolute -translate-x-1/2 text-muted-foreground' style={anchor(660, 32)}>等待质量来源覆盖判断时间</span>}
      {selected === 2 && <span className='absolute -translate-x-1/2 text-[2rem] font-medium text-risk tabular-nums' style={anchor(1032, 150)}>+4 件</span>}
      {selected === 3 && <div className='absolute -translate-x-1/2 text-center' style={anchor(664, 106)}><span className='t-l5 text-muted-foreground'>仓库执行更新</span><p className='mt-2 flex items-center gap-4 t-l2'><span className={played ? 'text-muted-foreground/50 line-through' : 'text-risk'}>100</span><ArrowRight className='size-5 text-primary/40' /><span className='text-primary'>96</span></p></div>}
      <section className='absolute bottom-3 left-1/2 w-[920px] -translate-x-1/2 text-center' aria-label='当前判断结果'><AnimatePresence mode='wait'><motion.h2 key={result} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn('t-l1', selected === 1 || selected === 2 ? 'text-risk' : 'text-primary')}>{result}</motion.h2></AnimatePresence><p className='mx-auto mt-2 max-w-[780px] t-l4 font-normal leading-6 text-foreground/75'>{explanation}</p><Button variant='ghost' className='mt-1 rounded-full t-l5 text-muted-foreground' onClick={() => setSheet(true)}><HelpCircle className='size-3.5' />为什么这样判断？</Button>{selected === 3 && <Button variant='ghost' className='ml-2 mt-1 rounded-full t-l5' onClick={() => select(3)} disabled={playback !== null}><Play className='size-3' />重放执行更新</Button>}</section>
    </SpatialScene>
    <p className='t-l4 text-center text-primary'>{['继续条件：收到覆盖交期＋1小时的质量来源进度与质量事实。', '继续条件：提供可解析到同一订单行的真实关联引用。', '继续条件：人工确认内部方案后，等待新的仓库执行事实并重新验证。', '复核成立：新 WMS 96 件与质量放行一致，四源共同水位覆盖判断边界。'][selected]}</p>
    <div className='flex justify-center'><Button variant='ghost' size='sm' className='t-l5 text-muted-foreground' onClick={() => select(0)}><RotateCcw className='size-3' />恢复起始场景</Button></div>
    <Sheet open={sheet} onOpenChange={setSheet}><SheetContent><SheetHeader><SheetTitle>为什么这样判断？</SheetTitle><SheetDescription>{scenario.label} · 演示来源事实</SheetDescription></SheetHeader><ScrollArea className='flex-1 pr-3'><div className='space-y-7 text-sm leading-7'><section><h3 className='font-medium'>同一业务对象</h3><p className={cn('mt-2 break-words', selected === 1 ? 'text-risk' : 'text-muted-foreground')}>{scenario.relation}</p></section><section><h3 className='font-medium'>来源完整性</h3><p className='mt-2 text-muted-foreground'>{scenario.reason}</p>{sources.map(source => <p key={source} className='mt-2 text-xs text-muted-foreground'>{source} · {scenario.sourceProgress[source]}</p>)}</section><section><h3 className='font-medium'>时间边界</h3><p className='mt-2 text-muted-foreground'>共同判断水位：{scenario.watermark}</p><p className='mt-2 text-xs text-muted-foreground'>四源共同水位必须覆盖交期＋1 小时：{product.evidence.boundary}</p></section><section><h3 className='font-medium'>履约规则</h3><p className='mt-2 text-muted-foreground'>仓库执行不得超过当前质检放行数量；确认方案不改写客户订单，必须等待新的仓库事实后复核。</p><p className='mt-3 text-primary'>{scenario.disposition}</p></section><section><h3 className='font-medium'>来源记录</h3>{sources.map((source, i) => <div key={source} className='mt-4'><b className='font-medium'>{source}</b><p className='text-muted-foreground'>{selected === 1 ? i === 0 ? 'SO-001' : i === 1 ? 'SO-999' : '关系未通过，停止数量比较' : selected === 0 && i === 2 ? '等待来源更新' : `${scenario.quantities[i]} 件`}</p><p className='break-all font-mono text-[10px] text-muted-foreground'>{product.facts[i]!.topic}</p></div>)}</section><p className='text-xs text-primary'>{result}</p></div></ScrollArea></SheetContent></Sheet>
  </main></ProductShell>;
}
export function ValidationPage() {
  const [params, setParams] = useSearchParams(); const ids = ['missing', 'lineage', 'conflict', 'complete'];
  const index = ids.indexOf(params.get('scenario') ?? 'missing'); const selected = index < 0 ? 0 : index;
  return <ValidationWorkspace key={ids[selected]} selected={selected} onSelect={value => setParams({ scenario: ids[value]! })} />;
}
