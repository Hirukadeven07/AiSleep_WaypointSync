'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ORDER_GROUP,
  type Brand,
  type CatalogueItem,
  type ItemType,
  type PlaceOrderRequest,
  type StoreHome,
  type StoreOrderDetail,
  type StoreOrderView,
} from '@waypoint/contracts';
import { api } from '@/lib/api';
import { messageOf, reasonOf } from '@/lib/api-error';
import { formatMinutes } from '@/lib/clock';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Toast } from '@/components/ui/Toast';
import {
  PageTitle,
  SPLIT,
  SPLIT_COL,
  formatDate,
  formatDuration,
  useServerMinutes,
} from '@/components/store/parts';
import { QtyStepper } from '@/components/store/QtyStepper';
import { readLocal, requestStoreRefresh, writeLocal } from '@/components/store/settings';

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  chilled_food: 'Chilled food',
  fresh: 'Fresh',
  style: 'Style',
  tech: 'Tech',
};

/** How an order group reads to the manager. One order holds one group (ORDER_GROUP). */
const GROUP_LABEL: Record<Brand, string> = {
  Fresh: 'fresh and chilled food',
  Style: 'Style',
  Tech: 'Tech',
};

const MAX_QTY = 500;
const draftKey = (storeId: string) => `ws_store_draft_${storeId}`;

/**
 * The order being built, as it was left on this phone. Unknown items and bad counts are
 * dropped, and so is anything outside the first item's group: one order holds one group.
 */
function readDraft(storeId: string, catalogue: CatalogueItem[]): Record<string, number> {
  try {
    const raw = JSON.parse(readLocal(draftKey(storeId)) ?? '{}') as Record<string, unknown>;
    const draft: Record<string, number> = {};
    let group: Brand | undefined;
    for (const c of catalogue) {
      const n = raw[c.id];
      if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) continue;
      group ??= ORDER_GROUP[c.type];
      if (ORDER_GROUP[c.type] === group) draft[c.id] = Math.min(MAX_QTY, n);
    }
    return draft;
  } catch {
    return {};
  }
}

/** S2: order for tomorrow from the catalogue. Refused from 16:00. */
export default function OrderPage() {
  const [home, setHome] = useState<StoreHome>();
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>();
  const [saved, setSaved] = useState<string[]>([]);
  const [recent, setRecent] = useState<StoreOrderDetail[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [view, setView] = useState<'saved' | 'all'>('all');
  const [type, setType] = useState<ItemType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<StoreOrderView>();
  // The placed order whose "Cancel order" is waiting for a yes or no.
  const [confirmId, setConfirmId] = useState<string>();
  const [cancellingId, setCancellingId] = useState<string>();
  const [toast, setToast] = useState<{ message: string; tone: 'danger' | 'warning' | 'success' }>();
  const [loadError, setLoadError] = useState<string>();
  const clearToast = useCallback(() => setToast(undefined), []);
  const nowMin = useServerMinutes(home?.nowMin);

  useEffect(() => {
    Promise.all([
      api<StoreHome>('/store/home'),
      api<CatalogueItem[]>('/store/catalogue'),
      // The saved list and past orders are extras: ordering still works without them.
      api<string[]>('/store/saved').catch(() => []),
      api<StoreOrderDetail[]>('/store/orders/recent').catch(() => []),
    ])
      .then(([h, c, s, r]) => {
        setHome(h);
        setCatalogue(c);
        setSaved(s);
        setRecent(r);
        setQty(readDraft(h.storeId, c));
        if (s.some((id) => c.some((item) => item.id === id))) setView('saved');
      })
      .catch((e) => setLoadError(messageOf(e)));
  }, []);

  // Keep the order being built on this phone, so changing tabs does not empty it.
  const storeId = home?.storeId;
  useEffect(() => {
    if (!storeId || !catalogue) return;
    writeLocal(draftKey(storeId), Object.keys(qty).length ? JSON.stringify(qty) : null);
  }, [storeId, catalogue, qty]);

  if (loadError) return <EmptyState title="Could not load the catalogue" description={loadError} />;
  if (!home || !catalogue || nowMin === undefined)
    return <p className="text-body text-muted">Loading…</p>;

  const closed = nowMin >= home.cutoffMin;
  const picks = catalogue.filter((c) => (qty[c.id] ?? 0) > 0);
  const units = picks.reduce((s, c) => s + qty[c.id]!, 0);
  const weight = picks.reduce((s, c) => s + c.unitWeightKg * qty[c.id]!, 0);
  const volume = picks.reduce((s, c) => s + c.unitVolumeM3 * qty[c.id]!, 0);
  const setItemQty = (id: string, n: number) =>
    setQty((p) => {
      const { [id]: _old, ...rest } = p;
      return n > 0 ? { ...rest, [id]: n } : rest;
    });

  // The first item picked decides the order's group; the other groups lock until it is placed or cleared.
  const group = picks[0] ? ORDER_GROUP[picks[0].type] : null;
  const lockedType = (t: ItemType) => group !== null && ORDER_GROUP[t] !== group;

  const savedSet = new Set(saved);
  const savedCount = catalogue.filter((c) => savedSet.has(c.id)).length;
  const types = [...new Set(catalogue.map((c) => c.type))];
  const q = query.trim().toLowerCase();
  const matches = catalogue.filter(
    (c) =>
      (view === 'all' || savedSet.has(c.id)) &&
      (type === 'all' || c.type === type) &&
      (!q || `${c.name} ${c.pack} ${c.id}`.toLowerCase().includes(q)),
  );
  // What can still be added comes first; the locked groups follow, greyed out.
  const visible = [
    ...matches.filter((c) => !lockedType(c.type)),
    ...matches.filter((c) => lockedType(c.type)),
  ];

  // Orders already placed for a coming day, and the latest order as the source for "order again".
  const upcoming = recent.filter(
    (o) => o.deliveryDate > home.today && (o.status === 'waiting' || o.status === 'planned'),
  );
  const last = recent[0];
  // Lines of the last order that are still in the catalogue, kept to its first line's group.
  const againItems = (last?.lines ?? []).flatMap((l) => {
    const item = catalogue.find((c) => c.id === l.catalogueId);
    return item ? [{ item, qty: l.qty }] : [];
  });
  const againGroup = againItems[0] ? ORDER_GROUP[againItems[0].item.type] : null;
  const again = againItems.filter((l) => ORDER_GROUP[l.item.type] === againGroup);

  async function toggleSaved(item: CatalogueItem) {
    const was = saved;
    const on = !savedSet.has(item.id);
    setSaved(on ? [...was, item.id] : was.filter((id) => id !== item.id));
    try {
      setSaved(await api<string[]>(`/store/saved/${item.id}`, { method: on ? 'PUT' : 'DELETE' }));
    } catch (e) {
      setSaved(was);
      setToast({ message: messageOf(e), tone: 'danger' });
    }
  }

  function orderAgain() {
    if (group !== null && againGroup !== null && group !== againGroup) {
      setToast({
        message: `This order is ${GROUP_LABEL[group]}. Place or clear it before ordering ${GROUP_LABEL[againGroup]} again.`,
        tone: 'warning',
      });
      return;
    }
    setQty((p) => {
      const next = { ...p };
      for (const l of again) next[l.item.id] = Math.min(MAX_QTY, l.qty);
      return next;
    });
    setToast({
      message: `Added ${again.length} ${again.length === 1 ? 'line' : 'lines'} from your last order`,
      tone: 'success',
    });
  }

  /** Takes back an order that is still waiting. The server refuses one that is planned. */
  async function cancelOrder(o: StoreOrderDetail) {
    setCancellingId(o.id);
    try {
      await api(`/store/orders/${o.id}`, { method: 'DELETE' });
      setRecent((r) => r.filter((x) => x.id !== o.id));
      setPlaced((p) => (p?.id === o.id ? undefined : p));
      setToast({ message: `Order for ${formatDate(o.deliveryDate)} cancelled`, tone: 'success' });
      requestStoreRefresh();
    } catch (e) {
      setToast({ message: messageOf(e), tone: 'danger' });
      // It may have been planned or removed meanwhile; show it as it is now.
      setRecent(await api<StoreOrderDetail[]>('/store/orders/recent').catch(() => recent));
    } finally {
      setCancellingId(undefined);
      setConfirmId(undefined);
    }
  }

  async function place() {
    setBusy(true);
    const body: PlaceOrderRequest = {
      lines: picks.map((c) => ({ catalogueId: c.id, qty: qty[c.id]! })),
    };
    try {
      setPlaced(await api<StoreOrderView>('/store/orders', { method: 'POST', body }));
      setQty({});
      setRecent(await api<StoreOrderDetail[]>('/store/orders/recent').catch(() => recent));
      requestStoreRefresh();
    } catch (e) {
      setToast({
        message: messageOf(e),
        tone: reasonOf(e) === 'AFTER_CUTOFF' ? 'warning' : 'danger',
      });
      if (reasonOf(e) === 'AFTER_CUTOFF') setHome((h) => (h ? { ...h, nowMin: h.cutoffMin } : h));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-md pb-lg">
      <PageTitle eyebrow="Order" title="Order for tomorrow" />

      {closed ? (
        <div className="space-y-xs rounded-card bg-border p-lg">
          <p className="text-title text-ink">Ordering is closed</p>
          <p className="text-body text-muted">
            Orders for tomorrow close at {formatMinutes(home.cutoffMin)} so the plan can be built
            tonight. You can order again from midnight.
          </p>
        </div>
      ) : (
        <p
          className={`text-label ${home.cutoffMin - nowMin <= 60 ? 'font-semibold text-warning' : 'text-muted'}`}
        >
          Closes at {formatMinutes(home.cutoffMin)} · {formatDuration(home.cutoffMin - nowMin)} left
        </p>
      )}

      {/* Phone: one column in the `order-*` sequence. Desktop: the catalogue left, the order right. */}
      <div className={SPLIT}>
        <div
          className={`${SPLIT_COL} lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto`}
        >
          {placed && (
            <div role="status" className="order-1 rounded-card bg-success-tint p-lg">
              <p className="text-title text-ink">Order placed</p>
              <p className="text-body text-muted">
                For {formatDate(placed.deliveryDate)} · {placed.units} units · {placed.weightKg} kg
              </p>
            </div>
          )}

          {upcoming.map((o) => (
            <div key={o.id} className="order-2 space-y-sm rounded-card bg-surface p-md">
              <details>
                <summary className="cursor-pointer text-body font-semibold text-ink">
                  Already ordered for {formatDate(o.deliveryDate)} · {o.units} units
                </summary>
                <ul className="mt-sm space-y-xs">
                  {o.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-sm text-label text-muted">
                      <span className="min-w-0 truncate">
                        {l.name} · {l.pack}
                      </span>
                      <span className="shrink-0 font-semibold text-ink">× {l.qty}</span>
                    </li>
                  ))}
                </ul>
              </details>
              {o.status !== 'waiting' ? (
                <p className="text-caption text-muted">Planned. Ask dispatch to change it.</p>
              ) : confirmId === o.id ? (
                <div className="space-y-sm">
                  <p className="text-label text-ink">
                    Cancel this order of {o.units} {o.units === 1 ? 'unit' : 'units'} for{' '}
                    {formatDate(o.deliveryDate)}?
                    {closed ? ' Ordering is closed, so it cannot be placed again today.' : ''}
                  </p>
                  <div className="flex gap-sm">
                    <button
                      type="button"
                      disabled={cancellingId === o.id}
                      onClick={() => setConfirmId(undefined)}
                      className="min-h-[36px] flex-1 rounded-pill border border-mist px-md text-label font-semibold text-ink disabled:opacity-40"
                    >
                      Keep order
                    </button>
                    <button
                      type="button"
                      disabled={cancellingId === o.id}
                      onClick={() => cancelOrder(o)}
                      className="min-h-[36px] flex-1 rounded-pill bg-danger px-md text-label font-semibold text-white disabled:opacity-40"
                    >
                      {cancellingId === o.id ? 'Cancelling…' : 'Yes, cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(o.id)}
                  className="min-h-[36px] text-label font-semibold text-danger"
                >
                  Cancel order
                </button>
              )}
            </div>
          ))}

          <div className="order-5 space-y-sm rounded-card bg-surface p-md">
            <div className="flex items-center justify-between gap-sm">
              <p className="text-title text-ink">Your order</p>
              {picks.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQty({})}
                  className="min-h-[36px] text-label font-semibold text-slate"
                >
                  Clear all
                </button>
              )}
            </div>
            {picks.length === 0 ? (
              <p className="text-label text-muted">Nothing picked yet.</p>
            ) : (
              <ul className="space-y-xs">
                {picks.map((c) => (
                  <li key={c.id} className="flex items-center gap-sm">
                    <span className="min-w-0 flex-1 truncate text-body text-ink">{c.name}</span>
                    <span className="shrink-0 text-body font-semibold text-ink">× {qty[c.id]}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${c.name}`}
                      onClick={() => setItemQty(c.id, 0)}
                      className="flex size-9 shrink-0 items-center justify-center text-muted"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-label text-muted">
              {picks.length} {picks.length === 1 ? 'line' : 'lines'} · {units}{' '}
              {units === 1 ? 'unit' : 'units'} · {Math.round(weight * 10) / 10} kg ·{' '}
              {Math.round(volume * 1000) / 1000} m³
            </p>
            <Button
              className="w-full"
              disabled={closed || busy || picks.length === 0}
              onClick={place}
            >
              {busy ? 'Placing…' : upcoming.length > 0 ? 'Place another order' : 'Place order'}
            </Button>
            {upcoming.length > 0 && picks.length > 0 && !closed && (
              <p className="text-center text-caption text-muted">
                This is sent as a separate order, on top of what is already placed.
              </p>
            )}
          </div>
        </div>

        <div className={`${SPLIT_COL} lg:col-start-1 lg:row-start-1`}>
          <div className="order-3 space-y-sm">
            <div className="flex min-h-[44px] items-center gap-sm rounded-input border border-mist bg-surface px-md">
              <Icon name="search" size={18} className="shrink-0 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search items"
                aria-label="Search items"
                className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-xs">
              <Chip active={view === 'saved'} onClick={() => setView('saved')}>
                ★ Saved ({savedCount})
              </Chip>
              <Chip active={view === 'all'} onClick={() => setView('all')}>
                All items ({catalogue.length})
              </Chip>
              {types.length > 1 &&
                types.map((t) => (
                  <Chip
                    key={t}
                    active={type === t}
                    disabled={lockedType(t) && type !== t}
                    onClick={() => setType(type === t ? 'all' : t)}
                  >
                    {ITEM_TYPE_LABEL[t]}
                  </Chip>
                ))}
            </div>
            {group !== null && (
              <p className="text-label text-muted">
                This order is {GROUP_LABEL[group]}. Place or clear it to order from another
                category.
              </p>
            )}
            {!closed && again.length > 0 && (
              <button
                type="button"
                onClick={orderAgain}
                className="min-h-[44px] w-full rounded-pill border border-mist px-md text-label font-semibold text-ink"
              >
                Order again · {again.length} {again.length === 1 ? 'line' : 'lines'} from{' '}
                {formatDate(last!.deliveryDate)}
              </button>
            )}
          </div>

          <div className="order-4 space-y-md">
            {visible.length === 0 &&
              (view === 'saved' && savedCount === 0 ? (
                <EmptyState
                  title="No saved items yet"
                  description="Tap the star on an item to keep it here for next time."
                  action={
                    <button
                      type="button"
                      onClick={() => setView('all')}
                      className="text-label font-semibold text-slate"
                    >
                      Show all items
                    </button>
                  }
                />
              ) : (
                <EmptyState title="No items match" description="Try another word or filter." />
              ))}

            <ul
              className={`space-y-sm 2xl:grid 2xl:grid-cols-2 2xl:gap-sm 2xl:space-y-0 ${closed ? 'pointer-events-none opacity-50' : ''}`}
              aria-disabled={closed}
            >
              {visible.map((c) => {
                const starred = savedSet.has(c.id);
                const locked = lockedType(c.type);
                return (
                  <li key={c.id} className="flex items-center gap-xs rounded-card bg-surface p-md">
                    <button
                      type="button"
                      aria-label={starred ? `Remove ${c.name} from saved` : `Save ${c.name}`}
                      aria-pressed={starred}
                      onClick={() => toggleSaved(c)}
                      className={`-ml-sm flex size-11 shrink-0 items-center justify-center text-title ${starred ? 'text-warning' : 'text-mist'}`}
                    >
                      {starred ? '★' : '☆'}
                    </button>
                    <div className={`min-w-0 flex-1 ${locked ? 'opacity-50' : ''}`}>
                      <p className="break-words text-body font-semibold text-ink">{c.name}</p>
                      <p className="text-caption text-muted">
                        {ITEM_TYPE_LABEL[c.type]} · {c.pack}
                        {c.chilled ? ' · chilled' : ''}
                      </p>
                    </div>
                    <QtyStepper
                      name={c.name}
                      value={qty[c.id] ?? 0}
                      max={MAX_QTY}
                      disabled={closed || locked}
                      onChange={(n) => setItemQty(c.id, n)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={clearToast} />}
    </section>
  );
}

function Chip({
  active,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[36px] rounded-pill px-md text-label disabled:opacity-40 ${
        active ? 'bg-primary text-on-primary' : 'border border-mist text-ink'
      }`}
    >
      {children}
    </button>
  );
}
