import { useState, type ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRight, Database, Play, Radio, Workflow, Check } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { ScrollArea } from '../../../components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../components/ui/sheet.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs.js';
import { cn } from '../../../lib/utils.js';
import { mappings, sources, type Source } from './demo-data.js';
import { useProduct } from './product-state.js';
import { displayTime, type FulfillmentProductView, type ProductEvent } from './product-view.js';
import { ProductShell } from './product-shell.js';
import { anchor, SpatialScene, type Playback, type SpatialNode } from './spatial-scene.js';
function Detail({ title, description, close, children }: { title: string; description: string; close: () => void; children: ReactNode }) {
  return <Sheet open onOpenChange={open => { if (!open) close(); }}><SheetContent><SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader><ScrollArea className='flex-1 pr-3'><div className='space-y-6 text-sm leading-7'>{children}</div></ScrollArea></SheetContent></Sheet>;
}
function eventFields(source: Source, event: ProductEvent, product: FulfillmentProductView, progress = false) {
  if (progress) return [{ raw: 'business_key', canonical: 'businessKey', value: product.case.id }, { raw: 'source_progress_at', canonical: 'sourceProgressAt', value: product.facts.find(f => f.source === source)!.progressTime }, { raw: 'event_type', canonical: 'eventType', value: 'source_progress' }];
  const values: Record<Source, (string | number)[]> = {
    ERP: [product.case.id, event.value, product.case.dueAt, product.facts[0]!.instance],
    MES: [product.facts[1]!.instance, event.value, product.case.lot, product.facts[0]!.instance],
    QMS: [product.uns[3]!.instance, event.value, product.case.lot, event.sourceTime ?? event.time],
    WMS: [product.facts[3]!.instance, event.value, product.facts[0]!.instance, event.sourceTime ?? event.time],
  };
  return mappings[source].raw.map((raw, i) => ({ raw, canonical: mappings[source].canonical[i]!, value: values[source][i]! }));
}
function DataFlow({ product, changeTab, pending }: { product: FulfillmentProductView; changeTab: (tab: string, model?: string) => void; pending: boolean }) {
  const { deliver, review } = useProduct(); const navigate = useNavigate();
  const [params] = useSearchParams();
  const events = product.events;
  // UI-R10.1-FIX2：静态定格。截图/深链用 ?stage 选「看哪一条事件」，不参与阶段推导。
  //   ?idx=N   —— 在真实事件序列里选中第 N 条（0 = 最早）
  //   ?qty=96  —— 优先把「真实值为 96」的同类事件作为选中项（例如真实 WMS 96 执行事件）
  //   ?qty=100 —— 退回该来源最新一条
  // 只做**选择**，绝不改写任何数值、也绝不新增事件。
  //
  // ⚠️ views 是异步加载的：挂载时 product.events 可能仍为空，
  // 因此**不能**在 useState 初始化里解析 deep-link（会锁死成首页事件）。
  // 改用「每次渲染解析」+ 用户点击后才脱离 deep-link。
  const wantStage = params.get('stage') !== null;
  const wantQty = params.get('qty');
  const wantIdx = params.get('idx');
  function pickCursor(): number {
    if (!events.length) return -1;
    if (wantIdx !== null && /^\d+$/.test(wantIdx)) return Math.max(0, Math.min(Number(wantIdx), events.length - 1));
    if (wantQty !== null) {
      const want = Number(wantQty);
      const hit = events.findIndex(e => e.source === 'WMS' && e.value === want);
      if (hit >= 0) return hit;
    }
    const wms = events.findIndex(e => e.source === 'WMS');
    return wms >= 0 ? wms : 0;
  }
  const [manual, setManual] = useState<number | null>(null);
  const target = manual ?? (wantStage ? pickCursor() : pending && product.pendingEventId ? Math.max(0, events.findIndex(e => e.id === product.pendingEventId)) : -1);
  const cursor = target < 0 ? Math.max(0, events.map(event => event.source === 'WMS' && event.value === product.case.quantities[3]).lastIndexOf(true)) : Math.min(target, events.length - 1);
  const setCursor = setManual;
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [replayStage, setReplayStage] = useState(-1);
  const [trace, setTrace] = useState<string | null>('current'); const [detail, setDetail] = useState<string | null>(null);
  const current = events[cursor]!;
  // UI-R10.1-FIX2：reached 是**推断**，不是逐跳 telemetry。
  // 真实可观测证据只有两条：observation 已进入 runtime 队列（⇒ RAW 已接收 / 已接入）、
  // canonicalTopic 已形成（⇒ 已形成 canonical）。UNS 折叠与 Sentinel 判定不产生
  // 逐条事件级证据，因此**不**在此处渲染任何「已到达 / 已交付」措辞。
  const observedStage = replayStage;
  const selected = trace === 'current' ? current : events.find(e => e.id === trace);
  const q = product.case.quantities; const gap = q[2] === null ? 0 : q[3] - q[2];
  // UI-R10：open supOS 必须是画面中心，内部明确三层（INGEST / NORMALIZE / SEMANTIC）。
  // 四源从左侧外围进入，履约哨兵从 SEMANTIC 层右端消费 —— 不再是「四个源 + 一个盒子」。
  const platformX = 612;
  const nodes: SpatialNode[] = [
    ...sources.map((source, i): SpatialNode => ({ id: source, kind: ['order', 'factory', 'quality', 'warehouse'][i] as SpatialNode['kind'], x: 132, y: 118 + i * 128, scale: .95, waiting: source === 'QMS' && q[2] === null })),
    { id: 'EMQX', kind: 'layer', x: platformX, y: 132, scale: 1.28 },
    { id: 'Node-RED', kind: 'layer', x: platformX, y: 300, scale: 1.28 },
    { id: 'UNS', kind: 'layer', x: platformX, y: 468, scale: 1.28 },
    { id: '履约哨兵', kind: 'app', x: 1150, y: 300, scale: 1.5, risk: gap > 0 || !!(playback && current.pending) },
  ];
  function play() {
    const next = pending && current.id === product.pendingEventId ? cursor : cursor >= events.length - 1 ? 0 : cursor + 1;
    const event = events[next]!; setCursor(next); setReplayStage(0); setPlayback({ key: event.id + Date.now(), route: event.stages, duration: 2400 });
  }
  function reached(id: string) { setReplayStage(current.stages.indexOf(id)); if (id === 'UNS' && current.id === product.pendingEventId) deliver(product.case.id, current.id, false); }
  function finished() { if (current.id === product.pendingEventId) deliver(product.case.id, current.id, true); setReplayStage(current.stages.length); setPlayback(null); }
  return <>
    <section aria-label='当前事件状态' data-runtime-event-id={current.id} className='current-event-status rule-x mx-4 mb-2 flex items-center justify-between gap-8 py-3'>
      <div><span className='t-l5 text-muted-foreground'>当前观察{product.workflow.actionMode === 'runtime' && ' · canonical 结果'}</span><h2 className='t-l3 mt-1'><button className='text-left hover:text-primary' onClick={() => setTrace(current.id)}>{current.source === 'SENTINEL' ? current.text : `${current.source} · ${current.source === 'WMS' ? '仓库来源' : { ERP: '订单要求', MES: '生产完成', QMS: '质量放行' }[current.source]} ${current.value} 件`}</button></h2><p className='t-meta mt-1'>{current.businessRef} · 来源 {current.time}</p></div>
      <ol className='flex items-center gap-5' aria-label='当前事件经过阶段'>{current.stages.map((stage, i) => { const state = observedStage > i ? 'delivered' : observedStage === i ? 'active' : 'pending'; const label = stage === current.source ? 'RAW' : stage === '履约哨兵' ? 'Sentinel' : stage; // UI-R10.1-FIX2 严格语义：只对确有证据的状态给强断言，其余显式降级
        const stateText = playback ? state === 'active' ? '回放中' : state === 'delivered' ? '回放经过' : '回放待经过' : stage === 'Node-RED' ? 'canonical 已观测' : '路径说明'; return <li key={stage} className='flex items-center gap-4' data-state={state}><span className={cn('t-l4 flex items-center gap-2', playback && state !== 'pending' || stage === 'Node-RED' ? 'font-semibold text-primary' : 'text-muted-foreground')} aria-label={`${label} ${stateText}`}><span className={cn('size-1.5 rounded-full bg-current', playback && state === 'active' && 'ring-4 ring-primary/10')} />{label}<small className='t-l5 font-normal'>{stateText}</small></span>{i < current.stages.length - 1 && <ArrowRight className='size-3 text-primary/25' />}</li>; })}</ol>
    </section>
    <SpatialScene nodes={nodes} links={[...sources.map(source => ({ from: source, to: 'EMQX' })), { from: 'EMQX', to: 'Node-RED' }, { from: 'Node-RED', to: 'UNS' }, { from: 'UNS', to: '履约哨兵' }]} playback={playback} onStage={reached} onPlayed={finished} className={trace ? 'runtime-scene runtime-traced' : 'runtime-scene'}>
      <div className='scene-baseplane' />
      <div className='runtime-atmosphere' /><span className='t-l4 absolute -translate-x-1/2 tracking-[.2em] text-primary' style={anchor(platformX, 22)}>open supOS · 平台运行空间</span>
      {/* 平台三层：标签放左侧空白处，避免被 2.5D 体块遮挡 */}
      {([
        ['来源接入', 'EMQX 接收 MQTT', 88],
        ['字段规范化', 'Node-RED 映射与关联', 256],
        ['统一业务对象', 'UNS 标准语义', 424],
      ] as const).map(([name, hint, y]) => <section key={name} className='runtime-layer-label absolute' style={anchor(276, y)}>
        <span className='t-l4 block font-semibold text-primary'>{name}</span>
        <span className='t-l5 block text-muted-foreground'>{hint}</span>
      </section>)}
      {/* 标签 → 平台层的引线：让三层归属明确，而不是浮在空白处 */}
      <span className='runtime-layer-leader absolute' style={anchor(322, 100)} />
      <span className='runtime-layer-leader absolute' style={anchor(322, 268)} />
      <span className='runtime-layer-leader absolute' style={anchor(322, 436)} />
      {/* 三层纵向贯通：平台内部是一条数据阶梯，不是三个孤立盒子 */}
      <span className='absolute h-[300px] border-l border-dashed border-primary/20' style={anchor(384, 294)} />
      {sources.map((source, i) => <button key={source} className='runtime-source-label absolute w-40 text-left' style={anchor(232, 94 + i * 128)} onClick={() => setDetail(source)}><strong className='text-lg'>{source}</strong><span className='mt-1 block t-l5'>{['客户订单行', '生产工单与批次', '质量放行记录', '仓库执行计划'][i]}</span><span className='t-l5 mt-1.5 block text-muted-foreground'>{q[i] === null ? '等待覆盖' : displayTime(product.facts[i]!.sourceTime) + ' · 已同步'}</span></button>)}
      {product.runtime.components.map((component, i) => <button key={component.name} className='absolute w-56 text-left' style={anchor(772, 104 + i * 168)} onClick={() => component.name === 'EMQX' ? setDetail('EMQX') : changeTab(component.name === 'UNS' ? 'uns' : 'flows')}><strong className='text-lg font-medium'>{component.name}</strong><span className='t-l5 mt-1.5 block'>{component.purpose}</span><span className='t-l5 mt-1.5 block text-muted-foreground'>{component.summary}</span></button>)}
      <button className='scene-object-label w-56 text-center' style={anchor(1150, 392)} onClick={() => setDetail('result')}><span className='object-hit' /><strong className='block text-lg'>履约哨兵</strong><span className='t-l5 mt-2 block text-muted-foreground'>{product.case.id}</span><span className={cn('t-l4 mt-3 block', gap > 0 ? 'text-risk' : 'text-primary')}>{product.case.phase === 'closed' ? '已完成复核' : product.case.phase === 'recheck' ? '等待重新核对' : product.case.phase === 'execution' ? '等待仓库执行' : q[2] === null ? '等待质量数据' : '履约风险'}</span></button>
    </SpatialScene>
    {selected && <section aria-label='Transformation Trace' className='transformation-trace'><div className='flex items-center justify-between'><h2 className='text-sm font-semibold'>{selected.source === 'SENTINEL' ? '哨兵判定记录' : selected.source + ' 转换轨迹'}</h2><button className='text-xs text-primary' onClick={() => setTrace(null)}>收起轨迹</button></div>{selected.source === 'SENTINEL' ? <p className='mt-3 text-sm'>{selected.text} · {product.workflow.externalObligation}</p> : <><p className='t-meta mt-2 text-muted-foreground'>{selected.eventId ? '事件 ID · ' + selected.eventId : product.workflow.actionMode === 'runtime' ? '当前接口未提供原始事件 ID · 使用下方来源时间与业务引用定位观察' : '演示事件 · ' + selected.id}</p><p className='t-l5 mt-1'>{selected.businessRef} · 来源时间 {selected.sourceTime ?? selected.time}</p><div className='mt-3 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-6'><section><b className='text-sm'>原始字段映射</b>{eventFields(selected.source, selected, product).slice(1, 3).map(field => <p key={field.raw} className='mt-2 text-[11px]'><span className='text-muted-foreground'>{field.raw}</span><span className='ml-3'>{String(field.value)}</span></p>)}</section><ArrowRight className='size-4 text-primary/40' /><section><b className='text-sm'>Node-RED → canonical</b>{eventFields(selected.source, selected, product).slice(1, 3).map(field => <p key={field.raw} className='mt-2 text-[11px] text-primary'>{field.canonical} <span className='ml-2'>{field.value}</span></p>)}</section><ArrowRight className='size-4 text-primary/40' /><section><b className='text-sm'>UNS 业务对象</b><p className='mt-3 text-sm text-primary'>{selected.topic.replace('/supos/', '')}</p><p className='mt-2 text-xs text-muted-foreground'>{selected.before !== undefined ? selected.before + ' → ' + selected.value + ' 件' : selected.businessRef}</p></section></div></>}</section>}
    <section className='event-rail' aria-label='事件轨道'><div className='w-[260px] shrink-0 pr-5'><span className='text-xs text-primary'>{playback ? product.workflow.actionMode === 'runtime' ? 'canonical 事实路径回放' : '演示事件路径回放' : wantStage ? '运行证据 · canonical 已观测' : current.pending ? '新来源事件待交付' : '案例事件重放'}</span><button className='mt-2 block text-left' onClick={() => setTrace(current.id)}><b className='text-sm'>{current.text}</b><small className='mt-1 block text-muted-foreground'>{current.time} · {current.source}</small></button></div><div className='flex min-w-0 flex-1 gap-6 overflow-x-auto'>{events.filter(e => e !== current).map((e, i) => <button key={`${i}-${e.id}`} className='rail-history shrink-0 text-left' onClick={() => setTrace(e.id)}><span className='mb-2 block size-1.5 rounded-full bg-primary/30' /><small className='text-[10px] text-muted-foreground'>{e.time} · {e.source}</small><span className='mt-1 block text-xs'>{e.text}</span></button>)}</div><Button className='ml-5 shrink-0 rounded-full' onClick={play} disabled={!!playback}><Play className='size-3.5' />{playback ? '回放中' : '回放下一条'}</Button></section>
    {product.case.phase === 'recheck' && <div className='mt-3 flex justify-end'><Button variant='ghost' onClick={() => navigate('/')}>新来源已到达，返回工作台重新核对<ArrowRight /></Button></div>}
    {detail && <Detail title={detail === 'result' ? '当前履约结果' : detail + ' 运行详情'} description={product.case.id + (product.workflow.actionMode === 'runtime' ? ' · 真实 Runtime 观测' : ' · 案例事件重放')} close={() => setDetail(null)}>{detail === 'result' ? <><p>{product.workflow.status}</p><p>{product.workflow.reason}</p><p>{product.workflow.externalObligation}</p></> : detail === 'EMQX' ? <><p>接收工业来源 MQTT 事件，业务事实与来源进度独立进入处理路径。</p>{product.runtime.flows.filter(f => f.kind === '业务事实').map(f => <p key={f.source} className='text-xs'>{f.source} · {f.input}</p>)}</> : <><p>{product.facts.find(f => f.source === detail)!.instance}</p><p>来源时间 {displayTime(product.facts.find(f => f.source === detail)!.sourceTime)}</p><p>覆盖进度 {displayTime(product.facts.find(f => f.source === detail)!.progressTime)}</p><p className='break-all font-mono text-xs'>{product.facts.find(f => f.source === detail)!.topic}</p></>}<p className='text-xs text-muted-foreground'>当前为案例重放，不代表工厂实时遥测。</p></Detail>}
  </>;
}
function UnsModels({ product, focusedModel }: { product: FulfillmentProductView; focusedModel: string | null }) {
  const { review } = useProduct();
  const [structure, setStructure] = useState(false); const [selected, setSelected] = useState<string | null>(focusedModel);
  // UI-R10.1：收紧语义网络。OrderLine 是 root object，主链纵向下行；
  // ShipmentLine 通过 sourceOrderLineRef 回指，但走「右侧贴身折线」而不是外围大回路，
  // 避免巨大回路线抢走视觉。五个对象整体放大并向中心聚拢，减少空白。
  // 实测（scene 656px，canvas top=229）：3D 体块中心相较 anchor 上移约 46px、投影高约 110px，
  // 故标签须落在 anchor 下方 +135px 才真正脱离实体；同时行距 165px 保证与下一行不重叠。
  const coords = [[300, 74], [560, 258], [300, 442], [962, 442], [962, 74]];
  const nodes = product.uns.map((m, i): SpatialNode => ({ id: m.name, kind: (['order', 'factory', 'model', 'quality', 'warehouse'] as const)[i]!, x: coords[i]![0]!, y: coords[i]![1]!, scale: [1.15, 1, 1.25, 1.25, 1.2][i]!, risk: i === 4 && product.case.quantities[3] > (product.case.quantities[2] ?? Infinity) }));
  const item = product.uns.find(m => m.name === selected); const historical = product.events.find(e => e.source === 'WMS' && e.before !== undefined && !e.pending);
  // 标签落点：anchor(y) 之上再压 46px（体块中心偏移），使文字出现在实体下缘之外。
  // 0=OrderLine(左1) 1=ProductionOrder(左2) 2=ProductionLot(左3) 3=QualityLot(右2) 4=ShipmentLine(右1)
  const labelY = [182, 366, 550, 550, 182];
  return <><div className='flex items-center justify-between'><p className='t-l4 text-muted-foreground'>{product.case.id} · 当前订单关联 <b className='text-primary'>5 个业务对象 · 1 条履约语义链</b></p><div className='flex gap-2'>{[false, true].map(value => <Button key={String(value)} variant={structure === value ? 'secondary' : 'ghost'} className='rounded-full t-l5' onClick={() => setStructure(value)}>{value ? '模型结构' : '当前实例'}</Button>)}</div></div><SpatialScene nodes={nodes} links={[{ emphasis: true, from: 'OrderLine', to: 'ProductionOrder' }, { emphasis: true, from: 'ProductionOrder', to: 'ProductionLot' }, { emphasis: true, from: 'ProductionLot', to: 'QualityLot' }, { from: 'ShipmentLine', to: 'OrderLine', via: [{ x: 1010, y: 18 }, { x: 370, y: 18 }] }]} className='semantic-scene'>
    <div className='scene-baseplane' />
    <span className='t-l4 absolute -translate-x-1/2 tracking-[.2em] text-primary' style={anchor(582, 10)}>UNS · 业务语义网络</span>
    {/* 标签统一落在 2.5D 体块下缘之外（y + 132），不再压住实体 */}
    { nodes.map((node, i) => <button key={node.id} className={cn('scene-object-label scene-uns-label w-64 text-center', i === 0 && 'scene-uns-root')} style={anchor(node.x, labelY[i]!)} onClick={() => setSelected(node.id)}><span className='object-hit' />{i === 0 && <span className='t-l5 mb-1 block font-semibold text-primary'>根对象 · root</span>}<span className='flex items-baseline justify-center gap-2'><strong className='t-l3'>{node.id}</strong>{!structure && <span className={cn('text-[1.75rem] leading-none tabular-nums', node.risk && 'text-risk')}>{product.uns[i]!.quantity ?? '等待'}<small className='ml-1 t-l5 text-muted-foreground'>件 · {product.uns[i]!.source}</small></span>}</span>{!structure && <><span className='t-l5 mt-0.5 block text-muted-foreground'>{node.id === 'ProductionLot' && product.uns[i]!.instance.includes(':') ? product.uns[i]!.instance.split(':').at(-1) : node.id === 'QualityLot' && product.uns[i]!.instance.startsWith('QMS:') ? product.uns[i]!.instance.split(':')[1] : product.uns[i]!.instance.replace(/^(ERP|MES|QMS|WMS):/, '')}</span>{i === 4 && historical && <span className='plate-tag mt-1.5 inline-flex'>仓库执行 <span className='text-muted-foreground'>{historical.before}</span><ArrowRight className='size-3' /><b>{historical.value} 件</b></span>}</>}{structure && <p className='t-l5 mt-2 text-muted-foreground'>{product.uns[i]!.label} · {product.uns[i]!.source}</p>}</button>)}
    {/* 关系名标在节点之间的空白带，避开实体与标签 */}
    <span className='plate-tag absolute -translate-x-1/2' style={anchor(420, 132)}>orderLineRef</span>
    <span className='plate-tag absolute -translate-x-1/2' style={anchor(440, 308)}>productionLotRef</span>
    <span className='plate-tag absolute -translate-x-1/2' style={anchor(680, 425)}>productionLotRef</span>
    <span className='t-l4 absolute -translate-x-1/2 text-center text-muted-foreground' style={anchor(972, 294)}>同一订单行<br />比较质量放行与仓库执行</span>
    <span className='plate-tag absolute -translate-x-1/2' style={anchor(670, 22)}>sourceOrderLineRef 回指 → OrderLine</span>
    {/* UI-R10.1-FIX2：删除 1/2/3/4 编号列表 —— 页面声称 5 个模型却只编号 4 个是自相矛盾的表述。
        不替换成新 legend，让 5 个 semantic object 与真实 relation label 直接承担表达。 */}
  </SpatialScene>{review && <p className='t-l5 mt-1 text-primary'>履约哨兵消费统一业务语义，不直接依赖各来源系统的原始字段结构。</p>}{item && <Detail title={item.name} description={item.label} close={() => setSelected(null)}><section><h3 className='t-l5 text-muted-foreground'>当前实例</h3><p>{item.instance}</p></section><section><h3 className='t-l5 text-muted-foreground'>来源与当前值</h3><p>{item.source} · {item.quantity ?? '等待覆盖'} 件</p></section><section><h3 className='t-l5 text-muted-foreground'>关联关系</h3><p className='t-meta break-all'>{item.name === 'ShipmentLine' ? 'sourceOrderLineRef → ' + product.uns[0]!.instance : item.name === 'QualityLot' ? 'productionLotRef → ' + product.uns[2]!.instance : item.name === 'ProductionOrder' ? 'orderLineRef → ' + product.uns[0]!.instance : item.relation}</p></section><section><h3 className='t-l4 mb-3'>来源字段 → 标准字段</h3>{item.mapping.map(field => <p key={field.raw} className='flex gap-3 py-2 t-l5'><span className='flex-1 text-muted-foreground'>{field.raw}</span><ArrowRight className='size-3.5' /><span className='flex-1'>{field.canonical}</span></p>)}</section><section><h3 className='t-l5 text-muted-foreground'>更新时间</h3><p>{displayTime(item.updated)}</p></section><p className='t-meta break-all'>{item.topic}</p></Detail>}</>;
}
function SourceFlows({ product, frozen }: { product: FulfillmentProductView; frozen: number | null }) {
  const [source, setSource] = useState<Source>('WMS'); const [progress, setProgress] = useState(false); const [stage, setStage] = useState<number | null>(frozen);
  const event = product.events.filter(e => e.source === source && e.value === product.facts.find(fact => fact.source === source)!.quantity).at(-1);
  const fields = eventFields(source, event ?? { id: 'waiting', source, value: 0, time: '', text: '', topic: '', businessRef: '', stages: [] }, product, progress);
  // UI-R10.1：五段流程逻辑不变，但视觉权重重分配 ——
  //   3D stage icon 降权（scale 从 1.1 降到 .5，只作"过程节点"提示）；
  //   真实字段 transformation 升权（.fmap-* 族：RAW 侧小灰、canonical 侧大字绿色）。
  // 评委第一眼必须看到 execution_committed_qty → executionCommittedQty。
  const names = ['RAW 原始事件', 'PARSE 字段识别', 'NORMALIZE 规范化', 'RELATION 语义关联', 'CANONICAL / UNS'];
  const coords = [152, 402, 652, 902, 1156];
  const nodes = coords.map((x, i): SpatialNode => ({ id: String(i), kind: i === 4 ? 'model' : i === 0 ? { ERP: 'order', MES: 'factory', QMS: 'quality', WMS: 'warehouse' }[source] as SpatialNode['kind'] : 'stage', x, y: 122, scale: i === 4 ? 1.05 : .75, waiting: !event && !progress }));
  const links = [{ from: '0', to: '1', stopped: !event && !progress }, { from: '1', to: '2' }, { from: '2', to: '3' }, { from: '3', to: '4', emphasis: true }];
  return <div><div className='flex items-center justify-between'><div role='group' aria-label='来源选择' className='flex gap-2'>{sources.map(s => <Button key={s} variant={source === s ? 'secondary' : 'ghost'} className='rounded-full t-l5' onClick={() => { setSource(s); setStage(null); }}>{s}</Button>)}</div><div className='flex gap-2'>{[false, true].map(value => <Button key={String(value)} variant={progress === value ? 'secondary' : 'ghost'} className='rounded-full t-l5' onClick={() => setProgress(value)}>{value ? '来源进度' : '业务事实'}</Button>)}</div></div><SpatialScene nodes={nodes} links={links} className='flow-scene'>
    <div className='scene-baseplane' />
    <p className='t-l4 absolute -translate-x-1/2 tracking-[.2em] text-primary' style={anchor(660, 14)}>{source} · 已保存 Flow 映射与 canonical 观察</p>
    {coords.map((x, i) => <button key={i} className='scene-object-label scene-flow-stage w-[224px] text-left' style={anchor(x, 180)} onClick={() => setStage(i)}><span className='object-hit' /><h2 className={cn('t-l5 font-semibold', i === 4 ? 'text-primary' : 'text-muted-foreground')}>{names[i]}</h2>{!event && !progress ? <p className='t-l4 mt-4 text-muted-foreground'>等待来源覆盖判断时间</p> : i === 4 ? <><p className='fmap-canonical mt-3 break-all'>{progress ? 'J2_SourceProgress' : mappings[source].topic.replace('/supos/', '')}</p><p className='t-l5 mt-2 text-muted-foreground'>{progress ? '来源时间边界' : '统一业务事实与关系引用'}</p><p className='t-l2 mt-2 text-primary tabular-nums'>{progress ? displayTime(product.facts.find(f => f.source === source)!.progressTime) : event!.value + ' 件'}</p></> : fields.slice(0, 4).map(f => <div key={f.raw} className='mt-3'>{i === 0 ? <><span className='fmap-raw block break-all'>{f.raw}</span><span className='t-l5 mt-1 block break-all'>{f.value}</span></> : i === 1 ? <span className='fmap-raw block break-all'>{f.raw}<span className='t-l5 mt-1 block text-primary'>{typeof f.value === 'number' ? '数量 · number' : '引用／时间 · string'}</span></span> : <><span className='fmap-raw block break-all'>{f.raw}</span><span className='fmap-arrow' /><span className={cn('block break-all', i === 4 ? 'fmap-canonical' : i === 3 ? 'fmap-canonical' : 'fmap-mid')}>{f.canonical}</span></>}{i === 2 && <span className='t-l5 mt-1 block break-all text-foreground'>{f.value}</span>}</div>)}</button>)}
  </SpatialScene><div className='flex items-center gap-3 t-l5 text-muted-foreground'><Check className='size-3.5 text-primary' />8 条既有路径 · 四条业务事实＋四条来源进度<span className='ml-auto'>映射来自 Flow · 值来自 canonical 观察</span></div>{stage !== null && <Detail title={source + ' · ' + names[stage]} description={progress ? '来源进度路径' : '业务事实路径'} close={() => setStage(null)}><p>{!event && !progress ? '等待质量来源更新，后续规范化暂不推进。' : progress ? '独立来源进度控制判断时间边界。' : event!.text}</p><p className='t-meta break-all'>{progress ? '/source/j2/progress/' + source.toLowerCase() : mappings[source].input}</p>{(event || progress) && fields.map(f => <section key={f.raw}><p className='t-l5 text-muted-foreground'>{f.raw} → {f.canonical}</p><p className='t-l4 break-all'>{f.value}</p></section>)}<p className='t-meta break-all'>{progress ? '/supos/J2_SourceProgress' : mappings[source].topic}</p>{(event || progress) && <details><summary className='t-l4 text-primary'>查看展示字段 JSON</summary><pre className='mt-3 overflow-auto t-l5'>{JSON.stringify(Object.fromEntries(fields.map(f => [stage < 2 ? f.raw : f.canonical, f.value])), null, 2)}</pre></details>}</Detail>}</div>;
}
export function RuntimePage() {
  const { views, view, review } = useProduct(); const [params, setParams] = useSearchParams();
  const product = views.find(v => v.case.id === params.get('case')) ?? view;
  const tab = ['data', 'uns', 'flows'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'data';
  function changeTab(value: string, model?: string) { setParams({ case: product.case.id, tab: value, ...(model ? { model } : {}) }); }
  const last = product.events.at(-1);
  return <ProductShell page='runtime'><main className='desktop-space pt-5'><div className='flex items-end justify-between'><h1 className='t-l2'>open supOS 运行</h1><span className='t-l5 text-primary'>{product.case.id} · 案例事件重放</span></div>{review && tab !== 'flows' && <p className='t-l5 mt-2 text-primary'>{tab === 'data' ? '4 个工业来源通过 open supOS 形成统一履约事实。' : '5 个业务对象把 ERP、MES、QMS、WMS 关联为同一条履约语义链。'}</p>}<Tabs value={tab} onValueChange={changeTab} className='mt-3'><TabsList aria-label='平台运行视图' className='runtime-tabs'><TabsTrigger value='data'><Radio className='mr-2 inline size-3.5' />数据流</TabsTrigger><TabsTrigger value='uns'><Database className='mr-2 inline size-3.5' />UNS 模型</TabsTrigger><TabsTrigger value='flows'><Workflow className='mr-2 inline size-3.5' />Source Flow</TabsTrigger></TabsList><TabsContent value='data' className='mt-3'><DataFlow key={product.case.id} product={product} pending={params.has('pending')} changeTab={changeTab} /></TabsContent><TabsContent value='uns' className='mt-3'><UnsModels key={product.case.id + params.get('model')} product={product} focusedModel={params.get('model')} /></TabsContent><TabsContent value='flows' className='mt-3'><SourceFlows product={product} frozen={params.get('stage') !== null ? Math.max(0, Number(params.get('stage'))) : null} /></TabsContent></Tabs>
    {/* 静态截图也必须能看出「当前在哪个阶段」——不依赖动画 */}
    {last && tab === 'data' && <p className='t-l5 mt-3 text-muted-foreground'>已观察到 canonical 结果，画布表示已配置处理路径；移动点为事实回放，不代表逐跳实时遥测。</p>}
  </main></ProductShell>;
}
