'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlanMap as PlanMapData, PlanMapPin, UnplacedStore } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { m3Text, orderWindow } from '@/components/plan/format';
import { districtTone } from './districts';
import { IslandMap, type IslandMapHandle, type IslandMarker, type MapView } from './IslandMap';
import { MapControls } from './MapControls';

const DOT: Record<PlanMapPin['brand'], string> = {
  Fresh: 'bg-fresh',
  Style: 'bg-style',
  Tech: 'bg-tech',
};

/** Tomorrow's stores on the island. Grey pins are already on a trip. */
export function PlanMap({
  date,
  refreshKey,
  onOpenOrder,
}: {
  date: string;
  refreshKey: string;
  onOpenOrder: (orderId: string) => void;
}) {
  const mapRef = useRef<IslandMapHandle>(null);
  const [data, setData] = useState<PlanMapData | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<UnplacedStore | null>(null);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setError(false);
    api<PlanMapData>(`/plan/map?date=${date}`)
      .then((next) => {
        if (!cancel) setData(next);
      })
      .catch(() => {
        if (!cancel) setError(true);
      });
    return () => {
      cancel = true;
    };
  }, [date, refreshKey]);

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

  const selected = data?.pins.find((pin) => pin.orderId === selectedId) ?? null;

  const view = useMemo<MapView>(() => {
    if (selected) return { mode: 'point', lng: selected.lng, lat: selected.lat };
    return { mode: 'bounds', names: activeNames };
  }, [selected, activeNames]);

  const markers = useMemo<IslandMarker[]>(() => {
    if (!data) return [];
    const pins: IslandMarker[] = data.pins.map((pin) => ({
      id: pin.orderId,
      lat: pin.lat,
      lng: pin.lng,
      dotClass: pin.plate ? 'bg-faint' : DOT[pin.brand],
      title: pin.storeName,
      badges: [...(pin.chilled ? ['C'] : []), ...(pin.vanOnly ? ['V'] : [])],
      selected: pin.orderId === selectedId,
      size: 'pin',
    }));
    if (data.depot) {
      pins.push({
        id: `depot:${data.depot.id}`,
        lat: data.depot.lat,
        lng: data.depot.lng,
        dotClass: 'bg-ink',
        title: `${data.depot.name} depot`,
        size: 'depot',
      });
    }
    if (draft) {
      pins.push({
        id: 'draft',
        lat: draft.lat,
        lng: draft.lng,
        dotClass: 'bg-ink',
        title: placing?.storeName ?? 'New location',
        selected: true,
        size: 'pin',
      });
    }
    return pins;
  }, [data, selectedId, draft, placing]);

  function startPlace(store: UnplacedStore, at?: { lat: number; lng: number }) {
    setSelectedId(null);
    setPlacing(store);
    setDraft(at ?? null);
    setPlaceError(null);
  }

  async function savePlace() {
    if (!placing || !draft) return;
    setSaving(true);
    setPlaceError(null);
    try {
      await api(`/plan/stores/${encodeURIComponent(placing.storeId)}/location`, {
        method: 'POST',
        body: draft,
      });
      setPlacing(null);
      setDraft(null);
      const next = await api<PlanMapData>(`/plan/map?date=${date}`);
      setData(next);
    } catch {
      setPlaceError('That point could not be saved. Click on the island and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="relative h-full min-h-[480px] flex-1 overflow-hidden rounded-card bg-peek">
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
          picking={placing != null}
          onPick={(lng, lat) => setDraft({ lng, lat })}
          onMarker={(id) => {
            if (placing || id.startsWith('depot:') || id === 'draft') return;
            setSelectedId(id);
          }}
        />
      )}
      <Legend />
      <MapControls mapRef={mapRef} />
      {selected && (
        <article className="absolute left-4 top-4 w-[240px] rounded-card bg-surface p-4 shadow-raised">
          <p className="text-[15px] font-semibold leading-5 text-ink">{selected.storeName}</p>
          <p className="mt-1 text-[13px] leading-[18px] text-muted">
            {selected.brand} · {selected.district}
          </p>
          <p className="mt-1 text-[13px] leading-[18px] text-muted">
            {orderWindow(selected)} · {selected.weightKg} kg · {m3Text(selected.volumeM3)} m³
          </p>
          <p className="mt-2 text-[13px] font-semibold leading-[18px] text-ink">
            {selected.plate
              ? `Already on ${selected.plate.vehiclePlate ?? 'a trip'} · Trip ${selected.plate.tripNumber}`
              : 'Waiting'}
            {selected.chilled ? ' · Chilled' : ''}
            {selected.vanOnly ? ' · Van only' : ''}
          </p>
          <button
            type="button"
            onClick={() => onOpenOrder(selected.orderId)}
            className="mt-3 text-[13px] font-semibold text-slate"
          >
            Open order
          </button>
          <button
            type="button"
            onClick={() =>
              startPlace(
                {
                  orderId: selected.orderId,
                  storeId: selected.storeId,
                  storeName: selected.storeName,
                  district: selected.district,
                },
                { lat: selected.lat, lng: selected.lng },
              )
            }
            className="mt-2 block text-[13px] font-semibold text-slate"
          >
            Move on map
          </button>
        </article>
      )}
      {placing && (
        <article className="absolute left-4 top-4 w-[240px] rounded-card bg-surface p-4 shadow-raised">
          <p className="text-[15px] font-semibold leading-5 text-ink">Place {placing.storeName}</p>
          <p className="mt-1 text-[13px] leading-[18px] text-muted">
            Click the map where this store is. {placing.district}
          </p>
          <p className="mt-2 text-[13px] font-semibold text-ink">
            {draft ? `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}` : 'No point yet'}
          </p>
          {placeError && <p className="mt-2 text-[12px] font-semibold text-danger">{placeError}</p>}
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={!draft || saving}
              onClick={() => void savePlace()}
              className="text-[13px] font-semibold text-slate disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save location'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlacing(null);
                setDraft(null);
                setPlaceError(null);
              }}
              className="text-[13px] font-semibold text-muted"
            >
              Cancel
            </button>
          </div>
        </article>
      )}
      {!placing && !selected && data && data.unplacedStores.length > 0 && (
        <div className="absolute left-4 top-4 max-h-[220px] w-[220px] overflow-auto rounded-card bg-surface p-3 shadow">
          <p className="text-[12px] font-semibold text-muted">
            {data.unplacedStores.length}{' '}
            {data.unplacedStores.length === 1 ? 'store needs' : 'stores need'} a location
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {data.unplacedStores.map((store) => (
              <li key={store.storeId}>
                <button
                  type="button"
                  onClick={() => startPlace(store)}
                  className="text-left text-[13px] font-semibold text-ink"
                >
                  {store.storeName}
                  <span className="block text-[11px] font-medium text-muted">{store.district}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Legend() {
  const row = 'flex items-center gap-2 text-[12px] leading-4 text-ink';
  return (
    <div className="absolute bottom-4 left-4 w-[200px] rounded-card bg-surface p-3 shadow">
      <p className="mb-2 text-[12px] font-semibold text-muted">Legend</p>
      <ul className="flex flex-col gap-1.5">
        <li className={row}>
          <span className="size-2.5 rounded-full bg-fresh" /> Fresh
        </li>
        <li className={row}>
          <span className="size-2.5 rounded-full bg-style" /> Style
        </li>
        <li className={row}>
          <span className="size-2.5 rounded-full bg-tech" /> Tech
        </li>
        <li className={row}>
          <span className="size-2.5 rounded-full bg-faint" /> Already on a trip
        </li>
        <li className={row}>
          <span className="flex size-3.5 items-center justify-center rounded-full bg-chilled text-[8px] font-bold text-surface">
            C
          </span>
          Chilled
        </li>
        <li className={row}>
          <span className="flex size-3.5 items-center justify-center rounded-full bg-ink text-[8px] font-bold text-surface">
            V
          </span>
          Van only
        </li>
      </ul>
      <p className="mt-2 text-[10px] leading-3 text-muted">Map data © OpenStreetMap · Boundaries © geoBoundaries</p>
    </div>
  );
}
