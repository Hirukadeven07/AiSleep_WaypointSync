'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { FlagType, ReceiptRequest, StoreDelivery } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { messageOf } from '@/lib/api-error';
import { usePoll } from '@/lib/poll';
import { useOnStoreRefresh } from '@/components/store/settings';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toast } from '@/components/ui/Toast';
import { HandoffTimeline, IssueList, PageTitle, SPLIT } from '@/components/store/parts';
import { QtyStepper } from '@/components/store/QtyStepper';

type IssueCounts = Record<FlagType, number>;

const ISSUES: { value: FlagType; label: string }[] = [
  { value: 'missing', label: 'Missing' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'wrong_quantity', label: 'Wrong qty' },
];

const emptyCounts = (): IssueCounts => ({ missing: 0, damaged: 0, wrong_quantity: 0 });

const flaggedUnits = (counts: IssueCounts) =>
  counts.missing + counts.damaged + counts.wrong_quantity;

/** S4: the store checks each line, marks issues, and confirms receipt. The driver acknowledges after. */
export default function ReceivePage() {
  const { data, error, refresh } = usePoll(() => api<StoreDelivery[]>('/store/deliveries'));
  useOnStoreRefresh(refresh);
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
    <section className="space-y-md lg:max-w-[720px]">
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
          {d.signedAt && <p className="text-caption text-muted">Signed by storekeeper</p>}
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
  const [lines, setLines] = useState<Record<string, IssueCounts>>(() =>
    Object.fromEntries(delivery.lines.map((l) => [l.id, emptyCounts()])),
  );
  const [cold, setCold] = useState<boolean | null>(null);
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string>();
  const clearToast = useCallback(() => setToast(undefined), []);

  const setCount = (id: string, kind: FlagType, qty: number, ordered: number) =>
    setLines((prev) => {
      const current = prev[id] ?? emptyCounts();
      const others = flaggedUnits(current) - current[kind];
      const next = Math.max(0, Math.min(qty, ordered - others));
      return { ...prev, [id]: { ...current, [kind]: next } };
    });

  const issues = Object.values(lines).reduce(
    (sum, counts) => sum + ISSUES.filter((i) => counts[i.value] > 0).length,
    0,
  );
  const needsCold = delivery.chilled && cold === null;

  async function submit() {
    setBusy(true);
    const body: ReceiptRequest = {
      lines: delivery.lines.map((l) => {
        const counts = lines[l.id] ?? emptyCounts();
        const problems = ISSUES.filter((i) => counts[i.value] > 0).map((i) => ({
          type: i.value,
          qty: counts[i.value],
        }));
        return {
          orderLineId: l.id,
          receivedQty: l.qty - flaggedUnits(counts),
          ...(problems.length > 0 ? { issues: problems } : {}),
        };
      }),
      ...(delivery.chilled ? { chilledWasCold: cold ?? undefined } : {}),
      signaturePng: signaturePng ?? undefined,
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
        The number on each line is what was ordered, and it stays put. The counts underneath start
        at zero: add what is missing, damaged, or the wrong quantity. One line can have more than
        one of those. The driver acknowledges after you confirm.
      </p>

      {/* Desktop: the lines left; the chilled question, signature and confirm in a panel right. */}
      <div className={SPLIT}>
        <ul className="space-y-sm">
          {delivery.lines.map((line) => {
            const counts = lines[line.id] ?? emptyCounts();
            const flagged = flaggedUnits(counts);
            const good = line.qty - flagged;
            return (
              <li
                key={line.id}
                className={`space-y-sm rounded-card bg-surface p-md ${flagged > 0 ? 'ring-2 ring-danger' : ''}`}
              >
                <div className="flex items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-ink">{line.name}</p>
                    <p className="text-caption text-muted">
                      {line.qty} × {line.pack}
                      {line.chilled ? ' · chilled' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-caption text-muted">Ordered</p>
                    <p
                      className="text-title font-semibold tabular-nums text-ink"
                      aria-label={`Ordered ${line.qty} ${line.name}`}
                    >
                      {line.qty}
                    </p>
                  </div>
                </div>
                <ul className="space-y-xs">
                  {ISSUES.map((i) => (
                    <li key={i.value} className="flex items-center justify-between gap-sm">
                      <span
                        className={`text-label font-semibold ${
                          counts[i.value] > 0 ? 'text-danger' : 'text-ink'
                        }`}
                      >
                        {i.label}
                      </span>
                      <QtyStepper
                        name={`${i.label} ${line.name}`}
                        value={counts[i.value]}
                        max={line.qty - (flagged - counts[i.value])}
                        plusTone="outline"
                        onChange={(q) => setCount(line.id, i.value, q, line.qty)}
                      />
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-muted">
                  {good} of {line.qty} in good condition
                  {counts.missing > 0 ? ` · ${counts.missing} missing` : ''}
                  {counts.damaged > 0 ? ` · ${counts.damaged} damaged` : ''}
                  {counts.wrong_quantity > 0 ? ` · ${counts.wrong_quantity} wrong qty` : ''}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="space-y-md lg:sticky lg:top-8">
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

          <SignaturePad onChange={setSignaturePng} />

          <Button className="w-full" disabled={busy || needsCold || !signaturePng} onClick={submit}>
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
          {!signaturePng && !needsCold && (
            <p className="text-center text-caption text-muted">Sign above to confirm receipt.</p>
          )}
        </div>
      </div>
      {toast && <Toast message={toast} tone="danger" onClose={clearToast} />}
    </section>
  );
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }

  return (
    <div className="space-y-sm rounded-card bg-surface p-md">
      <div className="flex items-center justify-between">
        <p className="text-body font-semibold text-ink">Sign here</p>
        <button
          type="button"
          className="text-label font-semibold text-slate"
          onClick={() => {
            const c = ref.current;
            if (!c) return;
            c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
            onChange(null);
          }}
        >
          Clear
        </button>
      </div>
      <canvas
        ref={ref}
        width={600}
        height={160}
        aria-label="Storekeeper signature"
        className="h-40 w-full touch-none rounded-card border border-mist bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = ref.current?.getContext('2d');
          if (!ctx) return;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current?.getContext('2d');
          if (!ctx || !ref.current) return;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          onChange(ref.current.toDataURL('image/png'));
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
    </div>
  );
}
