import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, ChevronUp, Copy, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { ScrollArea } from '../../../components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet.js';
import { createCopilotAdapter, factVersion, type CopilotBrief } from './copilot-brief.js';
import { displayTime, type FulfillmentProductView } from './product-view.js';
type Result = { brief: CopilotBrief; version: string };
// Presentation only: retain the provider response unchanged for evidence and records.
function productCopy(text: string) {
  return text.replace(/requiredQty/g, '客户订单要求').replace(/completedQty/g, '生产完成数量').replace(/releasedQty/g, '质量放行数量').replace(/executionCommittedQty/g, '仓库执行数量')
    .replace(/订单要求数量为/g, '客户订单要求').replace(/生产完工数量为/g, '生产已完成').replace(/质量放行数量为/g, '质量已放行').replace(/仓库执行承诺数量为/g, '仓库执行数量为');
}
export function CopilotPanel({ view, expanded, onExpanded, review = false, evidenceRequest }: { view: FulfillmentProductView; expanded: boolean; onExpanded: (value: boolean) => void; review?: boolean; evidenceRequest?: string | null }) {
  const [result, setResult] = useState<Result | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'unavailable' | 'error'>('idle');
  const [request, setRequest] = useState<{ serial: number; purpose: 'brief' | 'summary' | 'evidence' } | null>(null);
  const [sheet, setSheet] = useState<'evidence' | 'coordination' | 'summary' | null>(null);
  const openedEvidenceRequest = useRef(0);
  const [copied, setCopied] = useState(false); const [copyError, setCopyError] = useState(false);
  const version = factVersion(view); const fresh = result?.version === version;
  const adapter = useMemo(() => createCopilotAdapter(view), [version]);
  const closed = view.case.phase === 'closed'; const required = view.case.quantities[0];
  const brief = fresh ? result!.brief : null;
  const suggestedQty = brief?.recommendedAction.quantity;
  const actionCopy = brief && view.case.phase === 'decision' && suggestedQty !== null && suggestedQty !== undefined
    ? `建议仓库按 ${suggestedQty} 件更新执行计划${required > suggestedQty ? `，并由销售继续跟踪剩余 ${required - suggestedQty} 件客户需求。` : '。'}`
    : brief ? productCopy(brief.recommendedAction.label) : '使用最新来源状态整理协同内容。';
  useEffect(() => {
    if (!request) return;
    let current = true;
    setState('loading'); setCopied(false); setCopyError(false);
    void adapter.getCopilotBrief(view.case.id).then(value => {
      if (!current) return;
      if (!value.available) { setState('unavailable'); return; }
      setResult({ brief: value, version }); setState('idle'); onExpanded(true);
      if (request.purpose === 'summary') setSheet('summary');
      if (request.purpose === 'evidence' && openedEvidenceRequest.current !== request.serial) { openedEvidenceRequest.current = request.serial; setSheet('evidence'); }
    }).catch(error => {
      console.warn('copilot_adapter_failed', error instanceof Error ? error.name : 'adapter_failed');
      if (current) setState('error');
    });
    return () => { current = false; };
  }, [adapter, request]);
  useEffect(() => { if (evidenceRequest) setRequest(previous => ({ serial: (previous?.serial ?? 0) + 1, purpose: 'evidence' })); }, [evidenceRequest]);
  function generate(purpose: 'brief' | 'summary') { if (state === 'loading') return; setRequest(previous => ({ serial: (previous?.serial ?? 0) + 1, purpose })); }
  const record = brief ? `${brief.caseId}：${brief.summary}\n${brief.reasoningSummary}` : '';
  async function copySummary() {
    try { await navigator.clipboard.writeText(productCopy(record)); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }
  const busy = state === 'loading';
  const sourceReady = view.case.id !== 'SO-IND-001' || view.case.origin === 'backend-live';
  return <section aria-label='AI 协同建议' data-copilot-source={brief?.source} data-copilot-case={brief?.caseId} className='mt-3 text-left' aria-busy={busy}>
    {review && <div aria-label='AI 事实边界' className='mb-2 text-center'><p className='text-[10px] font-medium text-primary'>已验证工业事实 → AI解释／建议／协同 → 人工授权</p><p className='mt-1 text-[10px] text-muted-foreground'>AI只消费已验证履约事实，不修改工业事实。</p>{brief && <p className='mt-1 text-[10px] text-muted-foreground'>{brief.source === 'live' ? '当前建议来自真实 AI 响应' : '当前建议使用演示适配结果，非本次实时模型响应'}</p>}</div>}
    <AnimatePresence mode='wait'>
      {!expanded ? <motion.div key='entry' initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className='flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-2'>
        <span className='inline-flex items-center gap-2 text-sm font-medium text-primary'><Sparkles className='size-4' />{closed ? 'AI 复核摘要' : 'AI 协同'}</span>
        <p className='text-xs text-muted-foreground'>{closed ? '基于最新来源事实，生成可记录的处理总结' : view.case.phase === 'quality' ? '等待质量覆盖，仅生成协调说明' : '已可基于4个来源事实生成建议'}</p>
        <Button variant='secondary' size='sm' className='rounded-full' disabled={busy || !sourceReady} onClick={() => brief ? onExpanded(true) : generate(closed ? 'summary' : 'brief')}>{busy ? '正在整理当前履约事实…' : brief ? '查看协同建议' : closed ? '生成处理总结' : '生成协同建议'}<ArrowRight className='size-3.5' /></Button>
      </motion.div> : <motion.div key='panel' initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className='rounded-xl bg-secondary/55 px-4 py-3'>
        <header className='flex items-center gap-3'><h2 className='flex items-center gap-2 text-sm font-semibold'><Sparkles className='size-4 text-primary' />{closed ? 'AI 复核摘要' : 'AI 协同建议'}</h2><Button variant='ghost' size='sm' className='ml-auto h-7 rounded-full' aria-label='收起协同建议' onClick={() => onExpanded(false)}><ChevronUp className='size-3' />收起</Button></header>
        {brief && <p className='mt-2 text-[11px] text-muted-foreground'>{brief.source === 'live' ? '来自本次模型响应' : '演示协同内容 · 非本次实时模型响应'}</p>}
        <div className='mt-2 grid grid-cols-2 gap-5'>
          <section><h3 className='text-xs font-medium'>{view.case.phase === 'decision' ? '当前情况' : '当前状态'}</h3><p className='mt-1 text-xs leading-5 line-clamp-3' title={brief ? productCopy(brief.summary) : undefined}>{brief ? productCopy(brief.summary) : '正在整理当前履约事实…'}</p><div className='mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground'>{view.facts.map(fact => <span key={fact.source}>{fact.source} {fact.quantity === null ? '等待' : fact.quantity}</span>)}<button className='text-primary' disabled={!brief} onClick={() => setSheet('evidence')}>查看依据<ArrowRight className='ml-1 inline size-3' /></button></div></section>
          <section><h3 className='text-xs font-medium'>{closed ? '处理记录' : view.case.phase === 'decision' ? '建议处理' : '后续协同'}</h3><p className='mt-2 text-sm leading-6'>{actionCopy}</p><p className='mt-2 text-xs font-medium text-primary'>客户原订单仍为 {required} 件。</p></section>
        </div>
        <section className='mt-2 flex flex-wrap items-center gap-2'><h3 className='text-xs font-medium'>协同说明</h3><p className='text-xs text-muted-foreground'>{brief ? '已生成跨部门说明' : '正在更新当前状态'}</p><Button variant='ghost' size='sm' className='h-7 rounded-full text-primary' disabled={!brief || busy} onClick={() => setSheet('coordination')}>查看协同内容<ArrowRight className='size-3' /></Button>{closed && <Button variant='secondary' size='sm' className='ml-auto h-8 rounded-full' disabled={busy} onClick={() => generate('summary')}>生成处理总结<ArrowRight className='size-3' /></Button>}</section>
      </motion.div>}
    </AnimatePresence>
    {busy && expanded && <div role='status' className='flex items-center justify-end gap-3 py-2 text-xs text-muted-foreground'><span className='h-2 w-16 animate-pulse rounded-full bg-primary/10' />正在整理当前履约事实…</div>}
    {(state === 'unavailable' || state === 'error') && <div role='status' className='flex items-center justify-end gap-3 pb-2 text-xs text-muted-foreground'><span>当前无法整理协同建议，来源事实与人工处置仍可查看。</span><button className='text-primary' onClick={() => generate(closed ? 'summary' : 'brief')}>重试生成</button></div>}
    <Sheet open={sheet !== null} onOpenChange={open => { if (!open) setSheet(null); }}><SheetContent><SheetHeader><SheetTitle>{sheet === 'evidence' ? 'AI 建议依据' : sheet === 'summary' ? '处理总结' : '跨部门协同说明'}</SheetTitle><SheetDescription>{view.case.id} · 当前履约事实</SheetDescription></SheetHeader><ScrollArea className='flex-1 pr-3'>
      {sheet === 'evidence' && brief && <div className='space-y-7'><p className='text-xs text-muted-foreground'>{brief.source === 'live' ? '真实 AI 响应 · 当前已验证事实' : '演示适配结果 · 非本次实时模型响应'}</p><p className='text-sm leading-7 text-primary'>AI 只基于已经验证的履约事实生成解释与协同建议，不决定工业事实。</p><p className='text-sm leading-7'>{brief.recommendedAction.reason}</p>{brief.evidenceRefs.map(ref => { const fact = view.facts.find(item => item.source === ref.system); return <section key={ref.system + ref.label}><h3 className='flex items-center gap-3 text-sm font-medium'>{ref.label}<span className='text-xs text-muted-foreground'>{ref.system}</span></h3><p className='mt-2 text-2xl'>{ref.value}</p>{fact && <><p className='mt-2 text-xs text-muted-foreground'>{fact.instance} · {displayTime(fact.sourceTime)}</p><p className='mt-2 break-all font-mono text-[10px] text-muted-foreground'>{fact.topic}</p></>}</section>; })}<div className='space-y-2 text-xs leading-6 text-muted-foreground'>{brief.limitations.map(text => <p key={text}>{text}</p>)}</div></div>}
      {sheet === 'coordination' && brief && <div className='space-y-7'>{(['sales', 'production', 'quality', 'warehouse'] as const).map((department, i) => <section key={department}><h3 className='text-sm font-semibold'>{['销售', '生产', '质量', '仓库'][i]}</h3><p className='mt-3 text-sm leading-7'>{productCopy(brief.coordination[department])}</p></section>)}</div>}
      {sheet === 'summary' && brief && <div><p className='whitespace-pre-line text-sm leading-8 select-text'>{productCopy(record)}</p><Button className='mt-6 rounded-full' onClick={() => void copySummary()}>{copied ? <Check /> : <Copy />}{copied ? '已复制总结' : '复制到工作记录'}</Button>{copyError && <p role='status' className='mt-3 text-xs text-muted-foreground'>无法直接复制，请选中上方内容复制。</p>}<p className='mt-5 text-xs leading-6 text-muted-foreground'>本次总结不会写入来源系统，也不会修改客户订单。</p></div>}
      {!brief && <p role='status' className='text-sm leading-7'>正在整理当前履约事实…</p>}
    </ScrollArea></SheetContent></Sheet>
  </section>;
}
