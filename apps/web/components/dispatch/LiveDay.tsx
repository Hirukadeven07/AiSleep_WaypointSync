'use client';

import { useState } from 'react';
import type { LiveDay as LiveDayData, LiveTrip } from '@waypoint/contracts';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useSession } from '@/lib/session';
import { dayLabel } from '@/components/plan/format';
import { GlancePanel } from './GlancePanel';
import { useLiveDay } from './useLiveDay';
import { useTripPanels } from './useTripPanels';
import { BRAND_TAG, firstName, greeting, lastUpdate, time12, timeOf, toneOf } from './live-format';
import { depotLabel } from '@/lib/depots';

type Filter = 'all' | 'on_time' | 'late' | 'issue' | 'done';

const FILTERS: {
  id: Filter;
  label: string;
  count: (d: LiveDayData) => number;
  test: (t: LiveTrip) => boolean;
}[] = [
  { id: 'all', label: 'All', count: (d) => d.counts.all, test: () => true },
  {
    id: 'on_time',
    label: 'On time',
    count: (d) => d.counts.onTime,
    test: (t) => t.live === 'on_time',
  },
  { id: 'late', label: 'Late', count: (d) => d.counts.late, test: (t) => t.live === 'late' },
  { id: 'issue', label: 'Issue', count: (d) => d.counts.issue, test: (t) => t.hasIssue },
  { id: 'done', label: 'Done', count: (d) => d.counts.done, test: (t) => t.live === 'completed' },
];

function Kpi({
  tint,
  icon,
  value,
  title,
  sub,
}: {
  tint: string;
  icon: IconName;
  value: number;
  title: string;
  sub: string;
}) {
  return (
    <div
      className={`flex min-w-px flex-1 flex-col items-start gap-[10px] rounded-card p-5 ${tint}`}
    >
      <span className="flex size-10 items-center justify-center rounded-[20px] bg-surface text-ink">
        <Icon name={icon} size={18} />
      </span>
      <p className="text-[34px] font-semibold leading-[38px] text-ink">{value}</p>
      <p className="text-[14px] font-semibold leading-5 text-ink">{title}</p>
      <p className="text-[12px] leading-[17px] text-muted">{sub}</p>
    </div>
  );
}

function TripRow({
  trip,
  zebra,
  onOpen,
  onActions,
}: {
  trip: LiveTrip;
  zebra: boolean;
  onOpen: () => void;
  onActions: () => void;
}) {
  const tone = toneOf(trip);
  const pct = trip.stopsTotal > 0 ? (trip.stopsDone / trip.stopsTotal) * 100 : 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-input p-3 ${zebra ? 'bg-wash' : ''}`}
    >
      <div className="flex w-[200px] shrink-0 flex-col gap-px overflow-hidden whitespace-nowrap">
        <p className="text-[14px] font-semibold leading-5 text-ink">
          {trip.plate ?? trip.vehicleId} · Trip {trip.tripNumber}
        </p>
        <p className="text-[12px] leading-[17px] text-muted">
          {trip.driverName ?? 'No driver yet'}
        </p>
      </div>
      <div className="flex w-[140px] shrink-0 items-center gap-[6px] overflow-hidden">
        <span
          className={`rounded-pill px-[10px] py-1 text-[12px] font-semibold leading-[15px] ${BRAND_TAG[trip.brand]}`}
        >
          {trip.brand}
        </span>
        <span className="whitespace-nowrap text-[12px] leading-[17px] text-muted">
          {trip.district}
        </span>
      </div>
      <div className="flex min-w-[150px] max-w-[280px] flex-1 items-center gap-[10px]">
        <span className="h-2 min-w-[40px] flex-1 overflow-hidden rounded-[4px] bg-bg">
          <span className={`block h-2 rounded-[4px] ${tone.fill}`} style={{ width: `${pct}%` }} />
        </span>
        <span className="whitespace-nowrap text-[12px] font-semibold leading-[17px] text-ink">
          {trip.stopsDone}/{trip.stopsTotal} stops
        </span>
      </div>
      <div className="flex w-[110px] shrink-0">
        <span
          className={`flex items-center gap-[6px] whitespace-nowrap rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${tone.chip}`}
        >
          <span aria-hidden className="size-[7px] rounded-full bg-current" />
          {tone.label}
        </span>
      </div>
      <div className="min-w-[160px] flex-1 truncate text-[12px] leading-[17px] text-muted">
        {lastUpdate(trip)}
      </div>
      <div className="flex h-[38px] w-[44px] shrink-0 items-center justify-center">
        {(trip.live === 'late' || trip.live === 'not_synced') && (
          <button
            type="button"
            aria-label="Vehicle actions"
            onClick={(e) => {
              e.stopPropagation();
              onActions();
            }}
            className="flex size-8 items-center justify-center rounded-full bg-info-tint text-slate"
          >
            <Icon name="truck" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Figma "Home / Live day": greeting, four numbers, today's trips, and the side panel. */
export function LiveDay() {
  const { me } = useSession();
  const { day, error } = useLiveDay();
  const panels = useTripPanels(day);
  const [filter, setFilter] = useState<Filter>('all');
  const [when, setWhen] = useState<'today' | 'tomorrow'>('today');

  if (!day) {
    return (
      <p className="px-3 pt-5 text-body text-muted" role="status">
        {error ? 'The live day could not be loaded.' : 'Loading the live day…'}
      </p>
    );
  }

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  // Tomorrow lists what Planning has made so far; the live filters only apply to today.
  const rows = when === 'today' ? day.trips.filter(active.test) : day.tomorrowTrips;
  const k = day.kpis;

  return (
    <div className="flex flex-col gap-4 lg:-mb-6 lg:-mr-2 lg:h-[calc(100vh-32px)] lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] pl-1 pr-3 pt-5 lg:min-h-0 lg:pb-5">
        <header className="flex shrink-0 items-end gap-[10px]">
          <div className="flex min-w-px flex-1 flex-col gap-[6px]">
            <h1 className="whitespace-nowrap text-[40px] font-medium leading-[46px] text-ink">
              {greeting(day.asOf)}
              {me ? `, ${firstName(me.name)}` : ''}
            </h1>
            <p className="whitespace-pre text-[14px] leading-5 text-muted">
              {`${dayLabel(day.date)}  ·  ${depotLabel(day.depotId)}${day.liveSince ? `  ·  Live since ${time12(day.liveSince)}` : ''}`}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-[6px] rounded-pill bg-success/[0.12] px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] text-success">
            <span aria-hidden className="size-[7px] rounded-full bg-current" />
            Live · updated {timeOf(day.asOf)}
          </span>
        </header>

        <section className="flex shrink-0 gap-[14px]">
          <Kpi
            tint="bg-peek"
            icon="truck"
            value={k.tripsOnRoad}
            title="Trips on the road"
            sub={`of ${k.dispatched} dispatched`}
          />
          <Kpi
            tint="bg-olive-tint"
            icon="check"
            value={k.deliveriesDone}
            title="Deliveries done"
            sub={`of ${k.deliveriesTotal} today`}
          />
          <Kpi
            tint="bg-warning-tint"
            icon="clock"
            value={k.late}
            title="Running late"
            sub={k.late > 0 ? `avg ${k.avgLateMin} min behind` : 'nobody behind'}
          />
          <Kpi
            tint="bg-style-tint"
            icon="alert"
            value={k.openIncidents}
            title="Open incidents"
            sub={k.incidentsText || 'none open'}
          />
        </section>

        <section className="flex min-h-[280px] flex-1 flex-col gap-1 overflow-y-auto rounded-card bg-surface p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex shrink-0 items-center gap-2">
            <h2 className="text-[18px] font-semibold leading-[25px] text-ink">
              {when === 'today' ? 'Trips today' : 'Trips tomorrow'}
            </h2>
            <div className="flex gap-1 rounded-pill bg-bg p-1" role="tablist" aria-label="Day">
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
                  className={`whitespace-nowrap rounded-pill px-[10px] py-1 text-[12px] font-semibold leading-[15px] ${
                    when === id ? 'bg-surface text-ink' : 'text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="min-w-px flex-1" />
            {when === 'today' &&
              FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`rounded-pill px-[10px] py-1 text-[12px] font-semibold leading-[15px] ${
                    filter === f.id ? 'bg-primary text-on-primary' : 'bg-bg text-ink'
                  }`}
                >
                  {f.label} {f.count(day)}
                </button>
              ))}
          </div>
          <div className="h-2 shrink-0" />
          <div className="flex shrink-0 gap-2 px-3 py-2 text-[12px] font-bold leading-[15px] tracking-[0.6px] text-muted">
            <p className="w-[200px] shrink-0">VEHICLE &amp; DRIVER</p>
            <p className="w-[140px] shrink-0">BRAND · AREA</p>
            <p className="min-w-[150px] max-w-[280px] flex-1">PROGRESS</p>
            <p className="w-[110px] shrink-0">STATUS</p>
            <p className="min-w-[160px] flex-1">LAST UPDATE</p>
            <p className="w-[44px] shrink-0" />
          </div>
          {rows.length === 0 && (
            <p className="px-3 py-6 text-[13px] text-muted">
              {when === 'today'
                ? 'No trips in this view.'
                : 'No trips planned for tomorrow yet. Create them in Planning.'}
            </p>
          )}
          {rows.map((t, i) => (
            <TripRow
              key={t.id}
              trip={t}
              zebra={i % 2 === 0}
              onOpen={() => panels.openTrip(t.id)}
              onActions={() => panels.openActions(t.id)}
            />
          ))}
        </section>
      </div>

      <GlancePanel day={day} className="lg:w-[340px] lg:shrink-0" />
      {panels.element}
    </div>
  );
}
