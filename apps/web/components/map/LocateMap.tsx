'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Brand, LocateMap as LocateMapData, LocateStop, LocateTrip } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { clock12, dayLabel } from '@/components/plan/format';
import { timeOf, toneOf } from '@/components/dispatch/live-format';
import { districtTone } from './districts';
import { IslandMap, type IslandMapHandle, type IslandMarker, type MapView } from './IslandMap';
import { MapControls } from './MapControls';

const BRANDS: { id: 'all' | Brand; label: string; className: string }[] = [
  { id: 'all', label: 'All', className: 'bg-ink text-bg' },
  { id: 'Fresh', label: 'Fresh', className: 'bg-fresh-tint text-fresh' },
  { id: 'Style', label: 'Style', className: 'bg-style-tint text-style' },
  { id: 'Tech', label: 'Tech', className: 'bg-tech-tint text-tech' },
];

const ORDER_DOT: Record<Brand, string> = {
  Fresh: 'bg-fresh',
  Style: 'bg-style',
  Tech: 'bg-tech',
};

const STOP_DOT: Record<LocateStop['kind'], string> = {
  delivered: 'bg-success',
  next: 'bg-ink',
  upcoming: 'border-2 border-ink bg-surface',
  at_risk: 'bg-warning',
};

/** Today's drivers, each placed on the last store they arrived at. */
export function LocateMap() {
  const mapRef = useRef<IslandMapHandle>(null);
  const [data, setData] = useState<LocateMapData | null>(null);
  const [error, setError] = useState(false);
  const [depotId, setDepotId] = useState<string | null>(null);
  const [brand, setBrand] = useState<(typeof BRANDS)[number]['id']>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setError(false);
    const query = depotId ? `?depot=${encodeURIComponent(depotId)}` : '';
    api<LocateMapData>(`/dispatch/map${query}`)
      .then((next) => {
        if (cancel) return;
        setData(next);
        setDepotId((current) => current ?? next.depotId);
      })
      .catch(() => {
        if (!cancel) setError(true);
      });
    return () => {
      cancel = true;
    };
  }, [depotId]);

  const tones = useMemo(() => {
    const map = new Map<string, ReturnType<typeof districtTone>>();
    for (const district of data?.districts ?? []) {
      map.set(district.name, districtTone(district, data?.depotId ?? ''));
    }
    return map;
  }, [data]);

  const activeNames = useMemo(
    () =>
      (data?.districts ?? [])
        .filter((district) => districtTone(district, data?.depotId ?? '') === 'active')
        .map((district) => district.name),
    [data],
  );

  const trips = useMemo(
    () => (data?.trips ?? []).filter((trip) => brand === 'all' || trip.brand === brand),
    [data, brand],
  );
  const selected = trips.find((trip) => trip.id === selectedId) ?? null;

  const view = useMemo<MapView>(() => {
    const last = selected?.lastStop;
    if (last?.lat != null && last.lng != null) return { mode: 'point', lng: last.lng, lat: last.lat };
    return { mode: 'bounds', names: activeNames };
  }, [selected, activeNames]);

  const markers = useMemo<IslandMarker[]>(() => {
    if (!data) return [];
    const covered = new Set<string>();
    if (selected) {
      for (const stop of selected.stops) {
        if (stop.lat == null || stop.lng == null) continue;
        covered.add(`${stop.lat},${stop.lng}`);
      }
    }
    const pins: IslandMarker[] = [];
    for (const store of data.stores ?? []) {
      if (brand !== 'all' && store.brand !== brand) continue;
      if (covered.has(`${store.lat},${store.lng}`)) continue;
      pins.push({
        id: `store:${store.storeId}`,
        lat: store.lat,
        lng: store.lng,
        dotClass: store.hasOrder ? ORDER_DOT[store.brand] : 'bg-faint',
        title: store.hasOrder ? `${store.storeName} · has an order` : `${store.storeName} · no order`,
        size: 'pin',
      });
    }
    for (const depot of data.depots) {
      pins.push({
        id: `depot:${depot.id}`,
        lat: depot.lat,
        lng: depot.lng,
        dotClass: 'bg-ink',
        title: `${depot.name} depot`,
        size: 'depot',
      });
    }
    if (!selected) return pins;
    for (const stop of selected.stops) {
      if (stop.lat == null || stop.lng == null) continue;
      if (selected.lastStop?.stopId === stop.id) continue;
      pins.push({
        id: stop.id,
        lat: stop.lat,
        lng: stop.lng,
        dotClass: STOP_DOT[stop.kind],
        title: stop.storeName,
        size: 'pin',
      });
    }
    const last = selected.lastStop;
    if (last?.lat != null && last.lng != null) {
      pins.push({
        id: last.stopId,
        lat: last.lat,
        lng: last.lng,
        dotClass: 'bg-ink',
        title: last.storeName,
        caption: 'Last confirmed stop',
        size: 'vehicle',
        selected: true,
      });
    }
    return pins;
  }, [data, selected, brand]);

  function chooseDepot(id: string) {
    setSelectedId(null);
    setDepotId(id);
  }

  return (
    <div className="flex h-[calc(100vh-72px)] min-h-[640px] flex-col gap-3 pt-2">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[34px] font-medium leading-10 text-ink">Live map</h1>
          <p className="text-[14px] leading-5 text-muted">
            {data
              ? `${dayLabel(data.date)}  ·  ${data.depotId} depot  ·  positions update at each completed stop`
              : 'Positions update at each completed stop'}
          </p>
        </div>
        {data && data.depots.length > 0 && (
          <label className="flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-ink">
            <Icon name="pin" size={14} />
            <select
              aria-label="Depot"
              className="bg-transparent outline-none"
              value={depotId ?? data.depotId}
              onChange={(event) => chooseDepot(event.target.value)}
            >
              {data.depots.map((depot) => (
                <option key={depot.id} value={depot.id}>
                  {depot.name} depot
                </option>
              ))}
            </select>
          </label>
        )}
        {data && (
          <span className="flex items-center gap-[6px] rounded-pill bg-success/[0.12] px-[10px] py-[5px] text-[12px] font-semibold text-success">
            <span aria-hidden className="size-[7px] rounded-full bg-current" />
            Live · updated {timeOf(data.asOf)}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <section className="relative h-full min-h-[420px] flex-1 overflow-hidden rounded-card bg-peek">
          {error && (
            <p className="p-6 text-body text-muted" role="status">
              The map could not be loaded.
            </p>
          )}
          {!error && !data && (
            <p className="p-6 text-body text-muted" role="status">
              Loading the map…
            </p>
          )}
          {data && (
            <IslandMap
              ref={mapRef}
              tones={tones}
              view={view}
              markers={markers}
              onMarker={(id) => {
                if (id.startsWith('depot:')) chooseDepot(id.slice('depot:'.length));
              }}
            />
          )}
          <LocateLegend />
          <MapControls mapRef={mapRef} />
          {selected?.lastStop && (
            <article className="absolute left-4 top-4 w-[240px] rounded-card bg-surface p-4 shadow-raised">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Last confirmed stop
              </p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{selected.lastStop.storeName}</p>
              <p className="mt-1 text-[13px] text-muted">
                {selected.plate ?? selected.vehicleId} · arrived {timeOf(selected.lastStop.arrivedAt)}
              </p>
              <p className="mt-2 text-[12px] leading-4 text-muted">
                This is the last store the driver reached, not a live position.
              </p>
            </article>
          )}
        </section>

        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[320px]">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-[18px] font-semibold text-ink">On the road now</h2>
          </div>
          <div className="flex gap-2">
            {BRANDS.map((item) => {
              const on = brand === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setBrand(item.id)}
                  className={`rounded-pill px-3 py-1 text-[12px] font-semibold ${on ? item.className : 'bg-bg text-ink'}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
            <li className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-success" /> On time
            </li>
            <li className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-warning" /> Late
            </li>
            <li className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-danger" /> At risk
            </li>
            <li className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-faint" /> Not synced
            </li>
          </ul>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-card bg-surface p-3">
            {!data && !error && <p className="px-2 py-6 text-[13px] text-muted">Loading trips…</p>}
            {data && trips.length === 0 && <EmptyRoad data={data} />}
            <ul className="flex flex-col gap-2">
              {trips.map((trip) => (
                <TripButton
                  key={trip.id}
                  trip={trip}
                  selected={trip.id === selectedId}
                  onSelect={() => setSelectedId(trip.id === selectedId ? null : trip.id)}
                />
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TripButton({
  trip,
  selected,
  onSelect,
}: {
  trip: LocateTrip;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = toneOf(trip);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`w-full rounded-input px-3 py-3 text-left ${selected ? 'bg-wash ring-1 ring-ink' : 'bg-bg'}`}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
            {trip.plate ?? trip.vehicleId}
            {trip.driverName ? ` · ${trip.driverName}` : ''}
          </span>
          <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}>
            {tone.label}
          </span>
        </span>
        <span className="mt-1 block text-[12px] text-muted">
          {trip.brand} · {trip.district} · {trip.stopsDone}/{trip.stopsTotal} stops
        </span>
        <span className="mt-1 block text-[12px] text-ink">
          {trip.lastStop ? `Last stop ${trip.lastStop.storeName}` : 'No stop confirmed yet'}
        </span>
      </button>
    </li>
  );
}

function EmptyRoad({ data }: { data: LocateMapData }) {
  const when =
    data.firstDepartMin != null && data.firstDepartBrand
      ? `The first ${data.firstDepartBrand} run leaves at ${clock12(data.firstDepartMin)}.`
      : 'Nothing has left the depot yet.';
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-bg text-muted">
        <Icon name="truck" size={22} />
      </span>
      <p className="text-[15px] font-semibold text-ink">No trips on the road right now</p>
      <p className="mt-1 text-[13px] leading-5 text-muted">{when}</p>
    </div>
  );
}

function LocateLegend() {
  const row = 'flex items-center gap-2 text-[12px] leading-4 text-ink';
  return (
    <div className="absolute bottom-4 left-4 w-[230px] rounded-card bg-surface p-3 shadow">
      <p className="mb-2 text-[12px] font-semibold text-muted">Legend</p>
      <ul className="flex flex-col gap-1.5">
        <li className={row}>
          <span className="size-2.5 rounded-full bg-fresh" /> Store with an order
        </li>
        <li className={row}>
          <span className="size-2.5 rounded-full bg-faint" /> Store with no order
        </li>
        <li className={row}>
          <span className="size-3 rounded-[4px] bg-ink" /> Depot
        </li>
        <li className={row}>
          <span className="size-3 rounded-full bg-ink ring-2 ring-ink ring-offset-1" /> Vehicle (last
          confirmed stop)
        </li>
        <li className={row}>
          <span className="size-2.5 rounded-full bg-success" /> Delivered stop
        </li>
        <li className={row}>
          <span className="size-2.5 rounded-full bg-ink" /> Next stop
        </li>
        <li className={row}>
          <span className="size-2.5 rounded-full border-2 border-ink bg-surface" /> Upcoming stop
        </li>
        <li className={row}>
          <span className="size-2.5 rounded-full bg-warning" /> At-risk stop
        </li>
        <li className={row}>
          <span className="size-3 rounded-[3px] bg-mist" /> Served by the other depot
        </li>
        <li className={row}>
          <span className="size-3 rounded-[3px] bg-slate" /> Area not served
        </li>
      </ul>
      <p className="mt-2 text-[10px] leading-3 text-muted">Map data © OpenStreetMap · Boundaries © geoBoundaries</p>
    </div>
  );
}
