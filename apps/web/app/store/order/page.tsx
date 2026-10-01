'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CatalogueItem,
  PlaceOrderRequest,
  StoreHome,
  StoreOrderView,
} from '@waypoint/contracts';
import { api } from '@/lib/api';
import { messageOf, reasonOf } from '@/lib/api-error';
import { formatMinutes } from '@/lib/clock';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toast } from '@/components/ui/Toast';
import { PageTitle, formatDate, formatDuration, useServerMinutes } from '@/components/store/parts';

/** S2: order for tomorrow from the catalogue. Refused from 16:00. */
export default function OrderPage() {
  const [home, setHome] = useState<StoreHome>();
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<StoreOrderView>();
  const [toast, setToast] = useState<{ message: string; tone: 'danger' | 'warning' }>();
  const [loadError, setLoadError] = useState<string>();
  const clearToast = useCallback(() => setToast(undefined), []);
  const nowMin = useServerMinutes(home?.nowMin);

  useEffect(() => {
    Promise.all([api<StoreHome>('/store/home'), api<CatalogueItem[]>('/store/catalogue')])
      .then(([h, c]) => {
        setHome(h);
        setCatalogue(c);
      })
      .catch((e) => setLoadError(messageOf(e)));
  }, []);

  if (loadError) return <EmptyState title="Could not load the catalogue" description={loadError} />;
  if (!home || !catalogue || nowMin === undefined)
    return <p className="text-body text-muted">Loading…</p>;

  const closed = nowMin >= home.cutoffMin;
  const picks = catalogue.filter((c) => (qty[c.id] ?? 0) > 0);
  const weight = picks.reduce((s, c) => s + c.unitWeightKg * qty[c.id]!, 0);
  const volume = picks.reduce((s, c) => s + c.unitVolumeM3 * qty[c.id]!, 0);
  const step = (id: string, d: number) =>
    setQty((p) => ({ ...p, [id]: Math.max(0, Math.min(500, (p[id] ?? 0) + d)) }));

  async function place() {
    setBusy(true);
    const body: PlaceOrderRequest = {
      lines: picks.map((c) => ({ catalogueId: c.id, qty: qty[c.id]! })),
    };
    try {
      setPlaced(await api<StoreOrderView>('/store/orders', { method: 'POST', body }));
      setQty({});
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
      <PageTitle eyebrow={`Order · ${home.brand}`} title="Order for tomorrow" />

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

      {placed && (
        <div role="status" className="rounded-card bg-success-tint p-lg">
          <p className="text-title text-ink">Order placed</p>
          <p className="text-body text-muted">
            For {formatDate(placed.deliveryDate)} · {placed.units} units · {placed.weightKg} kg
          </p>
        </div>
      )}

      <ul
        className={`space-y-sm ${closed ? 'pointer-events-none opacity-50' : ''}`}
        aria-disabled={closed}
      >
        {catalogue.map((c) => (
          <li key={c.id} className="flex items-center gap-sm rounded-card bg-surface p-md">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold text-ink">{c.name}</p>
              <p className="text-caption text-muted">
                {c.pack}
                {c.chilled ? ' · chilled' : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-xs">
              <button
                type="button"
                aria-label={`Fewer ${c.name}`}
                disabled={closed || !qty[c.id]}
                onClick={() => step(c.id, -1)}
                className="size-11 rounded-full border border-mist text-title text-ink disabled:opacity-40"
              >
                −
              </button>
              <span className="w-8 text-center text-title text-ink">{qty[c.id] ?? 0}</span>
              <button
                type="button"
                aria-label={`More ${c.name}`}
                disabled={closed}
                onClick={() => step(c.id, 1)}
                className="size-11 rounded-full bg-primary text-title text-on-primary disabled:opacity-40"
              >
                +
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-sm rounded-card bg-surface p-md">
        <p className="text-label text-muted">
          {picks.length} lines · {Math.round(weight * 10) / 10} kg ·{' '}
          {Math.round(volume * 1000) / 1000} m³
        </p>
        <Button className="w-full" disabled={closed || busy || picks.length === 0} onClick={place}>
          {busy ? 'Placing…' : 'Place order'}
        </Button>
      </div>
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={clearToast} />}
    </section>
  );
}
