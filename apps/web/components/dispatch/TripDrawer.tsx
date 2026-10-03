'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { Brand, LiveStop, LiveTrip } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { clock } from '@/components/plan/format';
import { timeOf, toneOf } from './live-format';

const HERO: Record<Brand, string> = {
  Fresh: 'bg-fresh-tint',
  Style: 'bg-style-tint',
  Tech: 'bg-tech-tint',
};

export const vehicleKind = (t: Pick<LiveTrip, 'vehicleType' | 'vehicleTemp'>) =>
  t.vehicleType === 'van'
    ? 'Van'
    : t.vehicleTemp === 'reefer'
      ? 'Refrigerated truck'
      : 'Ambient truck';

const windowText = (s: LiveStop) => `${clock(s.windowOpenMin)}-${clock(s.windowCloseMin)}`;
const AT_RISK_MIN = 15;
const done = (s: LiveStop) => ['delivered', 'confirmed', 'partial', 'deferred'].includes(s.status);

/** The stops that a delay would reach: ETA past the window, or within 15 minutes of its end. */
export const affectedStops = (t: LiveTrip) =>
  t.stops.filter(
    (s) =>
      !done(s) &&
      s.etaMin !== null &&
      (s.missBy !== null || s.windowCloseMin - s.etaMin <= AT_RISK_MIN),
  );

function Marker({ n, tone }: { n: number; tone: string }) {
  return (
    <span
      className={`flex size-[26px] shrink-0 items-center justify-center rounded-[13px] text-[12px] font-bold leading-[15px] ${tone}`}
    >
      {n}
    </span>
  );
}

function Stop({
  stop,
  next,
  onRoad,
  offline = false,
}: {
  stop: LiveStop;
  next: boolean;
  onRoad: boolean;
  /** The phone is not syncing: ETAs are the plan, not where the truck is. */
  offline?: boolean;
}) {
  const finished = done(stop);
  const partial = stop.status === 'partial' || stop.issueNote !== null;
  const risk =
    !finished &&
    stop.etaMin !== null &&
    stop.missBy === null &&
    stop.windowCloseMin - stop.etaMin <= AT_RISK_MIN;

  let marker: React.ReactNode;
  let tag: React.ReactNode = null;
  let sub: string;
  if (finished) {
    marker = (
      <span
        className={`flex size-[26px] shrink-0 items-center justify-center rounded-[13px] ${
          partial ? 'bg-warning-tint text-warning' : 'bg-success-tint text-success'
        }`}
      >
        <Icon name="check" size={13} />
      </span>
    );
    sub = `Delivered ${timeOf(stop.arrivedAt)}${stop.issueNote ? ` · ${stop.issueNote}` : ''}`;
    if (partial) {
      tag = (
        <span className="rounded-pill bg-warning/[0.14] px-[10px] py-1 text-[12px] font-semibold leading-[15px] text-warning">
          Partial
        </span>
      );
    } else if (stop.confirmed) {
      tag = (
        <span className="rounded-pill bg-success/[0.14] px-[10px] py-1 text-[12px] font-semibold leading-[15px] text-success">
          Confirmed
        </span>
      );
    }
  } else {
    const eta =
      stop.etaMin !== null
        ? `${offline ? 'Planned ' : next ? 'Arriving ~' : 'ETA '}${clock(stop.etaMin)} · window ${windowText(stop)}`
        : `Window ${windowText(stop)}`;
    sub = eta;
    if (stop.missBy !== null) {
      marker = <Marker n={stop.sequence} tone="bg-danger-tint text-danger" />;
      tag = (
        <span className="rounded-pill bg-danger/[0.14] px-[10px] py-1 text-[12px] font-semibold leading-[15px] text-danger">{`Will miss by ~${stop.missBy} min`}</span>
      );
    } else if (risk) {
      marker = <Marker n={stop.sequence} tone="bg-warning-tint text-warning" />;
      tag = (
        <span className="rounded-pill bg-warning/[0.14] px-[10px] py-1 text-[12px] font-semibold leading-[15px] text-warning">
          At risk
        </span>
      );
    } else if (next && onRoad) {
      marker = <Marker n={stop.sequence} tone="bg-info-tint text-blue" />;
      tag = (
        <span className="flex items-center gap-[6px] rounded-pill bg-blue/[0.12] px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] text-blue">
          <span aria-hidden className="size-[7px] rounded-full bg-current" />
          Next
        </span>
      );
    } else {
      marker = <Marker n={stop.sequence} tone="bg-bg text-quiet" />;
    }
    if (!marker) marker = <Marker n={stop.sequence} tone="bg-bg text-quiet" />;
  }

  const later = !finished && stop.missBy === null && !risk && !(next && onRoad);
  return (
    <div className="flex items-start gap-3 py-[7px]">
      {marker}
      <div className="flex min-w-px flex-1 flex-col gap-px">
        <p
          className={`whitespace-nowrap text-[13px] font-semibold leading-[18px] ${later ? 'text-muted' : 'text-ink'}`}
        >
          {stop.storeName}
        </p>
        <p className="text-[12px] leading-[17px] text-muted">{sub}</p>
      </div>
      {tag}
    </div>
  );
}

/** Figma "Trip detail drawer": where a trip is, stop by stop, with the actions that fit its state. */
export function TripDrawer({
  trip,
  onClose,
  onNotify,
  onOpenTrip,
  nextTripId,
}: {
  trip: LiveTrip;
  onClose: () => void;
  onNotify: () => void;
  /** Opens another trip (the same vehicle's next one). */
  onOpenTrip: (id: string) => void;
  nextTripId: string | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tone = toneOf(trip);
  const onRoad = ['on_time', 'late', 'breakdown', 'not_synced'].includes(trip.live);
  const firstOpen = trip.stops.find((s) => !done(s));
  const pct = trip.stopsTotal > 0 ? (trip.stopsDone / trip.stopsTotal) * 100 : 0;
  const affected = affectedStops(trip);
  const remaining = trip.stopsTotal - trip.stopsDone;
  const plate = trip.plate ?? trip.vehicleId;
  const vehicle = trip.vehicleType === 'van' ? 'van' : 'truck';

  const banner =
    trip.live === 'late'
      ? `Running about ${trip.lateMin} min behind.`
      : trip.live === 'breakdown'
        ? `Broke down. ${remaining} ${remaining === 1 ? 'stop' : 'stops'} still to deliver.`
        : trip.live === 'not_synced'
          ? `${
              trip.lastSyncAt
                ? `Phone offline since ${timeOf(trip.lastSyncAt)}.`
                : trip.departedAt
                  ? `No sync since it left at ${timeOf(trip.departedAt)}.`
                  : 'The phone has not synced yet.'
            } Times below are the plan; deliveries recorded offline appear when it reconnects.`
          : null;

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Close trip details"
        onClick={onClose}
        className="absolute inset-0 bg-scrim/35"
      />
      <aside
        role="dialog"
        aria-label="Trip details"
        className="absolute bottom-4 right-4 top-4 flex w-[440px] max-w-[calc(100vw-32px)] flex-col gap-3 overflow-y-auto rounded-hero bg-surface p-[22px] shadow-ghost [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex shrink-0 items-center">
          <p className="min-w-px flex-1 text-[13px] font-semibold leading-[18px] text-muted">
            Trip details
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full bg-bg text-ink"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div
          className={`flex shrink-0 flex-col gap-[10px] rounded-card p-[18px] ${HERO[trip.brand]}`}
        >
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-surface text-ink">
              <Icon name="truck" size={20} />
            </span>
            <div className="flex min-w-px flex-1 flex-col whitespace-nowrap">
              <p className="text-[12px] font-medium leading-[17px] text-muted">
                {vehicleKind(trip)}
                {trip.driverName ? ` · ${trip.driverName}` : ''}
              </p>
              <p className="text-[22px] font-semibold leading-7 text-ink">
                {plate} · Trip {trip.tripNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center">
            <p className="min-w-px flex-1 text-[13px] font-semibold leading-[18px] text-ink">
              {trip.stopsDone} of {trip.stopsTotal} delivered
            </p>
            <span
              className={`flex items-center gap-[6px] whitespace-nowrap rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${tone.chip}`}
            >
              <span aria-hidden className="size-[7px] rounded-full bg-current" />
              {tone.label}
            </span>
          </div>
          <span className="h-2 w-full overflow-hidden rounded-[4px] bg-surface">
            <span className={`block h-2 rounded-[4px] ${tone.fill}`} style={{ width: `${pct}%` }} />
          </span>
        </div>

        {banner && (
          <div
            className={`flex shrink-0 items-start gap-[10px] rounded-note p-[14px] ${
              trip.live === 'not_synced'
                ? 'bg-banner'
                : trip.live === 'breakdown'
                  ? 'bg-danger-tint'
                  : 'bg-warning-tint'
            }`}
          >
            <Icon
              name="clock"
              size={18}
              className={
                trip.live === 'not_synced'
                  ? 'text-muted'
                  : trip.live === 'breakdown'
                    ? 'text-danger'
                    : 'text-warning'
              }
            />
            <p className="min-w-px flex-1 text-[12px] font-medium leading-[18px] text-ink">
              {banner}
            </p>
          </div>
        )}

        <div className="flex shrink-0 flex-col">
          {trip.stops.map((s) => (
            <Stop key={s.id} stop={s} next={s.id === firstOpen?.id} onRoad={onRoad} />
          ))}
        </div>

        <p
          className={`shrink-0 rounded-note p-3 text-[12px] leading-[18px] ${
            trip.live === 'late' || trip.live === 'breakdown'
              ? 'bg-danger-tint font-semibold text-ink'
              : 'bg-bg text-muted'
          }`}
        >
          {trip.live === 'late'
            ? `${affected.length} upcoming ${affected.length === 1 ? 'stop is' : 'stops are'} affected. Letting the stores know now avoids surprise when the ${vehicle} arrives late.`
            : trip.live === 'breakdown'
              ? 'Choose how to recover on the incident page: send a replacement, move stops to later, or split.'
              : trip.live === 'not_synced'
                ? 'Likely a no-signal area. Deliveries will sync when the phone reconnects.'
                : trip.live === 'completed'
                  ? `Back at depot${trip.backAt ? ` ${timeOf(trip.backAt)}` : ''}. ${trip.stopsDone} of ${trip.stopsTotal} delivered.`
                  : 'Each stop is confirmed by the store in its app and acknowledged by the driver. Both sync here, even after time offline.'}
        </p>

        <span className="min-h-px flex-1" />

        <div className="flex shrink-0 gap-2">
          {trip.live === 'late' && (
            <>
              <button
                type="button"
                disabled
                className="flex min-w-px flex-1 items-center justify-center rounded-pill border border-border bg-surface px-[18px] py-3 text-[14px] font-semibold leading-5 text-ink"
              >
                Move a stop
              </button>
              <button
                type="button"
                onClick={onNotify}
                className="flex min-w-px flex-1 items-center justify-center rounded-pill bg-primary px-[18px] py-3 text-[14px] font-semibold leading-5 text-on-primary"
              >
                Notify affected stores
              </button>
            </>
          )}
          {trip.live === 'not_synced' && (
            <>
              <button
                type="button"
                disabled
                className="flex min-w-px flex-1 items-center justify-center rounded-pill border border-border bg-surface px-[18px] py-3 text-[14px] font-semibold leading-5 text-ink"
              >
                Message driver
              </button>
              <Call phone={trip.driverPhone} primary />
            </>
          )}
          {trip.live === 'completed' && (
            <>
              <button
                type="button"
                disabled
                className="flex min-w-px flex-1 items-center justify-center rounded-pill border border-border bg-surface px-[18px] py-3 text-[14px] font-semibold leading-5 text-ink"
              >
                Download trip report
              </button>
              {nextTripId && trip.nextTrip && (
                <button
                  type="button"
                  onClick={() => onOpenTrip(nextTripId)}
                  className="flex min-w-px flex-1 items-center justify-center rounded-pill bg-primary px-[18px] py-3 text-[14px] font-semibold leading-5 text-on-primary"
                >
                  View Trip {trip.nextTrip.tripNumber}
                </button>
              )}
            </>
          )}
          {(trip.live === 'on_time' ||
            trip.live === 'breakdown' ||
            trip.live === 'assigned' ||
            trip.live === 'loading') && (
            <>
              <Call phone={trip.driverPhone} />
              <Link
                href="/dispatch/incidents"
                className="flex min-w-px flex-1 items-center justify-center rounded-pill bg-primary px-[18px] py-3 text-[14px] font-semibold leading-5 text-on-primary"
              >
                {trip.live === 'breakdown' ? 'Open incident' : 'Report issue'}
              </Link>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Call({ phone, primary = false }: { phone: string | null; primary?: boolean }) {
  const cls = `flex min-w-px flex-1 items-center justify-center rounded-pill px-[18px] py-3 text-[14px] font-semibold leading-5 ${
    primary ? 'bg-primary text-on-primary' : 'border border-border bg-surface text-ink'
  }`;
  return phone ? (
    <a href={`tel:${phone}`} className={cls}>
      Call driver
    </a>
  ) : (
    <button type="button" disabled className={`${cls} opacity-50`}>
      Call driver
    </button>
  );
}
