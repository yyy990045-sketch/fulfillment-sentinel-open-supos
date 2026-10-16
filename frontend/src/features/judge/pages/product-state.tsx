import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appPath } from '../../../lib/app-path.js';
import type { ProductView as RuntimeProductView } from '../../../../../src/integrations/open-supos/product-view.js';
import { advanceDemo, deliverWarehouseEvent, DEMO_DATA, fromRuntime, type FulfillmentProductView } from './product-view.js';
type ProductState = { review: boolean; setReview: (value: boolean) => void; reviewStep: number; setReviewStep: (value: number) => void; views: FulfillmentProductView[]; view: FulfillmentProductView; selectOrder: (id: string) => void; advance: (id: string) => Promise<boolean>; addNote: (id: string, text: string) => void; deliver: (id: string, eventId: string, finished: boolean) => void; loading: boolean; backendError: boolean; actionBusy: boolean; actionError: string; refresh: () => void };
const Context = createContext<ProductState>(null!);
export function ProductProvider({ children }: { children: ReactNode }) {
  const [review, setReview] = useState(false);
  const [reviewStep, setReviewStep] = useState(0);
  const live = useQuery({ queryKey: ['runtime-product-view'], queryFn: async () => { const res = await fetch(appPath('/api/v2/demo/fulfillment/product-view')); if (!res.ok) throw new Error('runtime_read_failed'); return await res.json() as RuntimeProductView; }, refetchInterval: 2000, retry: false });
  const [selected, selectOrder] = useState('SO-IND-001');
  const [overrides, setOverrides] = useState<Record<string, FulfillmentProductView>>({});
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [actionBusy, setBusy] = useState(false); const [actionError, setError] = useState('');
  const [replayId, setReplayId] = useState<string>();
  const primary = live.data ? fromRuntime(live.data) : null;
  const bases = DEMO_DATA.map((view, i) => i === 0 && primary ? { ...primary, pendingEventId: replayId } : view);
  const views = bases.map(base => { const current = base.case.id === 'SO-IND-001' ? base : overrides[base.case.id] ?? base; return { ...current, case: { ...current.case, notes: notes[base.case.id] ?? current.case.notes } }; });
  const view = views.find(item => item.case.id === selected)!;
  async function advance(id: string) {
    if (id !== 'SO-IND-001') { setOverrides(items => { const base = bases.find(item => item.case.id === id)!; return { ...items, [id]: advanceDemo(items[id] ?? base) }; }); return true; }
    if (!primary || actionBusy) return false;
    setBusy(true); setError('');
    try {
      const action = primary.case.phase === 'decision' ? 'confirm-disposition' : primary.case.phase === 'execution' ? 'simulate-wms-execution' : null;
      if (action) {
        const response = await fetch(appPath('/api/v2/demo/fulfillment/' + action), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        const result = await response.json() as { ok: boolean; productView: RuntimeProductView };
        if (!response.ok || !result.ok) throw new Error('runtime_action_failed');
        if (action === 'simulate-wms-execution') { const event = result.productView.runtime.events.find(e => e.source === 'WMS' && !e.isSourceProgress && e.quantity === 96); if (!event) throw new Error('canonical_event_missing'); setReplayId(event.id); }
      }
      await live.refetch(); return true;
    } catch { setError('真实 Runtime 操作未成功，请检查来源连接后重试。'); return false; }
    finally { setBusy(false); }
  }
  function deliver(id: string, eventId: string, finished: boolean) { if (id === 'SO-IND-001') { if (finished && replayId === eventId) setReplayId(undefined); return; } setOverrides(items => ({ ...items, [id]: deliverWarehouseEvent(items[id] ?? bases.find(item => item.case.id === id)!, eventId, finished) })); }
  function addNote(id: string, text: string) { setNotes(items => ({ ...items, [id]: [...(items[id] ?? []), text] })); }
  return <Context value={{ review, setReview, reviewStep, setReviewStep, views, view, selectOrder, advance, addNote, deliver, loading: live.isPending, backendError: live.isError, actionBusy, actionError, refresh: () => { void live.refetch(); } }}>{children}</Context>;
}
export function useProduct() { return useContext(Context); }
