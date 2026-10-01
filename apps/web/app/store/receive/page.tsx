'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import type { FlagType, ReceiptRequest, StoreDelivery } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { messageOf } from '@/lib/api-error';
import { usePoll } from '@/lib/poll';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toast } from '@/components/ui/Toast';
import { HandoffTimeline, IssueList, PageTitle } from '@/components/store/parts';

type LineState = { receivedQty: number; issue: FlagType | null };

const ISSUES: { value: FlagType; label: string }[] = [
  { value: 'missing', label: 'Missing' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'wrong_quantity', label: 'Wrong qty' },
];

/** S4: the store checks each line, marks issues, and confirms receipt. The driver acknowledges after. */
export default function ReceivePage() {
  const { data, error, refresh } = usePoll(() => api<StoreDelivery[]>('/store/deliveries'));
  const [selectedId, setSelectedId] = useState<string>();

  const waiting = data?.filter((d) => d.status === 'arrived' || d.status === 'waiting') ?? [];
  const done = data?.filter((d) => d.storeConfirmedAt) ?? [];
  const selected =
    data?.find((d) => d.stopId === selectedId) ?? (waiting.length === 1 ? waiting[0] : undefined);

  if (!data) {
    return error ? (
      <EmptyState
        title="Could not load deliveries"
        description="Check the connection. Retrying every 5 seconds."
      />
    ) : (
      <p className="text-body text-muted">Loading…</p>
    );
  }

  if (selected && (selected.status === 'arrived' || selected.status === 'waiting')) {
    return <ReceiptForm key={selected.stopId} delivery={selected} onDone={refresh} />;
  }

  return (
    <section className="space-y-md">
      <PageTitle eyebrow="Receive" title="Check the goods" />
      {waiting.length === 0 ? (
        <EmptyState
          title="No driver at the store yet"
          description="When the driver taps “I’ve arrived”, the delivery opens here to check."
        />
      ) : (
        <ul className="space-y-sm">
          {waiting.map((d) => (
            <li key={d.stopId}>
              <button
                type="button"
                onClick={() => setSelectedId(d.stopId)}
                className="flex w-full items-center justify-between gap-sm rounded-card bg-surface p-lg text-left"
              >
                <span>
                  <span className="block text-title text-ink">{d.plate}</span>
                  <span className="block text-label text-muted">
                    {d.lines.length} lines to check
                  </span>
                </span>
                <span className="text-label font-semibold text-slate">Check ›</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {done.map((d) => (
        <div key={d.stopId} className="space-y-sm rounded-card bg-surface p-lg">
          <p className="text-title text-ink">{d.plate} · checked</p>
          <HandoffTimeline delivery={d} />
          <IssueList delivery={d} />
        </div>
      ))}
    </section>
  );
}

function ReceiptForm({
  delivery,
  onDone,
}: {
  delivery: StoreDelivery;
  onDone: () => Promise<void>;
}) {
  // Initialised once: the parent polls, and a new poll must not wipe what the manager has counted.
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(delivery.lines.map((l) => [l.id, { receivedQty: l.qty, issue: null }])),
  );
  const [cold, setCold] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string>();
  const clearToast = useCallback(() => setToast(undefined), []);

  const set = (id: string, patch: Partial<LineState>) =>
    setLines((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));

  const issues = Object.values(lines).filter((l) => l.issue).length;
  const needsCold = delivery.chilled && cold === null;

  async function submit() {
    setBusy(true);
    const body: ReceiptRequest = {
      lines: delivery.lines.map((l) => ({
        orderLineId: l.id,
        receivedQty: lines[l.id]?.receivedQty ?? l.qty,
        ...(lines[l.id]?.issue ? { issue: lines[l.id]!.issue! } : {}),
      })),
      ...(delivery.chilled ? { chilledWasCold: cold ?? undefined } : {}),
    };
    try {
      await api<StoreDelivery>(`/store/deliveries/${delivery.stopId}/receipt`, {
        method: 'POST',
        body,
      });
      await onDone();
    } catch (e) {
      setToast(messageOf(e));
      setBusy(false);
    }
  }

  return (
    <section className="space-y-md pb-lg">
      <div className="flex items-start justify-between gap-sm">
        <PageTitle eyebrow={`Receive · ${delivery.plate}`} title="Check the goods" />
        <Link href="/store" className="pt-sm text-label font-semibold text-slate">
          Later
        </Link>
      </div>
      <p className="text-body text-muted">
        Count each line. Mark anything missing, damaged or the wrong quantity. The driver
        acknowledges after you confirm.
      </p>

      <ul className="space-y-sm">
        {delivery.lines.map((line) => {
          const st = lines[line.id] ?? { receivedQty: line.qty, issue: null };
          return (
            <li
              key={line.id}
              className={`space-y-sm rounded-card bg-surface p-md ${st.issue ? 'ring-2 ring-danger' : ''}`}
            >
              <div className="flex items-start justify-between gap-sm">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-ink">{line.name}</p>
                  <p className="text-caption text-muted">
                    Ordered {line.qty} × {line.pack}
                    {line.chilled ? ' · chilled' : ''}
                  </p>
                </div>
                <div
                  className="flex shrink-0 items-center gap-xs"
                  aria-label={`Received ${line.name}`}
                >
                  <button
                    type="button"
                    aria-label="One fewer"
                    className="size-11 rounded-full border border-mist text-title text-ink"
                    onClick={() => {
                      const q = Math.max(0, st.receivedQty - 1);
                      set(line.id, {
                        receivedQty: q,
                        issue: q < line.qty ? (st.issue ?? 'missing') : st.issue,
                      });
                    }}
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-title text-ink">{st.receivedQty}</span>
                  <button
                    type="button"
                    aria-label="One more"
                    disabled={st.receivedQty >= line.qty}
                    className="size-11 rounded-full border border-mist text-title text-ink disabled:opacity-40"
                    onClick={() => {
                      const q = Math.min(line.qty, st.receivedQty + 1);
                      set(line.id, {
                        receivedQty: q,
                        issue: q === line.qty && st.issue === 'missing' ? null : st.issue,
                      });
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-xs">
                {ISSUES.map((i) => (
                  <button
                    key={i.value}
                    type="button"
                    aria-pressed={st.issue === i.value}
                    onClick={() => set(line.id, { issue: st.issue === i.value ? null : i.value })}
                    className={`min-h-[36px] rounded-pill px-md text-label ${
                      st.issue === i.value ? 'bg-danger text-white' : 'border border-mist text-ink'
                    }`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {delivery.chilled && (
        <fieldset className="space-y-sm rounded-card bg-chilled-tint p-md">
          <legend className="text-body font-semibold text-ink">
            Did the chilled goods arrive cold?
          </legend>
          <div className="flex gap-sm">
            {[
              { v: true, label: 'Yes, cold' },
              { v: false, label: 'No, warm' },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={cold === o.v}
                onClick={() => setCold(o.v)}
                className={`min-h-[44px] flex-1 rounded-pill text-label font-semibold ${
                  cold === o.v ? 'bg-primary text-on-primary' : 'bg-surface text-ink'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <Button className="w-full" disabled={busy || needsCold} onClick={submit}>
        {busy
          ? 'Confirming…'
          : issues
            ? `Confirm receipt · ${issues} issue${issues > 1 ? 's' : ''}`
            : 'Confirm receipt'}
      </Button>
      {needsCold && (
        <p className="text-center text-caption text-muted">
          Answer the chilled question to confirm.
        </p>
      )}
      {toast && <Toast message={toast} tone="danger" onClose={clearToast} />}
    </section>
  );
}
