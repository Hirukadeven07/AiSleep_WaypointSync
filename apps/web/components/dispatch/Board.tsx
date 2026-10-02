'use client';

import { useState } from 'react';
import type { Brand, LiveTrip } from '@waypoint/contracts';
import { Icon, type IconName } from '@/components/ui/Icon';
import { dayLabel, kgText } from '@/components/plan/format';
import { BRAND_TAG, lastUpdate, timeOf, toneOf } from './live-format';
import { useLiveDay } from './useLiveDay';
import { useTripPanels } from './useTripPanels';

type Filter = 'all' | Brand | 'issues';
type ColumnId = 'assigned' | 'loading' | 'dispatched' | 'complete';

const kind = (t: LiveTrip) =>
  t.vehicleType === 'van' ? 'Van' : t.vehicleTemp === 'reefer' ? 'Refrigerated' : 'Ambient';
/** "Kasun Rathnayake" -> "Kasun R." */
const shortName = (name: string | null) => {
  if (!name) return 'No driver yet';
  const [first, ...rest] = name.split(' ');
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};
const tripName = (t: LiveTrip) =>
  t.tripsToday > 1
    ? `${t.plate ?? t.vehicleId} · Trip ${t.tripNumber} of ${t.tripsToday}`
    : (t.plate ?? t.vehicleId);

const COLUMNS: { id: ColumnId; title: string; dot: string; test: (t: LiveTrip) => boolean }[] = [
  {
    id: 'assigned',
    title: 'Assigned',
    dot: 'bg-faint',
    // Trips still being planned for today wait here with a "Planned" chip.
    test: (t) => t.live === 'assigned' || t.live === 'planned',
  },
  { id: 'loading', title: 'Loading', dot: 'bg-warning', test: (t) => t.live === 'loading' },
  {
    id: 'dispatched',
    title: 'Dispatched',
    dot: 'bg-blue',
    test: (t) => ['on_time', 'late', 'breakdown', 'not_synced'].includes(t.live),
  },
  { id: 'complete', title: 'Complete', dot: 'bg-success', test: (t) => t.live === 'completed' },
];

const FILTERS: { id: Filter; label: string; icon: IconName; circle: string; ink: string }[] = [
  { id: 'all', label: 'All trips', icon: 'grid', circle: 'bg-white/15', ink: 'text-bg' },
  { id: 'Fresh', label: 'Fresh', icon: 'pkg', circle: 'bg-fresh-tint', ink: 'text-fresh' },
  { id: 'Style', label: 'Style', icon: 'pkg', circle: 'bg-style-tint', ink: 'text-style' },
  { id: 'Tech', label: 'Tech', icon: 'pkg', circle: 'bg-tech-tint', ink: 'text-tech' },
  {
    id: 'issues',
    label: 'Has issues',
    icon: 'alert',
    circle: 'bg-danger-tint',
    ink: 'text-danger',
  },
];

function Card({
  trip,
  column,
  onOpen,
  onActions,
}: {
  trip: LiveTrip;
  column: ColumnId;
  onOpen: () => void;
  onActions: () => void;
}) {
  const tone = toneOf(trip);
  const pct = trip.stopsTotal > 0 ? (trip.stopsDone / trip.stopsTotal) * 100 : 0;
  const stops = `${trip.stopsTotal} ${trip.stopsTotal === 1 ? 'stop' : 'stops'}`;
  const prev = trip.previousTrip;
  const showTrack = column === 'dispatched';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={`flex shrink-0 cursor-pointer flex-col items-start gap-2 rounded-[18px] bg-surface p-[14px] text-left ${
        column === 'complete' ? 'opacity-85' : ''
      }`}
    >
      <p className="whitespace-nowrap text-[14px] font-semibold leading-5 text-ink">
        {tripName(trip)}
      </p>
      <p className="whitespace-nowrap text-[12px] leading-[17px] text-muted">
        {column === 'loading'
          ? `${trip.bay ? `Dock ${trip.bay.replace(/^\D*/, '') || trip.bay}` : 'Dock'} · ${shortName(trip.driverName)}`
          : `${shortName(trip.driverName)} · ${kind(trip)}`}
      </p>
      <span className="flex flex-wrap items-center gap-[6px]">
        <span
          className={`rounded-pill px-[10px] py-1 text-[12px] font-semibold leading-[15px] ${BRAND_TAG[trip.brand]}`}
        >
          {trip.brand}
        </span>
        {/* Assigned holds both: planned (not sent yet) and sent to the dock and driver. */}
        {column === 'assigned' && (
          <span
            className={`rounded-pill px-[10px] py-1 text-[12px] font-semibold leading-[15px] ${tone.chip}`}
          >
            {trip.live === 'planned' ? 'Planned · not sent' : 'Sent'}
          </span>
        )}
      </span>
      <p className="text-[12px] font-medium leading-[17px] text-muted">
        {column === 'dispatched' || column === 'complete'
          ? stops
          : `${stops} · ${kgText(trip.weightKg)} kg`}
      </p>

      {showTrack && (
        <>
          <span className="h-2 w-full max-w-[189px] overflow-hidden rounded-[4px] bg-bg">
            <span
              className={`block h-2 rounded-[4px] ${trip.live === 'breakdown' ? 'bg-danger' : 'bg-blue'}`}
              style={{ width: `${pct}%` }}
            />
          </span>
          <p className="whitespace-nowrap text-[12px] font-semibold leading-[15px] text-muted">
            {trip.stopsDone}/{trip.stopsTotal} delivered
            {trip.live === 'on_time' ? ' · on time' : ''}
          </p>
        </>
      )}
      {column === 'complete' && (
        <p className="-mt-1 text-[12px] font-medium leading-[17px] text-muted">
          {trip.stopsDone}/{trip.stopsTotal} delivered
          {trip.backAt ? ` · back ${timeOf(trip.backAt)}` : ''}
        </p>
      )}

      {column === 'loading' && trip.missingCount > 0 && (
        <span className="flex items-center gap-[6px] rounded-pill bg-warning/[0.12] px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] text-warning">
          <span aria-hidden className="size-[7px] rounded-full bg-current" />
          {trip.missingCount} {trip.missingCount === 1 ? 'carton' : 'cartons'} short
        </span>
      )}
      {column === 'dispatched' && ['late', 'breakdown', 'not_synced'].includes(trip.live) && (
        <span
          className={`flex items-center gap-[6px] rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${tone.chip}`}
        >
          <span aria-hidden className="size-[7px] rounded-full bg-current" />
          {trip.live === 'not_synced' ? `Not synced ${trip.notSyncedMin} min` : tone.label}
        </span>
      )}
      {column === 'dispatched' && trip.live === 'not_synced' && (
        <p className="text-[12px] leading-[17px] text-muted">{lastUpdate(trip)}</p>
      )}
      {column === 'dispatched' && ['on_time', 'late', 'not_synced'].includes(trip.live) && (
        <button
          type="button"
          aria-label="Vehicle actions"
          onClick={(e) => {
            e.stopPropagation();
            onActions();
          }}
          className="flex size-[30px] items-center justify-center rounded-full bg-info-tint text-slate"
        >
          <Icon name="truck" size={14} />
        </button>
      )}

      {(prev && (column === 'assigned' || column === 'loading')) ||
      (column === 'dispatched' && trip.nextTrip) ? (
        <>
          <span className="h-px w-full bg-border" />
          <p className="whitespace-nowrap text-left text-[12px] font-semibold leading-[15px] text-muted">
            {column === 'dispatched' && trip.nextTrip
              ? `Next: Trip ${trip.nextTrip.tripNumber} · ${trip.nextTrip.stops} ${trip.nextTrip.stops === 1 ? 'stop' : 'stops'}`
              : prev
                ? column === 'loading'
                  ? `Trip ${prev.tripNumber} done · ${prev.delivered}/${prev.total} delivered${prev.backAt ? `, back ${timeOf(prev.backAt)}` : ''}`
                  : `Trip ${prev.tripNumber} done${prev.backAt ? ` · back at depot ${timeOf(prev.backAt)}` : ''}`
                : null}
          </p>
        </>
      ) : null}
    </div>
  );
}

/** Figma "Dispatch board": today's (or tomorrow's) trips in four columns, from assigned to complete. */
export function Board() {
  const { day, error } = useLiveDay();
  const panels = useTripPanels(day);
  const [filter, setFilter] = useState<Filter>('all');
  const [allOnTime, setAllOnTime] = useState(false);
  const [when, setWhen] = useState<'today' | 'tomorrow'>('today');

  if (!day) {
    return (
      <p className="px-3 pt-5 text-body text-muted" role="status">
        {error ? 'The board could not be loaded.' : 'Loading the board…'}
      </p>
    );
  }

  // On the board, a late trip counts as having an issue (on the live day, "Late" is its own filter).
  const hasIssue = (t: LiveTrip) => t.hasIssue || t.live === 'late';
  // Tomorrow shows what Planning made: planned trips, then assigned once the plan is published.
  const source = when === 'today' ? day.trips : day.tomorrowTrips;
  const issues = source.filter(hasIssue).length;
  const visible = source.filter((t) =>
    filter === 'all' ? true : filter === 'issues' ? hasIssue(t) : t.brand === filter,
  );

  return (
    <div className="flex flex-col gap-[18px] px-1 pt-5 lg:-mb-6 lg:h-[calc(100vh-32px)] lg:pb-5">
      <header className="flex shrink-0 flex-wrap items-end gap-[10px]">
        <div className="flex min-w-px flex-1 flex-col gap-[6px]">
          <h1 className="whitespace-nowrap text-[40px] font-medium leading-[46px] text-ink">
            Dispatch board
          </h1>
          <p className="whitespace-nowrap text-[14px] leading-5 text-muted">
            {when === 'today'
              ? `Today · ${dayLabel(day.date)} · ${day.vehiclesWorking} ${day.vehiclesWorking === 1 ? 'vehicle' : 'vehicles'} working`
              : `Tomorrow · ${dayLabel(day.tomorrow.date)} · ${source.length} ${source.length === 1 ? 'trip' : 'trips'} planned`}
          </p>
        </div>
        <div className="flex gap-1 rounded-pill bg-surface p-1" role="tablist" aria-label="Day">
          {(
            [
              ['today', `Today · ${day.trips.length}`],
              ['tomorrow', `Tomorrow · ${day.tomorrowTrips.length}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={when === id}
              onClick={() => setWhen(id)}
              className={`whitespace-nowrap rounded-pill px-4 py-2 text-[13px] font-semibold leading-[18px] ${
                when === id ? 'bg-primary text-bg' : 'text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap gap-[10px]">
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-pill py-[6px] pl-[6px] pr-4 text-[13px] font-semibold leading-[18px] ${
                on ? 'bg-primary text-bg' : 'bg-surface text-ink'
              }`}
            >
              <span
                className={`flex size-[30px] items-center justify-center rounded-full ${on ? 'bg-white/15 text-bg' : `${f.circle} ${f.ink}`}`}
              >
                <Icon name={f.icon} size={15} />
              </span>
              {f.id === 'issues' ? `${f.label} · ${issues}` : f.label}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-[420px] flex-1 flex-col gap-[14px] lg:min-h-0 lg:flex-row">
        {COLUMNS.map((col) => {
          const trips = visible.filter(col.test);
          // Dispatched: every trip with a problem, plus the first on-time one; the rest fold away.
          const folded =
            col.id === 'dispatched' && !allOnTime
              ? trips.filter((t) => t.live === 'on_time').slice(1)
              : [];
          const shown = trips.filter((t) => !folded.includes(t));
          return (
            <section
              key={col.id}
              className="flex min-w-px flex-1 flex-col gap-[10px] overflow-y-auto rounded-card bg-border p-[14px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex shrink-0 items-center gap-2 p-1">
                <span aria-hidden className={`size-[9px] rounded-full ${col.dot}`} />
                <h2 className="min-w-px flex-1 text-[14px] font-semibold leading-5 text-ink">
                  {col.title}
                </h2>
                <span className="rounded-pill bg-surface px-[10px] py-1 text-[12px] font-semibold leading-[15px] text-ink">
                  {trips.length}
                </span>
              </div>
              {shown.map((t) => (
                <Card
                  key={t.id}
                  trip={t}
                  column={col.id}
                  onOpen={() => panels.openTrip(t.id)}
                  onActions={() => panels.openActions(t.id)}
                />
              ))}
              {folded.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAllOnTime(true)}
                  className="shrink-0 self-start text-[12px] font-semibold leading-[17px] text-slate"
                >
                  + {folded.length} more on time
                </button>
              )}
              {trips.length === 0 && (
                <p className="px-1 text-[12px] leading-[17px] text-muted">No trips here.</p>
              )}
            </section>
          );
        })}
      </div>
      {panels.element}
    </div>
  );
}
