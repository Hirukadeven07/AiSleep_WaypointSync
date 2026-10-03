'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DriverDayFlag, DriverDayStop, DriverDayTrip, FlagType } from '@waypoint/contracts';
import { OfflineBanner } from '@/components/drive/OfflineBanner';
import { useDriver } from '@/components/drive/DriverShell';
import { Icon } from '@/components/ui/Icon';
import { fullDay } from '@/lib/driver-cache';
import {
  clockText,
  isStopDone,
  mapsUrl,
  telHref,
  vehicleLabel,
  windowText,
} from '@/lib/driver-format';

const FLAG_LABEL: Record<FlagType, string> = {
  missing: 'Missing',
  damaged: 'Damaged',
  wrong_quantity: 'Wrong quantity',
};
const PHONE_LABEL = { shop: 'Shop', manager: 'Manager', warehouse: 'Warehouse' } as const;

/** Trips that have not left the depot yet: the driver checks the load before leaving. */
const AT_DEPOT = new Set(['published', 'loading', 'ready']);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function flagText(f: DriverDayFlag) {
  return [FLAG_LABEL[f.type] ?? f.type, f.qty != null ? `${f.qty}` : null, f.itemName]
    .filter(Boolean)
    .join(' · ');
}

// --- Load check, kept on the phone so it works with no signal ---------------------------------

type CheckState = { planVersion: number; ticked: string[]; doneAt: string | null };
const checkKey = (tripId: string) => `ws_load_check_${tripId}`;

function readCheck(trip: DriverDayTrip): CheckState {
  try {
    const raw = globalThis.localStorage?.getItem(checkKey(trip.id));
    const saved = raw ? (JSON.parse(raw) as CheckState) : null;
    // A changed plan means a changed load: check it again.
    if (saved && saved.planVersion === trip.planVersion) return saved;
  } catch {
    /* blocked storage: start fresh */
  }
  return { planVersion: trip.planVersion, ticked: [], doneAt: null };
}

function saveCheck(tripId: string, state: CheckState) {
  try {
    globalThis.localStorage?.setItem(checkKey(tripId), JSON.stringify(state));
  } catch {
    /* the check still works for this visit */
  }
}

function LoadCheck({ trip, noteCount }: { trip: DriverDayTrip; noteCount: number }) {
  const [state, setState] = useState<CheckState>(() => readCheck(trip));
  useEffect(() => setState(readCheck(trip)), [trip]);

  const items = [
    { id: 'orders', text: `All ${plural(trip.stops.length, 'order')} are on board` },
    noteCount > 0
      ? { id: 'notes', text: `I read the loader's ${plural(noteCount, 'note')}` }
      : null,
    { id: 'paperwork', text: 'Delivery notes are in the cab' },
    { id: 'secure', text: 'Load is secured and the doors are locked' },
  ].filter((i): i is { id: string; text: string } => i !== null);

  const done = items.every((i) => state.ticked.includes(i.id));
  const toggle = (id: string) => {
    const ticked = state.ticked.includes(id)
      ? state.ticked.filter((t) => t !== id)
      : [...state.ticked, id];
    const allTicked = items.every((i) => ticked.includes(i.id));
    const next = {
      planVersion: trip.planVersion,
      ticked,
      doneAt: allTicked ? (state.doneAt ?? new Date().toISOString()) : null,
    };
    setState(next);
    saveCheck(trip.id, next);
  };

  return (
    <section
      className={`flex flex-col gap-3 rounded-card p-4 ${done ? 'bg-sage' : 'bg-surface'}`}
      aria-label="Load check"
    >
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[17px] font-semibold leading-[22px] text-ink">
          Load check before leaving
        </h2>
        <span
          className={`rounded-pill px-[10px] py-1 text-caption font-semibold leading-4 ${
            done ? 'bg-surface text-success' : 'bg-bg text-muted'
          }`}
        >
          {state.ticked.filter((t) => items.some((i) => i.id === t)).length}/{items.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((i) => {
          const on = state.ticked.includes(i.id);
          return (
            <li key={i.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(i.id)}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-input bg-bg px-3 py-2 text-left"
              >
                <span
                  aria-hidden
                  className={`flex size-6 shrink-0 items-center justify-center rounded-[7px] ${
                    on ? 'bg-olive-ink text-white' : 'bg-surface ring-1 ring-inset ring-mist'
                  }`}
                >
                  {on && <Icon name="check" size={15} />}
                </span>
                <span className="flex-1 text-[15px] font-medium leading-5 text-ink">{i.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {done ? (
        <p className="flex items-center gap-2 text-[14px] font-semibold leading-5 text-success">
          <Icon name="check" size={16} />
          Load checked
          {state.doneAt
            ? ` at ${new Date(state.doneAt).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}`
            : ''}{' '}
          · ready to leave
        </p>
      ) : (
        <p className="text-caption leading-4 text-muted">
          Tick each one at the vehicle. If something is wrong, tell the loader before you leave.
        </p>
      )}
    </section>
  );
}

// --- Loader notes ------------------------------------------------------------------------------

function LoaderNotes({ stops }: { stops: DriverDayStop[] }) {
  const withNotes = stops.filter((s) => (s.flags ?? []).length > 0 || s.urgentNote);
  return (
    <section className="flex flex-col gap-3 rounded-card bg-surface p-4" aria-label="Loader notes">
      <h2 className="text-[17px] font-semibold leading-[22px] text-ink">Loader notes</h2>
      {withNotes.length === 0 ? (
        <p className="text-[14px] leading-5 text-muted">
          No notes from the loader. Everything was loaded as planned.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {withNotes.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-1 rounded-input bg-warning-tint px-3 py-[10px]"
            >
              <p className="text-[14px] font-semibold leading-5 text-ink">
                Stop {s.sequence} · {s.outletName}
              </p>
              {s.urgentNote && (
                <p className="text-[13px] leading-[18px] text-ink">{s.urgentNote}</p>
              )}
              {(s.flags ?? []).map((f) => (
                <p
                  key={f.id}
                  className="flex items-start gap-2 text-[13px] leading-[18px] text-ink"
                >
                  <Icon name="alert" size={14} className="mt-[2px] shrink-0 text-warning" />
                  <span>
                    <span className="font-semibold">{flagText(f)}</span>
                    {f.note ? ` — ${f.note}` : ''}
                  </span>
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- Stops -------------------------------------------------------------------------------------

function StopCard({ stop, state }: { stop: DriverDayStop; state: 'done' | 'next' | 'later' }) {
  const others = (stop.phones ?? []).filter((p) => p.phoneNo !== stop.phone);
  const notes = (stop.flags ?? []).length + (stop.urgentNote ? 1 : 0);
  return (
    <li
      className={`flex flex-col gap-3 rounded-card p-4 ${
        state === 'next' ? 'bg-surface ring-2 ring-primary' : 'bg-surface'
      } ${state === 'done' ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[16px] font-semibold ${
            state === 'done'
              ? 'bg-olive-ink text-white'
              : state === 'next'
                ? 'bg-primary text-on-primary'
                : 'bg-bg text-ink'
          }`}
        >
          {state === 'done' ? <Icon name="check" size={16} /> : stop.sequence}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <p className="text-[16px] font-bold leading-[21px] text-ink">{stop.outletName}</p>
          <p className="text-[13px] font-medium leading-[17px] text-muted">
            {[
              `Window ${windowText(stop.windowStart, stop.windowEnd)}`,
              stop.eta != null ? `ETA ${clockText(stop.eta)}` : null,
              stop.address,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-pill px-[10px] py-1 text-caption font-semibold leading-4 ${
            state === 'done'
              ? 'bg-sage text-success'
              : state === 'next'
                ? 'bg-primary text-on-primary'
                : 'bg-bg text-muted'
          }`}
        >
          {state === 'done' ? 'Done' : state === 'next' ? 'Next' : 'Later'}
        </span>
      </div>

      {notes > 0 && state !== 'done' && (
        <p className="flex items-center gap-2 rounded-input bg-warning-tint px-3 py-2 text-[13px] font-medium leading-[18px] text-ink">
          <Icon name="alert" size={14} className="shrink-0 text-warning" />
          {plural(notes, 'loader note')} for this stop
        </p>
      )}

      {state !== 'done' && (
        <div className="flex flex-wrap gap-2">
          {stop.phone ? (
            <a
              href={telHref(stop.phone)}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-4 text-[15px] font-semibold leading-5 text-on-primary"
            >
              <Icon name="phone" size={16} />
              Call store
            </a>
          ) : (
            <span className="flex min-h-[48px] flex-1 items-center justify-center rounded-pill bg-bg px-4 text-[14px] font-medium text-muted">
              No phone number
            </span>
          )}
          <a
            href={mapsUrl(stop)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill border border-border bg-surface px-4 text-[15px] font-semibold leading-5 text-ink"
          >
            <Icon name="arrow-up-right" size={16} />
            Navigate
          </a>
        </div>
      )}
      {state === 'next' && (
        <Link
          href="/drive/next"
          className="flex min-h-[48px] items-center justify-center rounded-pill bg-olive-tint px-4 text-[15px] font-semibold leading-5 text-olive-ink"
        >
          Open next stop
        </Link>
      )}
      {state !== 'done' && stop.phone && (
        <p className="text-caption leading-4 text-muted">
          {stop.phone}
          {others.length > 0 && ' · '}
          {others.map((p, i) => (
            <span key={p.phoneNo}>
              {i > 0 && ' · '}
              <a href={telHref(p.phoneNo)} className="font-semibold text-slate underline">
                {PHONE_LABEL[p.label] ?? p.label} {p.phoneNo}
              </a>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

/** Figma "Driver / Trip overview": the stops, one-tap calls, loader notes and a load check before leaving. */
export function TripOverview() {
  const { day, trip: active, online } = useDriver();
  const full = fullDay(day);
  const trips = [...(full?.trips ?? [])].sort((a, b) => a.tripNumber - b.tripNumber);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const trip =
    trips.find((t) => t.id === pickedId) ?? trips.find((t) => t.id === active?.id) ?? trips[0];

  if (!trip) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[26px] font-semibold leading-8 text-ink">Your trip</h1>
        {!online && <OfflineBanner />}
        <p className="rounded-card bg-surface p-4 text-[15px] leading-5 text-muted">
          No trip for you today yet. Dispatch sends it here once it is planned.
        </p>
        <Link href="/drive" className="text-[15px] font-semibold text-slate">
          Back to home
        </Link>
      </div>
    );
  }

  const stops = [...trip.stops].sort((a, b) => a.sequence - b.sequence);
  const nextIdx = stops.findIndex((s) => !isStopDone(s.status));
  const doneCount = stops.filter((s) => isStopDone(s.status)).length;
  const noteCount = stops.reduce((n, s) => n + (s.flags ?? []).length + (s.urgentNote ? 1 : 0), 0);
  const atDepot = AT_DEPOT.has(trip.status);

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <header className="flex flex-col gap-1 pr-[111px]">
        <h1 className="text-[26px] font-semibold leading-8 text-ink lg:text-[32px] lg:leading-10">
          Trip {trip.tripNumber}
        </h1>
        <p className="text-[13px] font-medium leading-[17px] text-muted">
          {[
            full?.vehicle?.plate,
            vehicleLabel(full?.vehicle?.type),
            `${doneCount} of ${plural(stops.length, 'stop')} done`,
            atDepot ? 'at the depot' : trip.status === 'on_road' ? 'on the road' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {!online && <OfflineBanner />}

      {trips.length > 1 && (
        <div className="flex gap-1 rounded-pill bg-surface p-1" role="tablist" aria-label="Trips">
          {trips.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === trip.id}
              onClick={() => setPickedId(t.id)}
              className={`flex min-h-[44px] flex-1 items-center justify-center rounded-pill text-[15px] font-semibold ${
                t.id === trip.id ? 'bg-primary text-on-primary' : 'text-muted'
              }`}
            >
              Trip {t.tripNumber} · {plural(t.stops.length, 'stop')}
            </button>
          ))}
        </div>
      )}

      {/* Phone: load check (at the depot), then stops, then loader notes.
          Desktop: stops on the left; the check and the notes stacked on the right. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        {atDepot && (
          <div className="lg:col-start-2 lg:row-start-1">
            <LoadCheck trip={trip} noteCount={noteCount} />
          </div>
        )}
        <section
          className="flex flex-col gap-3 lg:col-start-1 lg:row-span-2 lg:row-start-1"
          aria-label="Stops"
        >
          <h2 className="text-[20px] font-semibold leading-[26px] text-ink">Stops</h2>
          <ol className="flex flex-col gap-3">
            {stops.map((s, i) => (
              <StopCard
                key={s.id}
                stop={s}
                state={isStopDone(s.status) ? 'done' : i === nextIdx ? 'next' : 'later'}
              />
            ))}
          </ol>
        </section>
        <div className={`lg:col-start-2 ${atDepot ? 'lg:row-start-2' : 'lg:row-start-1'}`}>
          <LoaderNotes stops={stops} />
        </div>
      </div>
    </div>
  );
}
