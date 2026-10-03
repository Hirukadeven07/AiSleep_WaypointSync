'use client';

import { useEffect, useState } from 'react';
import type { StoreDelivery, StoreOrderView } from '@waypoint/contracts';
import { formatMinutes, formatTime } from '@/lib/clock';
import { Icon } from '@/components/ui/Icon';

export function PageTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div>
      {eyebrow && <p className="text-eyebrow uppercase text-muted">{eyebrow}</p>}
      <h1 className="text-heading font-semibold text-ink lg:text-[32px] lg:leading-10">{title}</h1>
    </div>
  );
}

/**
 * Desktop split, after the driver screens: one column on the phone, a main column and a side
 * panel from `lg`. A SPLIT_COL is invisible on the phone (its children sit straight in the one
 * column, placed by their `order-*` class) and becomes a real column from `lg`.
 */
export const SPLIT =
  'flex flex-col gap-md lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]';
export const SPLIT_COL = 'contents lg:flex lg:min-w-0 lg:flex-col lg:gap-md';

/** Server minutes-since-midnight, advanced locally once a minute so countdowns keep moving. */
export function useServerMinutes(serverMin: number | undefined) {
  const [base, setBase] = useState<{ min: number; at: number }>();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (serverMin !== undefined) setBase({ min: serverMin, at: Date.now() });
  }, [serverMin]);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!base) return undefined;
  return base.min + Math.floor((Date.now() - base.at) / 60_000);
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

export function formatDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** Deferral notice: reason, the new date, and a repeat-skip note. */
export function DeferralCard({ order }: { order: StoreOrderView }) {
  return (
    <div className="space-y-xs rounded-card border-2 border-warning bg-warning-tint p-lg">
      <p className="flex items-center gap-sm text-title text-ink">
        <Icon name="alert" className="text-warning" />
        Delivery moved to {formatDate(order.deliveryDate)}
      </p>
      {order.deferReason && <p className="text-body text-ink">Reason: {order.deferReason}</p>}
      <p className="text-label text-muted">
        {order.movedFromDate ? `Was due ${formatDate(order.movedFromDate)} · ` : ''}
        {order.units} units{order.chilled ? ' · chilled' : ''}
      </p>
      {order.repeatSkip && (
        <p className="text-label font-semibold text-danger">
          Your store was also moved on the last run. Dispatch has been told it is a repeat.
        </p>
      )}
    </div>
  );
}

type Step = { label: string; at: string | null; done: boolean };

export function handoffSteps(d: StoreDelivery): Step[] {
  const arrived =
    !!d.arrivedAt || ['arrived', 'waiting', 'confirmed', 'delivered', 'partial'].includes(d.status);
  const checked = !!d.storeConfirmedAt || ['confirmed', 'delivered', 'partial'].includes(d.status);
  const acked = !!d.driverAckAt || ['delivered', 'partial'].includes(d.status);
  return [
    {
      label: d.etaMin !== null ? `On the way · ETA ${formatMinutes(d.etaMin)}` : 'On the way',
      at: null,
      done: true,
    },
    { label: 'Driver arrived', at: d.arrivedAt, done: arrived },
    { label: 'You checked the goods', at: d.storeConfirmedAt, done: checked },
    { label: 'Driver acknowledged', at: d.driverAckAt, done: acked },
  ];
}

/** S5: the four handoff states of one delivery. */
export function HandoffTimeline({ delivery }: { delivery: StoreDelivery }) {
  const steps = handoffSteps(delivery);
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.label} className="flex gap-md">
          <div className="flex flex-col items-center">
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                s.done
                  ? 'bg-success text-white'
                  : i === current
                    ? 'border-2 border-primary bg-surface'
                    : 'border-2 border-mist bg-surface'
              }`}
            >
              {s.done && <Icon name="check" size={16} />}
            </span>
            {i < steps.length - 1 && (
              <span className={`w-0.5 flex-1 ${s.done ? 'bg-success' : 'bg-mist'}`} />
            )}
          </div>
          <div className="pb-md">
            <p
              className={`text-body ${s.done ? 'font-semibold text-ink' : i === current ? 'font-semibold text-primary' : 'text-muted'}`}
            >
              {s.label}
            </p>
            {s.at && <p className="text-caption text-muted">{formatTime(s.at)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const ISSUE_LABEL: Record<string, string> = {
  missing: 'Missing',
  damaged: 'Damaged',
  wrong_quantity: 'Wrong quantity',
};

const DECISION = {
  pending: { label: 'Waiting for driver', className: 'bg-warning-tint text-warning' },
  accepted: { label: 'Driver accepted', className: 'bg-success-tint text-success' },
  rejected: { label: 'Driver disputed', className: 'bg-danger-tint text-danger' },
} as const;

/** Lines the store flagged at receipt, with the driver's decision on each. */
export function IssueList({ delivery }: { delivery: StoreDelivery }) {
  if (delivery.issues.length === 0) return null;
  return (
    <ul className="space-y-xs">
      {delivery.issues.map((i) => {
        const d = DECISION[i.driverDecision];
        return (
          <li
            key={i.id}
            className="flex items-center justify-between gap-sm rounded-input bg-danger-tint px-md py-sm"
          >
            <span className="min-w-0">
              <span className="block truncate text-label font-semibold text-ink">{i.itemName}</span>
              <span className="block text-caption text-danger">
                {ISSUE_LABEL[i.reason] ?? i.reason}
                {i.qty !== null ? ` · ${i.qty}` : ''}
                {i.resolveStatus ? ' · Resolved' : ' · Not resolved'}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-pill px-chip py-xs text-caption font-semibold ${d.className}`}
            >
              {d.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const DONE_STOP = new Set(['delivered', 'partial', 'confirmed', 'deferred']);

/**
 * Where the truck is on its run (S1): how many stops are before this store, and a strip of the
 * trip's stops by number. Other stores are never named; only this store's stop is marked.
 */
export function TruckTracker({ delivery }: { delivery: StoreDelivery }) {
  const track = delivery.track ?? [];
  if (track.length === 0) return null;
  const away = delivery.stopsAway;
  return (
    <div className="space-y-sm rounded-input bg-bg p-md" aria-label="Where the truck is">
      {away !== null && away !== undefined && (
        <p className="text-body font-semibold text-ink">
          {away === 0
            ? 'You are the next stop'
            : `${away} ${away === 1 ? 'stop' : 'stops'} before you`}
          {delivery.etaMin !== null ? ` · ETA ${formatMinutes(delivery.etaMin)}` : ''}
        </p>
      )}
      <ol className="flex flex-wrap items-center gap-xs">
        {track.map((t) => {
          const done = DONE_STOP.has(t.status);
          return (
            <li
              key={t.sequence}
              aria-label={`Stop ${t.sequence}${t.isYou ? ', your store' : ''}${done ? ', done' : ''}`}
              className={`flex h-8 min-w-[32px] items-center justify-center rounded-full px-sm text-caption font-semibold ${
                t.isYou
                  ? 'bg-primary text-bg'
                  : done
                    ? 'bg-olive-ink text-white'
                    : 'bg-surface text-muted'
              }`}
            >
              {t.isYou ? 'You' : done ? '✓' : t.sequence}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
