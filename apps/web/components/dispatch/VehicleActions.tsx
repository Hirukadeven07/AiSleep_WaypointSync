'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type {
  BreakdownRequest,
  Brand,
  IncidentDetail,
  LiveTrip,
  MoveOptions,
  MoveStopRequest,
  MoveStopResult,
} from '@waypoint/contracts';
import { Icon, type IconName } from '@/components/ui/Icon';
import { api } from '@/lib/api';

/** Trips that can break down: loaded or on the road. */
const BREAKABLE = ['loading', 'ready', 'on_road'];

const HERO: Record<Brand, string> = {
  Fresh: 'bg-fresh-tint',
  Style: 'bg-style-tint',
  Tech: 'bg-tech-tint',
};

function Action({
  icon,
  title,
  text,
  onClick,
}: {
  icon: IconName;
  title: string;
  text: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex shrink-0 items-center gap-3 rounded-note bg-wash p-[14px] text-left"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-slate">
        <Icon name={icon} size={16} />
      </span>
      <span className="flex min-w-px flex-1 flex-col gap-px">
        <span className="text-[14px] font-semibold leading-[19px] text-ink">{title}</span>
        <span className="text-[12px] leading-4 text-muted">{text}</span>
      </span>
    </button>
  );
}

const clock = (min: number) => `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, '0')}`;

/** "Move a stop": pick a stop the driver has not reached and a trip still at the depot to take it. */
function MoveStopAction({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<MoveOptions | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [toTripId, setToTripId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<MoveStopResult | null>(null);

  async function start() {
    setOpen(true);
    setError(null);
    try {
      const o = await api<MoveOptions>(
        `/dispatch/trips/${encodeURIComponent(tripId)}/move-options`,
      );
      setOptions(o);
      setStopId(o.stops[0]?.id ?? null);
    } catch {
      setError('Could not load where the stops can go.');
    }
  }

  async function confirm() {
    if (!stopId || !toTripId) return;
    setBusy(true);
    setError(null);
    try {
      const body: MoveStopRequest = { stopId, toTripId };
      setDone(
        await api<MoveStopResult>(`/dispatch/trips/${encodeURIComponent(tripId)}/move-stop`, {
          method: 'POST',
          body,
        }),
      );
    } catch (e) {
      const msg = (e as { body?: { message?: string } }).body?.message;
      setError(typeof msg === 'string' ? msg : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Action
        icon="arrows"
        title="Move a stop"
        text="Reassign one of its remaining stops to another trip"
        onClick={() => void start()}
      />
    );
  }
  if (done) {
    return (
      <div className="flex shrink-0 flex-col gap-[6px] rounded-note bg-success-tint p-[14px]">
        <p className="text-[13px] font-semibold leading-[18px] text-ink">
          {done.storeName} moved to {done.toLabel}
          {done.etaMin !== null ? ` · ETA ${clock(done.etaMin)}` : ''}
        </p>
        <p className="text-[12px] leading-4 text-muted">
          The store was told. Both drivers and the dock see the plan change.
        </p>
      </div>
    );
  }

  const targets = options?.targets ?? [];
  return (
    <div className="flex shrink-0 flex-col gap-[10px] rounded-note bg-wash p-[14px]">
      <p className="text-[13px] font-semibold leading-[18px] text-ink">Move a stop</p>
      {!options && !error && <p className="text-[12px] text-muted">Loading…</p>}
      {options && options.stops.length === 0 && (
        <p className="text-[12px] text-muted">Every stop on this trip has been reached.</p>
      )}
      {options && options.stops.length > 0 && (
        <>
          <label className="flex flex-col gap-[6px] text-[12px] font-semibold text-muted">
            Stop
            <select
              value={stopId ?? ''}
              onChange={(e) => {
                setStopId(e.target.value);
                setToTripId(null);
              }}
              className="rounded-input border border-mist bg-surface px-3 py-2 text-[13px] font-normal text-ink"
            >
              {options.stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.storeName} · {s.windowText}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-[6px]">
            <p className="text-[12px] font-semibold text-muted">To trip</p>
            {targets.length === 0 && (
              <p className="text-[12px] text-muted">No other trip is still at the depot today.</p>
            )}
            {targets.map((t) => {
              const fit = stopId ? t.fits[stopId] : undefined;
              const ok = !!fit?.ok;
              const on = toTripId === t.tripId;
              return (
                <button
                  key={t.tripId}
                  type="button"
                  disabled={!ok}
                  aria-pressed={on}
                  onClick={() => setToTripId(t.tripId)}
                  className={`flex flex-col rounded-[12px] px-3 py-2 text-left ${
                    on
                      ? 'border-[1.5px] border-slate bg-surface'
                      : 'border-[1.5px] border-transparent bg-surface'
                  } ${ok ? '' : 'opacity-60'}`}
                >
                  <span className="text-[13px] font-semibold text-ink">{t.label}</span>
                  {!ok && fit?.reason && (
                    <span className="text-[12px] leading-4 text-danger">{fit.reason}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-[12px] font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !stopId || !toTripId}
          onClick={() => void confirm()}
          className="rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-bg disabled:opacity-50"
        >
          {busy ? 'Moving…' : 'Move stop'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-pill bg-surface px-4 py-2 text-[13px] font-semibold text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * "Truck broke down": logs the breakdown (the trip stops, an incident opens) and goes to the
 * incidents screen, where the dispatcher defers a store and sends the rest on another truck.
 */
function BreakdownAction({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const body: BreakdownRequest = { tripId, note: note.trim() || undefined };
      const incident = await api<IncidentDetail>('/incidents/breakdown', { method: 'POST', body });
      router.push(`/dispatch/incidents?id=${encodeURIComponent(incident.id)}`);
    } catch {
      setError('That did not go through. Try again.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Action
        icon="alert"
        title="Truck broke down"
        text="Stop this trip and recover its remaining stops"
        onClick={() => setOpen(true)}
      />
    );
  }
  return (
    <div className="flex shrink-0 flex-col gap-[10px] rounded-note bg-danger-tint p-[14px]">
      <label className="flex flex-col gap-[6px] text-[13px] font-semibold leading-[18px] text-ink">
        What happened? (optional)
        <input
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Engine overheating near Kelaniya"
          className="rounded-input border border-mist bg-surface px-3 py-2 text-[13px] font-normal"
        />
      </label>
      <p className="text-[12px] leading-4 text-muted">
        The trip stops and an incident opens. Next you choose which store to defer and which truck
        takes the rest.
      </p>
      {error && (
        <p role="alert" className="text-[12px] font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className="rounded-pill bg-danger px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Confirm breakdown'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-pill bg-surface px-4 py-2 text-[13px] font-semibold text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Figma "Vehicle actions drawer": what a dispatcher can do about a trip that is on the road. */
export function VehicleActions({
  trip,
  onClose,
  onNotify,
}: {
  trip: LiveTrip;
  onClose: () => void;
  onNotify: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const behind =
    trip.live === 'late'
      ? ` · running ${trip.lateMin} min late`
      : trip.live === 'not_synced'
        ? ` · not synced for ${trip.notSyncedMin} min`
        : '';

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/35"
      />
      <aside
        role="dialog"
        aria-label="Vehicle actions"
        className="absolute right-4 top-4 flex w-[400px] max-w-[calc(100vw-32px)] flex-col gap-[14px] rounded-hero bg-surface p-[22px] shadow-ghost"
      >
        <div className="flex items-center">
          <p className="min-w-px flex-1 text-[13px] font-semibold leading-[18px] text-muted">
            On the road
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

        <div className={`flex items-center gap-3 rounded-[22px] p-4 ${HERO[trip.brand]}`}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
            <Icon name="truck" size={20} />
          </span>
          <div className="flex min-w-px flex-1 flex-col">
            <p className="text-[15px] font-bold leading-5 text-ink">
              {trip.plate ?? trip.vehicleId} · {trip.brand} · {trip.district}
            </p>
            <p className="text-[12px] font-medium leading-4 text-muted">
              {trip.driverName ?? 'No driver yet'} · {trip.stopsTotal - trip.stopsDone}{' '}
              {trip.stopsTotal - trip.stopsDone === 1 ? 'stop' : 'stops'}
              {behind}
            </p>
          </div>
        </div>

        <MoveStopAction tripId={trip.id} />
        {BREAKABLE.includes(trip.status) && <BreakdownAction tripId={trip.id} />}
        <Action
          icon="bell"
          title="Notify affected stores"
          text="Tell the stores on this trip about a delay or change"
          onClick={onNotify}
        />
        <Link
          href="/dispatch/map"
          className="flex items-center gap-2 rounded-pill bg-primary px-4 py-3 text-[14px] font-semibold leading-[19px] text-bg"
        >
          <Icon name="crosshair" size={18} />
          Locate on live map
        </Link>
      </aside>
    </div>
  );
}
