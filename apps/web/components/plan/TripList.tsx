'use client';

import { useEffect, useRef, useState } from 'react';
import type { Brand, PlanTrip, PlanTripState } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { kgText, m3Text, stopWindow, tone, tripSubtitle } from './format';

const TILE: Record<Brand, string> = {
  Fresh: 'bg-fresh-tint text-fresh',
  Style: 'bg-style-tint text-style',
  Tech: 'bg-tech-tint text-tech',
};
const FILL = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' } as const;
const TEXT = { success: 'text-ink', warning: 'text-ink', danger: 'text-danger' } as const;

const VISIBLE = 9;

function Capacity({
  unit,
  used,
  cap,
  text,
}: {
  unit: string;
  used: number;
  cap: number;
  text: string;
}) {
  const percent = cap > 0 ? (used / cap) * 100 : 0;
  const t = tone(percent);
  return (
    <div className="flex w-[104px] shrink-0 flex-col gap-1">
      <div className="flex gap-1 text-[11px] leading-[14px]">
        <span className="font-semibold text-muted">{unit}</span>
        <span className="min-w-px flex-1" />
        <span className={`whitespace-nowrap font-bold ${TEXT[t]}`}>{text}</span>
      </div>
      <div className="h-[6px] overflow-hidden rounded-[3px] bg-bg">
        <div
          className={`h-[6px] rounded-[3px] ${FILL[t]}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

const STATE: Record<PlanTripState, { label: string; chip: string }> = {
  ready: { label: 'Ready', chip: 'bg-success/[0.12] text-success' },
  draft: { label: 'Draft', chip: 'bg-muted/[0.12] text-muted' },
  sent: { label: 'Sent', chip: 'bg-info/[0.12] text-info' },
  over: { label: 'Over', chip: 'bg-danger/[0.12] text-danger' },
};

function stateChip(trip: PlanTrip) {
  if (trip.state !== 'over') return STATE[trip.state];
  const what =
    trip.overVolume && trip.overWeight ? 'capacity' : trip.overVolume ? 'volume' : 'weight';
  return { ...STATE.over, label: `Over ${what}` };
}

function TripRow({
  trip,
  open,
  onToggle,
}: {
  trip: PlanTrip;
  open: boolean;
  onToggle: () => void;
}) {
  const chip = stateChip(trip);
  const over = trip.state === 'over';
  const stops = trip.stops.length;
  return (
    <div
      id={`trip-${trip.id}`}
      className={`flex flex-col rounded-note ${
        over
          ? 'border border-danger-line bg-danger-wash'
          : open
            ? 'border border-border bg-wash'
            : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-[10px] text-left"
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-[12px] ${TILE[trip.brand]}`}
        >
          <Icon name="truck" size={16} />
        </span>
        <span className="flex min-w-px flex-[1_0_0] flex-col gap-px whitespace-nowrap">
          <span className="text-[14px] font-semibold leading-5 text-ink">
            {trip.plate ?? trip.vehicleId} · Trip {trip.tripNumber}
          </span>
          <span className="text-[12px] leading-[15px] text-muted">{tripSubtitle(trip)}</span>
        </span>
        <Capacity
          unit="kg"
          used={trip.weightKg}
          cap={trip.weightCapKg}
          text={`${kgText(trip.weightKg)}/${kgText(trip.weightCapKg)}`}
        />
        <Capacity
          unit="m³"
          used={trip.volumeM3}
          cap={trip.volumeCapM3}
          text={`${m3Text(trip.volumeM3)}/${m3Text(trip.volumeCapM3)}`}
        />
        <Capacity
          unit="min"
          used={trip.minutes ?? 0}
          cap={trip.budgetMin}
          text={`${trip.minutes ?? '–'}/${trip.budgetMin}`}
        />
        <span className="flex w-[196px] shrink-0 items-center justify-end">
          <span
            className={`flex shrink-0 items-center gap-[6px] rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${chip.chip}`}
          >
            <span aria-hidden className="size-[7px] rounded-full bg-current" />
            {chip.label}
          </span>
        </span>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} className="text-muted" />
      </button>

      {open && (
        <div className="flex flex-col gap-1 px-3">
          {trip.stops.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-[10px] rounded-[10px] bg-surface px-[10px] py-[7px]"
            >
              <span
                className={`flex size-5 items-center justify-center rounded-[10px] text-[12px] font-bold leading-[14px] ${TILE[trip.brand]}`}
              >
                {s.sequence}
              </span>
              <span className="min-w-px flex-[1_0_0] text-[13px] font-medium leading-[18px] text-ink">
                {s.storeName}
              </span>
              <span className="whitespace-nowrap text-[12px] leading-[17px] text-muted">
                {stopWindow(s)}
              </span>
              <span className="whitespace-nowrap text-[12px] font-semibold leading-[17px] text-muted">
                {kgText(s.weightKg)} kg
              </span>
            </div>
          ))}
          <p className="whitespace-nowrap text-[12px] font-medium leading-[15px] text-muted">
            Stops stay sorted by delivery window, earliest first. The loader list and driver route
            follow this order.
          </p>
        </div>
      )}
      <span className="sr-only">{stops} stops</span>
    </div>
  );
}

/** Figma "Trips": a card of trip rows with kg, m³ and minute bars, a status chip and the stops when open. */
export function TripList({
  trips,
  focusTripId,
  className = '',
}: {
  trips: PlanTrip[];
  /** Opens and scrolls to this trip (the "View" button on the problems pill). */
  focusTripId: string | null;
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(trips[0]?.id ?? null);
  const [all, setAll] = useState(false);
  const seeded = useRef(false);

  // The first load opens the first trip.
  useEffect(() => {
    if (!seeded.current && trips.length > 0) {
      seeded.current = true;
      setOpenId(trips[0].id);
    }
  }, [trips]);

  useEffect(() => {
    if (!focusTripId) return;
    setOpenId(focusTripId);
    const index = trips.findIndex((t) => t.id === focusTripId);
    if (index >= VISIBLE) setAll(true);
    requestAnimationFrame(() =>
      document
        .getElementById(`trip-${focusTripId}`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    );
  }, [focusTripId, trips]);

  const shown = all ? trips : trips.slice(0, VISIBLE);
  const hidden = trips.length - shown.length;

  return (
    <section
      className={`flex flex-col gap-[6px] overflow-y-auto rounded-card bg-surface p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <div className="flex shrink-0 items-center gap-3 px-1">
        <h2 className="text-[18px] font-semibold leading-[25px] text-ink">Trips</h2>
        <span className="rounded-pill bg-bg px-[9px] py-[3px] text-[12px] font-semibold leading-[15px] text-ink">
          {trips.length}
        </span>
        <span className="min-w-px flex-1" />
        {(
          [
            ['OK', 'bg-success'],
            ['Near limit', 'bg-warning'],
            ['Over', 'bg-danger'],
          ] as const
        ).map(([label, dot]) => (
          <span
            key={label}
            className="flex items-center gap-[5px] text-[12px] font-medium leading-[15px] text-muted"
          >
            <span aria-hidden className={`size-[7px] rounded-full ${dot}`} />
            {label}
          </span>
        ))}
      </div>

      {shown.map((t) => (
        <TripRow
          key={t.id}
          trip={t}
          open={openId === t.id}
          onToggle={() => setOpenId(openId === t.id ? null : t.id)}
        />
      ))}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="flex items-center justify-center gap-[6px] px-3 py-2 text-[12px] font-semibold leading-[17px] text-slate"
        >
          + {hidden} more {hidden === 1 ? 'trip' : 'trips'}
          <Icon name="chevron-down" size={14} />
        </button>
      )}
    </section>
  );
}
