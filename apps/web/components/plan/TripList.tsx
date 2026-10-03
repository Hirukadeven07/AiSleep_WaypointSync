'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  Brand,
  DropCheck,
  PlanDriver,
  PlanTrip,
  PlanTripState,
  TripSuggestion,
} from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { messageOf } from '@/lib/api-error';
import { kgText, m3Text, stopCount, stopWindow, tone, vehicleKind } from './format';
import { dragImage } from './OrderQueue';
import { Select } from './Select';
import type { PlanEdit } from './usePlanEdit';

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

/** Figma "Drop hint": says where the stop will land, or why the drop is refused. */
function DropHint({ check }: { check: DropCheck }) {
  const refused = !check.canDrop;
  return (
    <span
      className={`pointer-events-none absolute right-4 top-full z-10 flex -translate-y-1/2 items-center gap-2 rounded-pill px-4 py-[10px] text-[13px] font-semibold leading-[18px] text-bg ${
        refused ? 'bg-danger' : 'bg-primary'
      }`}
    >
      <Icon name={refused ? 'alert' : 'plus'} size={16} />
      {refused
        ? check.blocks[0]?.message
        : `Drop to add · slots in as stop ${check.placedSequence} by delivery window`}
    </span>
  );
}

/** "9-12" for a window that opens at 9:00 and closes at 12:00. */
const hourText = (min: number) =>
  min % 60 === 0
    ? String(min / 60)
    : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

/** A trip you just created: a drop area and the orders the rules let onto it (Figma "New · empty"). */
/** Opens the "Remove trip" confirmation; only trips still being planned can be removed. */
function RemoveTripButton({ trip, edit }: { trip: PlanTrip; edit: PlanEdit }) {
  return (
    <button
      type="button"
      onClick={() => edit.openModal({ kind: 'removeTrip', trip })}
      aria-label={`Remove ${trip.plate ?? trip.vehicleId} · Trip ${trip.tripNumber}`}
      className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-pill border border-danger-line bg-surface px-3 py-[6px] text-[12px] font-semibold leading-[15px] text-danger"
    >
      <Icon name="x" size={12} />
      Remove trip
    </button>
  );
}

function EmptyTrip({ trip, edit }: { trip: PlanTrip; edit: PlanEdit }) {
  const [suggestions, setSuggestions] = useState<TripSuggestion[]>([]);

  useEffect(() => {
    let live = true;
    api<TripSuggestion[]>(`/plan/trips/${trip.id}/suggestions`)
      .then((s) => live && setSuggestions(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [trip.id]);

  async function addAll() {
    for (const s of suggestions) {
      if (!(await edit.place(s.orderId, s.storeName, trip.id))) break;
    }
  }

  return (
    <div className="flex flex-col gap-[10px] px-[14px] py-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-[12px] ${TILE[trip.brand]}`}
        >
          <Icon name="truck" size={16} />
        </span>
        <span className="flex min-w-px flex-[1_0_0] flex-col gap-px whitespace-nowrap">
          <span className="text-[14px] font-semibold leading-5 text-ink">
            {trip.plate ?? trip.vehicleId} · Trip {trip.tripNumber}
          </span>
          <span className="text-[12px] leading-[15px] text-muted">
            {vehicleKind(trip)} · {trip.brand} · {trip.district} ·{' '}
            {trip.tripNumber === 1 ? 'morning' : 'afternoon'} run
          </span>
        </span>
        <span className="rounded-pill bg-olive-tint px-[9px] py-[3px] text-[12px] font-semibold leading-[15px] text-olive-ink">
          New · empty
        </span>
        <RemoveTripButton trip={trip} edit={edit} />
      </div>
      <div className="flex flex-col items-center gap-[2px] whitespace-nowrap rounded-[12px] border-[1.5px] border-dashed border-olive-ink bg-surface px-[14px] py-3">
        <p className="text-[13px] font-semibold leading-[18px] text-olive-ink">
          Drag orders here from the queue
        </p>
        {suggestions.length > 0 && (
          <p className="text-[12px] leading-[15px] text-muted">or add the suggested ones</p>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-col rounded-[12px] bg-surface px-3 py-[6px]">
          <div className="flex items-center py-[6px]">
            <p className="min-w-px flex-1 text-[12px] font-semibold leading-[17px] text-ink">
              Suggested for {trip.brand} · {trip.district}
            </p>
            <button
              type="button"
              onClick={() => void addAll()}
              className="rounded-pill bg-primary px-3 py-[6px] text-[12px] font-semibold leading-[17px] text-bg"
            >
              Add all {suggestions.length}
            </button>
          </div>
          {suggestions.map((s) => (
            <div key={s.orderId} className="flex items-center gap-[10px] py-[6px]">
              <div className="flex min-w-px flex-1 items-center gap-[6px]">
                <p className="whitespace-nowrap text-[12px] font-semibold leading-[17px] text-ink">
                  {s.storeName}
                </p>
                {s.waitingSinceYesterday && (
                  <span className="whitespace-nowrap rounded-pill bg-warning/[0.14] px-[9px] py-[3px] text-[12px] font-semibold leading-[15px] text-warning">
                    Waiting since yesterday
                  </span>
                )}
              </div>
              <p className="whitespace-nowrap text-[12px] leading-[15px] text-muted">
                {hourText(s.windowOpenMin)}-{hourText(s.windowCloseMin)} · {kgText(s.weightKg)} kg
              </p>
              <button
                type="button"
                onClick={() => void edit.place(s.orderId, s.storeName, trip.id)}
                className="flex min-h-6 items-center gap-1 rounded-pill bg-olive-tint px-[10px] py-1 text-[12px] font-bold leading-[15px] text-olive-ink"
              >
                <Icon name="plus" size={11} />
                Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Who drives the trip. "Vehicle's driver" follows the vehicle's registered driver; picking a name
 * puts that driver on this trip, and the driver's phone shows it from then on.
 */
function DriverPicker({
  trip,
  drivers,
  edit,
}: {
  trip: PlanTrip;
  drivers: PlanDriver[];
  edit: PlanEdit;
}) {
  const [busy, setBusy] = useState(false);
  const own = drivers.find((d) => d.vehicleId === trip.vehicleId);
  const options = [
    { value: '', label: own ? `Vehicle's driver (${own.name})` : "Vehicle's driver (none)" },
    ...drivers.map((d) => ({
      value: d.id,
      label: d.vehicleId === trip.vehicleId ? `${d.name} · this vehicle` : d.name,
    })),
  ];

  async function pick(value: string) {
    setBusy(true);
    try {
      await api<PlanTrip>(`/plan/trips/${trip.id}/driver`, {
        method: 'POST',
        body: { driverId: value || null },
      });
      await edit.reload();
    } catch (e) {
      edit.showToast({ kind: 'error', title: 'Driver not changed', sub: messageOf(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Select
      label="Driver"
      value={trip.driverAssigned ? (trip.driverId ?? '') : ''}
      options={options}
      onChange={(v) => void pick(v)}
      searchable
      disabled={busy || !trip.editable}
    />
  );
}

function TripRow({
  trip,
  drivers,
  open,
  onToggle,
  edit,
  onPublish,
}: {
  trip: PlanTrip;
  drivers: PlanDriver[];
  open: boolean;
  onToggle: () => void;
  edit: PlanEdit;
  onPublish: (tripId: string) => void;
}) {
  const hover = edit.hover?.tripId === trip.id ? edit.hover : null;
  const check = hover?.check ?? null;
  const preview = check?.after;
  const droppable = edit.drag !== null && trip.editable;
  const chip = stateChip(trip);
  const over = trip.state === 'over';
  const refused = check ? !check.canDrop : false;

  // While an order hovers over the trip, the bars show what the trip would look like with it.
  const weight = preview?.weightKg ?? trip.weightKg;
  const volume = preview?.volumeM3 ?? trip.volumeM3;
  const minutes = preview ? preview.minutes : trip.minutes;
  const stopsNow = preview?.stopCount ?? trip.stops.length;

  const frame = hover
    ? refused
      ? 'border-2 border-danger-line bg-danger-wash'
      : 'border-2 border-slate bg-wash'
    : over
      ? 'border border-danger-line bg-danger-wash'
      : open
        ? 'border border-border bg-wash'
        : '';

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!droppable) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      edit.enter(trip.id);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) edit.leave(trip.id);
    },
    onDrop: (e: React.DragEvent) => {
      if (!droppable || !edit.drag) return;
      e.preventDefault();
      edit.drop(trip.id);
    },
  };

  // A trip with no stops yet is the "New · empty" card with its drop area and suggestions.
  if (trip.stops.length === 0 && trip.status === 'planning' && !hover) {
    return (
      <div
        id={`trip-${trip.id}`}
        {...dropProps}
        className="relative flex flex-col rounded-note border-2 border-olive-ink bg-olive-wash"
      >
        <EmptyTrip trip={trip} edit={edit} />
      </div>
    );
  }

  return (
    <div
      id={`trip-${trip.id}`}
      {...dropProps}
      className={`relative flex flex-col rounded-note ${frame}`}
    >
      <div className="flex w-full items-center gap-3 px-3 py-[10px]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-[12px] ${TILE[trip.brand]}`}
        >
          <Icon name="truck" size={16} />
        </span>
        <span className="flex min-w-px flex-[1_0_0] flex-col gap-px overflow-hidden whitespace-nowrap">
          <span className="block truncate text-[14px] font-semibold leading-5 text-ink">
            {trip.plate ?? trip.vehicleId} · Trip {trip.tripNumber}
          </span>
          <span className="block truncate text-[12px] leading-[15px] text-muted">
            {vehicleKind(trip)} · {trip.brand} · {trip.district} · {stopCount(stopsNow)}
            {trip.driverName ? ` · ${trip.driverName}` : ' · no driver'}
          </span>
        </span>
        <Capacity
          unit="kg"
          used={weight}
          cap={trip.weightCapKg}
          text={`${kgText(weight)}/${kgText(trip.weightCapKg)}`}
        />
        <Capacity
          unit="m³"
          used={volume}
          cap={trip.volumeCapM3}
          text={`${m3Text(volume)}/${m3Text(trip.volumeCapM3)}`}
        />
        <Capacity
          unit="min"
          used={minutes ?? 0}
          cap={trip.budgetMin}
          text={`${minutes ?? '–'}/${trip.budgetMin}`}
        />
        <span className="flex w-[120px] shrink-0 items-center justify-end">
          <span
            className={`flex shrink-0 items-center gap-[6px] rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${chip.chip}`}
          >
            <span aria-hidden className="size-[7px] rounded-full bg-current" />
            {chip.label}
          </span>
        </span>
      </button>
        {trip.status === 'planning' && trip.stops.length > 0 && (
          <button
            type="button"
            onClick={() => onPublish(trip.id)}
            className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-pill bg-primary px-3 py-[6px] text-[12px] font-semibold leading-[15px] text-bg"
          >
            <Icon name="send" size={12} />
            Publish
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? 'Hide stops' : 'Show stops'}
          className="shrink-0 text-muted"
        >
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-1 px-3">
          {trip.stops.map((s) => (
            <div
              key={s.id}
              draggable={trip.editable}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', s.orderId);
                dragImage(e.currentTarget, e);
                edit.startDrag({ orderId: s.orderId, storeName: s.storeName, fromTripId: trip.id });
              }}
              onDragEnd={edit.endDrag}
              className={`flex items-center gap-[10px] rounded-[10px] bg-surface px-[10px] py-[7px] ${
                trip.editable ? 'cursor-grab' : ''
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-[10px] text-[12px] font-bold leading-[14px] ${TILE[trip.brand]}`}
              >
                {s.sequence}
              </span>
              <span className="min-w-px flex-[1_0_0] whitespace-pre text-[13px] font-medium leading-[18px] text-ink">
                {edit.justAdded === s.orderId ? `${s.storeName}  ·  just added` : s.storeName}
              </span>
              <span className="whitespace-nowrap text-[12px] leading-[17px] text-muted">
                {stopWindow(s)}
              </span>
              <span className="whitespace-nowrap text-[12px] font-semibold leading-[17px] text-muted">
                {kgText(s.weightKg)} kg
              </span>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[12px] font-semibold leading-[15px] text-muted">Driver</span>
            <DriverPicker trip={trip} drivers={drivers} edit={edit} />
          </div>
          <div className="flex items-center gap-3 pb-2">
            <p className="min-w-px flex-1 text-[12px] font-medium leading-[15px] text-muted">
              Stops stay sorted by delivery window, earliest first. The loader list and driver route
              follow this order.
            </p>
            {trip.status === 'planning' && <RemoveTripButton trip={trip} edit={edit} />}
          </div>
        </div>
      )}
      {check && <DropHint check={check} />}
    </div>
  );
}

/** Figma "Trips": a card of trip rows with kg, m³ and minute bars, a status chip and the stops when open. */
export function TripList({
  trips,
  drivers = [],
  edit,
  onPublish,
  className = '',
}: {
  trips: PlanTrip[];
  drivers?: PlanDriver[];
  edit: PlanEdit;
  onPublish: (tripId: string) => void;
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

  // "View" on the problems pill, or a trip that just received an order, opens and scrolls to that trip.
  const focus = edit.focus;
  useEffect(() => {
    if (!focus) return;
    setOpenId(focus.id);
    const index = trips.findIndex((t) => t.id === focus.id);
    if (index >= VISIBLE) setAll(true);
    requestAnimationFrame(() =>
      document
        .getElementById(`trip-${focus.id}`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    );
    // Only a new focus request should run this, not every refresh of the trips.
  }, [focus?.id, focus?.n]);

  // A trip with no stops yet goes first, so a new trip is where the dispatcher is looking.
  const isEmpty = (t: PlanTrip) => t.stops.length === 0 && t.status === 'planning';
  const ordered = [...trips].sort((a, b) => Number(isEmpty(b)) - Number(isEmpty(a)));
  const shown = all ? ordered : ordered.slice(0, VISIBLE);
  const hidden = ordered.length - shown.length;

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
          drivers={drivers}
          open={openId === t.id}
          onToggle={() => setOpenId(openId === t.id ? null : t.id)}
          edit={edit}
          onPublish={onPublish}
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
