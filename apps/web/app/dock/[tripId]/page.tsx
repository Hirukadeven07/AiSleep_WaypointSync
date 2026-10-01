'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FlagRequest, LoadSheet, LoadStop, OrderLine } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { messageOf, reasonOf } from '@/lib/api-error';
import { usePoll } from '@/lib/poll';
import { Button } from '@/components/ui/Button';
import { CapacityBar } from '@/components/ui/CapacityBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { StatusChip } from '@/components/ui/StatusChip';
import { Toast } from '@/components/ui/Toast';
import { FlagSheet } from '@/components/dock/FlagSheet';
import { JobNote } from '@/components/dock/JobNote';
import { LoadSummary } from '@/components/dock/LoadSummary';
import { PlanLockBanner } from '@/components/dock/PlanLockBanner';

const FLAG_LABEL = { missing: 'Missing', damaged: 'Damaged', wrong_quantity: 'Wrong qty' } as const;

/** Ticks live on the shared dock tablet so a refresh keeps progress. Keyed by plan version. */
function useTicks(tripId: string, planVersion: number | undefined) {
  const key = planVersion ? `dock:ticks:${tripId}:v${planVersion}` : null;
  const [ticks, setTicks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!key) return;
    try {
      setTicks(new Set(JSON.parse(window.localStorage.getItem(key) ?? '[]') as string[]));
    } catch {
      setTicks(new Set());
    }
  }, [key]);

  const toggle = useCallback(
    (lineId: string) => {
      setTicks((prev) => {
        const next = new Set(prev);
        if (next.has(lineId)) next.delete(lineId);
        else next.add(lineId);
        try {
          if (key) window.localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          /* storage blocked: ticks still work for this visit */
        }
        return next;
      });
    },
    [key],
  );

  return { ticks, toggle };
}

/** L3 to L5: LIFO checklist with flags, the plan-change lock and departure. */
export default function LoadChecklistPage({ params }: { params: { tripId: string } }) {
  const { tripId } = params;
  const { data, error, loading, refresh } = usePoll(() => api<LoadSheet>(`/loads/${tripId}`));
  const [sheet, setSheet] = useState<LoadSheet>();
  const [busy, setBusy] = useState(false);
  const [flagging, setFlagging] = useState<{ stopId: string; line: OrderLine }>();
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'warning' }>();
  const clearToast = useCallback(() => setToast(undefined), []);

  // A mutation response is newer than the last poll until the next poll lands.
  useEffect(() => setSheet(data), [data]);
  const { ticks, toggle } = useTicks(tripId, sheet?.planVersion);

  const run = useCallback(
    async (action: () => Promise<LoadSheet | void>, success?: string) => {
      setBusy(true);
      try {
        const next = await action();
        if (next) setSheet(next);
        if (success) setToast({ message: success, tone: 'success' });
      } catch (e) {
        const reason = reasonOf(e);
        setToast({ message: messageOf(e), tone: reason === 'PLAN_LOCKED' ? 'warning' : 'danger' });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const flaggedLines = useMemo(
    () => new Set(sheet?.loadOrder.flatMap((s) => s.flags.map((f) => f.orderLineId ?? '')) ?? []),
    [sheet],
  );
  const allLines = useMemo(() => sheet?.loadOrder.flatMap((s) => s.lines) ?? [], [sheet]);
  const doneCount = allLines.filter((l) => ticks.has(l.id) || flaggedLines.has(l.id)).length;

  if (!sheet) {
    if (loading) return <p className="text-body text-muted">Loading checklist…</p>;
    return (
      <EmptyState
        title="Trip not found"
        description={error ? messageOf(error) : undefined}
        action={
          <Link href="/dock" className="text-label font-semibold text-slate underline">
            Back to the queue
          </Link>
        }
      />
    );
  }

  if (sheet.session?.departedAt) return <LoadSummary sheet={sheet} />;

  const started = !!sheet.session?.startedAt;
  const locked = sheet.lock.locked;
  const added = new Set(sheet.lock.added);
  const allDone = allLines.length > 0 && doneCount === allLines.length;
  const addedNames = sheet.loadOrder.filter((s) => added.has(s.stopId)).map((s) => s.storeName);

  return (
    <section className="space-y-md pb-[96px]">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div className="min-w-0">
          <Link href="/dock" className="text-label font-semibold text-slate">
            ‹ Queue
          </Link>
          <h1 className="truncate text-heading font-semibold text-ink">
            {sheet.vehicle.plate ?? sheet.vehicle.id}
          </h1>
          <p className="text-label text-muted">
            {sheet.brand} · {sheet.district} · Trip {sheet.tripNumber} · plan v{sheet.planVersion}
          </p>
        </div>
        <StatusChip status={sheet.status} />
      </div>

      <JobNote job={sheet.job} />

      {locked && (
        <PlanLockBanner
          lock={sheet.lock}
          addedNames={addedNames}
          busy={busy}
          onAcknowledge={() =>
            run(
              () => api<LoadSheet>(`/loads/${tripId}/ack`, { method: 'POST' }),
              'New plan accepted. Keep loading.',
            )
          }
        />
      )}

      {!started ? (
        <div className="space-y-sm rounded-card bg-surface p-lg">
          <p className="text-title text-ink">Load in this order</p>
          <p className="text-body text-muted">
            The last stop goes in first, so the first delivery is at the doors. Start when you are
            at the truck.
          </p>
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => run(() => api<LoadSheet>(`/loads/${tripId}/start`, { method: 'POST' }))}
          >
            {busy ? 'Starting…' : 'Start loading'}
          </Button>
        </div>
      ) : (
        <div className="rounded-card bg-surface p-md">
          <CapacityBar
            label={`${doneCount} of ${allLines.length} lines loaded or flagged`}
            percent={allLines.length ? (doneCount / allLines.length) * 100 : 0}
          />
          {sheet.session && sheet.session.loaderNames.length > 0 && (
            <p className="mt-xs text-caption text-muted">
              Loading: {sheet.session.loaderNames.join(', ')}
            </p>
          )}
        </div>
      )}

      <ol
        className={`space-y-md ${locked || !started ? 'pointer-events-none opacity-50' : ''}`}
        aria-disabled={locked || !started}
      >
        {sheet.loadOrder.map((stop, i) => (
          <StopCard
            key={stop.stopId}
            stop={stop}
            loadIndex={i + 1}
            isNew={added.has(stop.stopId)}
            ticks={ticks}
            flagged={flaggedLines}
            onTick={toggle}
            onFlag={(line) => setFlagging({ stopId: stop.stopId, line })}
            onRemoveFlag={(flagId) =>
              run(
                () => api<LoadSheet>(`/loads/${tripId}/flags/${flagId}`, { method: 'DELETE' }),
                'Flag removed',
              )
            }
          />
        ))}
      </ol>

      {started && !locked && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-md backdrop-blur">
          <div className="mx-auto flex max-w-[1280px] items-center gap-md">
            <p className="hidden flex-1 text-label text-muted sm:block">
              {allDone
                ? 'Every line is loaded or flagged.'
                : 'Tick or flag every line to confirm departure.'}
            </p>
            <Button
              className="w-full sm:w-auto"
              disabled={!allDone || busy}
              onClick={() =>
                run(async () => {
                  await api(`/loads/${tripId}/depart`, {
                    method: 'POST',
                    body: { planVersion: sheet.planVersion },
                  });
                  return api<LoadSheet>(`/loads/${tripId}`);
                }, 'Departure confirmed')
              }
            >
              {busy ? 'Confirming…' : 'Confirm departure'}
            </Button>
          </div>
        </div>
      )}

      {flagging && (
        <FlagSheet
          stopId={flagging.stopId}
          line={flagging.line}
          busy={busy}
          onClose={() => setFlagging(undefined)}
          onSubmit={(flag: FlagRequest) =>
            run(async () => {
              const next = await api<LoadSheet>(`/loads/${tripId}/flags`, {
                method: 'POST',
                body: flag,
              });
              setFlagging(undefined);
              return next;
            }, 'Flag sent to dispatch')
          }
        />
      )}
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={clearToast} />}
    </section>
  );
}

function StopCard({
  stop,
  loadIndex,
  isNew,
  ticks,
  flagged,
  onTick,
  onFlag,
  onRemoveFlag,
}: {
  stop: LoadStop;
  loadIndex: number;
  isNew: boolean;
  ticks: Set<string>;
  flagged: Set<string>;
  onTick: (lineId: string) => void;
  onFlag: (line: OrderLine) => void;
  onRemoveFlag: (flagId: string) => void;
}) {
  return (
    <li className={`overflow-hidden rounded-card bg-surface ${isNew ? 'ring-2 ring-success' : ''}`}>
      <div className="flex items-center gap-md border-b border-border px-lg py-md">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-body font-bold text-on-primary">
          {loadIndex}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-title text-ink">{stop.storeName}</p>
          <p className="text-caption text-muted">
            Load {ordinal(loadIndex)} · delivered {ordinal(stop.sequence)}
          </p>
        </div>
        {isNew && (
          <span className="rounded-pill bg-success-tint px-chip py-xs text-caption font-semibold text-success">
            New
          </span>
        )}
        {stop.chilled && (
          <span className="rounded-pill bg-chilled-tint px-chip py-xs text-caption font-semibold text-chilled">
            Chilled
          </span>
        )}
      </div>

      <ul className="divide-y divide-border">
        {stop.lines.map((line) => {
          const flag = stop.flags.find((f) => f.orderLineId === line.id);
          const ticked = ticks.has(line.id);
          return (
            <li key={line.id} className="flex items-center gap-sm px-md py-sm">
              <button
                type="button"
                role="checkbox"
                aria-checked={ticked}
                aria-label={`Loaded ${line.name}`}
                disabled={!!flag}
                onClick={() => onTick(line.id)}
                className={`flex min-h-[52px] min-w-0 flex-1 items-center gap-md rounded-input px-sm text-left ${
                  ticked ? 'text-muted' : 'text-ink'
                }`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-tag border-2 ${
                    flag
                      ? 'border-danger bg-danger-tint text-danger'
                      : ticked
                        ? 'border-success bg-success text-white'
                        : 'border-mist'
                  }`}
                >
                  {flag ? (
                    <Icon name="alert" size={16} />
                  ) : ticked ? (
                    <Icon name="check" size={18} />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block truncate text-body font-semibold ${ticked ? 'line-through' : ''}`}
                  >
                    {line.name}
                  </span>
                  <span className="block text-caption text-muted">
                    {line.qty} × {line.pack}
                    {line.chilled ? ' · chilled' : ''}
                  </span>
                </span>
              </button>
              {flag ? (
                <button
                  type="button"
                  onClick={() => onRemoveFlag(flag.id)}
                  className="shrink-0 rounded-pill bg-danger-tint px-chip py-xs text-caption font-semibold text-danger"
                  aria-label={`Remove flag ${FLAG_LABEL[flag.type]}`}
                >
                  {FLAG_LABEL[flag.type]}
                  {flag.qty !== null ? ` ${flag.qty}` : ''} ✕
                </button>
              ) : (
                !flagged.has(line.id) && (
                  <button
                    type="button"
                    onClick={() => onFlag(line)}
                    className="min-h-[44px] shrink-0 rounded-pill border border-mist px-md text-label text-ink"
                  >
                    Flag
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
