import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, FileText } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet.js';
import { ScrollArea } from '../../../components/ui/scroll-area.js';
import { cn } from '../../../lib/utils.js';
import { appPath } from '../../../lib/app-path.js';
import { useProduct } from './product-state.js';
import { decisionGates } from './decision-evidence.js';
import type { FulfillmentProductView } from './product-view.js';

const steps = [
  { label: '数据接入', hint: '四源进入 open supOS' },
  { label: 'UNS 建模', hint: '统一业务语义' },
  { label: 'AI 履约处置', hint: '接地建议与人工确认' },
  { label: '现实回读', hint: '新事实回到系统' },
];
export function ReviewRail() {
  const { views, selectOrder, reviewStep, setReviewStep, backendError, loading } = useProduct();
  const navigate = useNavigate(); const [params] = useSearchParams();
  // UI-R10.1：?evidence=sheet 直接展开 Competition Evidence Sheet（供评审截图/深链）
  const [evidence, setEvidence] = useState(() => params.get('evidence') === 'sheet');
  const primary = views[0]!;
  const live = primary.case.origin === 'backend-live' && !loading && !backendError;
  const gates = decisionGates(primary);
  const completed = [
    live && ['ERP', 'MES', 'QMS', 'WMS'].every(source => primary.events.some(event => event.source === source)),
    live && primary.evidence.resolved && primary.uns.length === 5,
    live && ['execution', 'recheck', 'closed'].includes(primary.case.phase),
    live && primary.case.phase === 'closed' && gates[4]!.state === 'PASS' && primary.events.some(event => event.source === 'WMS' && event.value === 96),
  ];
  function visit(index: number) {
    selectOrder('SO-IND-001'); setReviewStep(index);
    navigate(index === 0 ? '/runtime?case=SO-IND-001&tab=data' : index === 1 ? '/runtime?case=SO-IND-001&tab=uns' : index === 2 ? '/?review=ai' : '/?review=loop');
  }
  return <>
    <div className='review-rail mx-auto flex max-w-[1440px] items-center gap-5 px-11 py-2'>
      <span className='t-l5 shrink-0 text-muted-foreground'>比赛叙事</span>
      <nav aria-label='评审证据路径' className='flex items-stretch gap-1'>{steps.map((step, index) => <div key={step.label} className='flex items-center gap-1'><button disabled={index > 0 && completed.slice(0, index).some(value => !value)} onClick={() => visit(index)} aria-current={reviewStep === index ? 'step' : undefined} data-state={reviewStep === index ? 'current' : completed[index] ? 'done' : 'idle'} className='review-step'><span className='review-step-index'>{String(index + 1).padStart(2, '0')}</span><span className='text-left'><span className='review-step-label block'>{step.label}{completed[index] && <Check className='ml-1.5 inline size-3 align-[-1px]' />}</span><span className='review-step-hint block'>{step.hint}</span></span></button>{index < 3 && <span className='review-rail-link' aria-hidden='true' />}</div>)}</nav>
      {reviewStep < 3 && <Button variant='ghost' size='sm' className='h-7 rounded-full text-xs' disabled={!completed[reviewStep]} onClick={() => visit(reviewStep + 1)}>下一步<ArrowRight className='size-3' /></Button>}
      <Button variant='ghost' size='sm' className='ml-auto h-7 rounded-full text-xs' onClick={() => setEvidence(true)}><FileText className='size-3.5' />查看项目证据</Button>
    </div>
    <ProjectEvidence open={evidence} close={() => setEvidence(false)} />
  </>;
}
function ProjectEvidence({ open, close }: { open: boolean; close: () => void }) {
  const { views, selectOrder, setReviewStep } = useProduct(); const navigate = useNavigate();
  function show(path: string, caseId = 'SO-IND-001', step = 2) { selectOrder(caseId); setReviewStep(step); close(); navigate(path + (path.includes('?') ? '&' : '?') + 'request=' + Date.now()); }
  const links = [
    ['跨系统业务身份关联', '/runtime?case=SO-IND-001&tab=uns', 1],
    ['来源时间完整性', '/?evidence=gates', 2],
    ['跨系统履约约束', '/?evidence=gates', 2],
    ['处置后现实复核', '/runtime?case=SO-IND-001&tab=data', 3],
    ['Grounded AI', '/?evidence=ai', 2],
  ] as const;
  return <Sheet open={open} onOpenChange={value => { if (!value) close(); }}><SheetContent className='sm:max-w-[620px]'><SheetHeader><SheetTitle>项目证据</SheetTitle><SheetDescription>工业来源 → open supOS → UNS → 工业 APP → AI 协同 → 现实回读</SheetDescription></SheetHeader><ScrollArea className='flex-1 pr-4'><div className='pb-7'>{/* UI-R10.1-FIX2：压缩前三个区域纵向间距，让「项目资料」的真实入口进入 1440×900 首屏。结构与文案不变。 */}
    <section className='evidence-section'><h3 className='mb-1 text-sm font-semibold'>技术证据</h3>{links.map(([label, path, step]) => <button key={label} onClick={() => show(path, 'SO-IND-001', step)} className='evidence-link text-sm text-primary'>{label}<ArrowRight className='size-3.5' /></button>)}<p className='mt-1 text-[11px] leading-[1.45] text-muted-foreground'>主案例为模拟工业输入经过真实 Runtime 的证据。点击进入当前事实，不重置处置阶段；事件轨保留此前 WMS 100 件记录。</p></section>
    <section className='evidence-section'><h3 className='mb-1 text-sm font-semibold'>场景验证</h3>{views.map((view, index) => <button key={view.case.id} onClick={() => show('/?evidence=gates', view.case.id)} className='evidence-link text-sm'><span>{view.case.id}<small className='ml-3 text-muted-foreground'>{['履约冲突与现实复核', '来源未齐', '等待现实执行', '重新验证完成'][index]}</small></span><ArrowRight className='size-3.5 text-primary' /></button>)}<p className='mt-1 text-[11px] leading-[1.45] text-muted-foreground'>001 读取当前真实链；002／003／004 为独立演示案例，覆盖等待及完成边界。</p></section>
    <section className='evidence-section'><h3 className='text-sm font-semibold'>可复用边界</h3><p className='mt-1.5 text-xs text-primary'>来源系统适配 → 统一业务语义 → 履约判断 → 工业 APP</p><p className='mt-1.5 text-xs leading-[1.5]'>更换来源系统时，接入与映射层可以调整，履约判断继续消费统一业务语义。</p><p className='mt-1 text-[11px] leading-[1.45] text-muted-foreground'>以既有 canonical contract 为边界。当前实时会话绑定 SO-IND-001，尚不支持任意工厂直接接入。</p><button onClick={() => show('/runtime?case=SO-IND-001&tab=flows', 'SO-IND-001', 0)} className='mt-1.5 flex items-center gap-2 text-xs text-primary'>查看实际来源映射<ArrowRight className='size-3' /></button></section>
    <section className='evidence-section'><h3 className='text-sm font-semibold'>项目资料</h3><div className='mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs'>
      <span className='text-muted-foreground' aria-disabled='true'>代码仓库 · 当前发行目录未配置远程链接</span>
      <a className='text-primary underline underline-offset-4' href={appPath('/review-materials/README.md')} target='_blank' rel='noreferrer'>README · 项目说明</a>
      <a className='text-primary underline underline-offset-4' href={appPath('/review-materials/architecture.md')} target='_blank' rel='noreferrer'>Architecture · 架构文档</a>
      <a className='text-primary underline underline-offset-4' href={appPath('/review-materials/integration-r1.md')} target='_blank' rel='noreferrer'>Deployment · 真实 Runtime 接线</a>
      <a className='text-primary underline underline-offset-4' href={appPath('/review-materials/governance.md')} target='_blank' rel='noreferrer'>Governance · 开源治理</a>
      <a className='text-primary underline underline-offset-4' href={appPath('/review-materials/roadmap.md')} target='_blank' rel='noreferrer'>Roadmap · 演进规划</a>
      <a className='text-primary underline underline-offset-4' href={appPath('/review-materials/LICENSE')} target='_blank' rel='noreferrer'>LICENSE · Apache-2.0</a>
    </div></section>
  </div></ScrollArea></SheetContent></Sheet>;
}
export function ReviewDecision({ view, open }: { view: FulfillmentProductView; open: () => void }) {
  const gates = decisionGates(view); const ordered = [gates[1]!, gates[0]!, gates[2]!, gates[3]!];
  return <div className='review-decision mx-auto mt-4 flex w-fit items-center gap-4' aria-label='评审 Decision Rail'>{ordered.map(gate => <button key={gate.label} onClick={open} className='flex items-center gap-2 text-[11px]'><span className='text-muted-foreground'>{gate.label}</span><b className={gate.state === 'PASS' ? 'text-primary' : gate.state === 'CONFLICT' || gate.state === 'STOP' ? 'text-risk' : 'text-muted-foreground'}>{gate.state === 'NOT_RUN' ? '不执行' : gate.state}</b><ArrowRight className='size-3 text-primary/25' /></button>)}<button onClick={open} className='text-[11px] text-primary'>人工处置 · {view.case.phase === 'decision' ? '等待授权' : view.case.phase === 'closed' ? '已复核' : view.case.phase === 'quality' ? '等待来源' : '已确认方案'}</button></div>;
}
export function ReviewReadback({ view }: { view: FulfillmentProductView }) {
  const event = view.events.find(item => item.source === 'WMS' && item.value === 96);
  const old = view.events.some(item => item.source === 'WMS' && item.value === 100);
  const confirmed = ['execution', 'recheck', 'closed'].includes(view.case.phase);
  return <div aria-label='现实回读证据' className='mx-4 mt-3 flex items-center justify-center gap-3 text-[11px]'>
    <span className={confirmed ? 'text-primary' : 'text-muted-foreground'}>人工确认 {confirmed ? '✓' : '等待'}</span><ArrowRight className='size-3 text-primary/30' />
    <span>WAITING · WMS {old ? '100' : '来源事实'}</span><ArrowRight className='size-3 text-primary/30' />
    <span className={event ? 'text-primary' : 'text-muted-foreground'}>{event ? '真实 WMS 96 → open supOS → ShipmentLine 100 → 96' : '等待新 WMS 事件 → open supOS → UNS'}</span><ArrowRight className='size-3 text-primary/30' />
    <span className={view.case.phase === 'closed' ? 'text-primary' : 'text-muted-foreground'}>{view.case.phase === 'closed' ? 'Revalidation ✓ · CLOSED' : '等待现实复核'}</span>
  </div>;
}
