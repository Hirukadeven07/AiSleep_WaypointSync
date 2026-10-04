'use client';

import { useEffect, useState } from 'react';
import type { Brand, NewTripOptions, PlanTrip } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { DistrictPicker } from './DistrictPicker';
import { Modal, ModalIcon, OutlineButton, SolidButton } from './Modal';
import type { PlanEdit } from './usePlanEdit';

const BRANDS: { brand: Brand; on: string; off: string }[] = [
  { brand: 'Fresh', on: 'bg-fresh text-white', off: 'bg-fresh-tint text-fresh' },
  { brand: 'Style', on: 'bg-style text-white', off: 'bg-style-tint text-style' },
  { brand: 'Tech', on: 'bg-tech text-white', off: 'bg-tech-tint text-tech' },
];

function Radio({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
        on ? 'border-slate' : 'border-mist'
      }`}
    >
      {on && <span className="size-[8px] rounded-full bg-slate" />}
    </span>
  );
}

/** Figma "Plan v2 / New trip": pick a run, a free vehicle, a brand and one or more districts. */
export function NewTripModal({ date, edit }: { date: string; edit: PlanEdit }) {
  const [options, setOptions] = useState<NewTripOptions | null>(null);
  const [run, setRun] = useState<1 | 2>(1);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [brand, setBrand] = useState<Brand>('Fresh');
  const [districts, setDistricts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<NewTripOptions>(`/plan/trips/options?date=${encodeURIComponent(date)}`)
      .then((o) => {
        if (!live) return;
        setOptions(o);
        setVehicleId(o.vehicles['1'].find((v) => v.available)?.id ?? null);
      })
      .catch(() => live && edit.closeModal());
    return () => {
      live = false;
    };
    // The options load once, when the dialog opens.
  }, [date]);

  // Free vehicles first; the ones that cannot take this run follow, greyed out.
  const vehicles = [...(options?.vehicles[String(run) as '1' | '2'] ?? [])].sort(
    (a, b) => Number(b.available) - Number(a.available),
  );
  const chosen = vehicles.find((v) => v.id === vehicleId && v.available) ? vehicleId : null;

  function pickRun(next: 1 | 2) {
    setRun(next);
    const list = options?.vehicles[String(next) as '1' | '2'] ?? [];
    setVehicleId(
      list.find((v) => v.id === vehicleId && v.available)?.id ??
        list.find((v) => v.available)?.id ??
        null,
    );
  }

  // A fix to the form clears the last "not enough info" message.
  useEffect(() => setError(null), [chosen, districts, run, brand]);

  async function create() {
    const missing = [
      !options ? 'the trip options are still loading' : null,
      options && !chosen
        ? vehicles.some((v) => v.available)
          ? 'pick a vehicle'
          : `no vehicle is free for trip ${run}`
        : null,
      districts.length === 0 ? 'pick at least one district' : null,
    ].filter(Boolean);
    if (missing.length > 0 || !chosen) {
      setError(`Not enough info to create the trip: ${missing.join(', ')}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const trip = await api<PlanTrip>('/plan/trips', {
        method: 'POST',
        body: { vehicleId: chosen, tripNumber: run, brand, districts, date },
      });
      await edit.reload();
      edit.closeModal();
      edit.focusTrip(trip.id);
      edit.showToast({
        kind: 'ok',
        title: `Trip created: ${trip.plate ?? trip.vehicleId} · Trip ${trip.tripNumber}`,
        sub: 'Now add orders: drag from the queue or use the suggestions',
      });
    } catch (e) {
      setBusy(false);
      const body = (e as { body?: { message?: string } }).body;
      setError(body?.message ?? 'The trip could not be created.');
    }
  }

  return (
    <Modal label="Create a new trip" width={580} onClose={edit.closeModal}>
      <ModalIcon tone="bg-info-tint text-slate">
        <Icon name="truck" size={22} />
      </ModalIcon>
      <h2 className="whitespace-nowrap text-[24px] font-semibold leading-[30px] text-ink">
        Create a new trip
      </h2>
      <p className="text-[14px] leading-5 text-muted">
        Only vehicles free for the selected run are shown.
      </p>

      <div className="flex gap-1 rounded-pill bg-bg p-1" role="tablist">
        {(options?.runs ?? []).map((r) => (
          <button
            key={r.tripNumber}
            type="button"
            role="tab"
            aria-selected={run === r.tripNumber}
            onClick={() => pickRun(r.tripNumber)}
            className={`flex min-w-px flex-1 justify-center whitespace-nowrap rounded-pill px-[14px] py-[10px] text-[14px] font-semibold leading-5 ${
              run === r.tripNumber ? 'bg-surface text-ink' : 'text-muted'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <p className="text-[12px] font-semibold leading-[17px] text-muted">Vehicle</p>
      <div className="flex max-h-[262px] flex-col gap-4 overflow-y-auto">
        {options && vehicles.length === 0 && (
          <p className="rounded-input bg-bg p-3 text-[13px] leading-[18px] text-muted">
            No vehicles at this depot yet.
          </p>
        )}
        {vehicles.map((v) => {
          const on = chosen === v.id;
          return (
            <button
              key={v.id}
              type="button"
              disabled={!v.available}
              onClick={() => setVehicleId(v.id)}
              className={`flex items-center gap-3 rounded-note p-[14px] text-left ${
                on ? 'border-2 border-slate bg-info-tint' : 'bg-bg'
              } ${v.available ? '' : 'opacity-50'}`}
            >
              <Radio on={on} />
              <span className="flex min-w-px flex-1 flex-col gap-px whitespace-nowrap">
                <span className="text-[14px] font-semibold leading-5 text-ink">{v.label}</span>
                <span className="text-[12px] leading-[17px] text-muted">
                  {v.unavailable ?? v.detail}
                </span>
              </span>
              {v.tag && (
                <span
                  className={`rounded-pill px-[10px] py-1 text-[12px] font-semibold leading-[15px] ${
                    v.available ? 'bg-success/[0.14] text-success' : 'bg-muted/[0.14] text-muted'
                  }`}
                >
                  {v.tag}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-3">
        <div className="flex min-w-px flex-1 flex-col gap-[6px]">
          <p className="text-[12px] font-semibold leading-[17px] text-muted">Brand</p>
          <div className="flex gap-[6px]">
            {BRANDS.map((b) => (
              <button
                key={b.brand}
                type="button"
                onClick={() => setBrand(b.brand)}
                aria-pressed={brand === b.brand}
                className={`rounded-pill px-[14px] py-[9px] text-[13px] font-semibold leading-[18px] ${
                  brand === b.brand ? b.on : b.off
                }`}
              >
                {b.brand}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-px flex-1 flex-col gap-[6px]">
          <p className="text-[12px] font-semibold leading-[17px] text-muted">Districts</p>
          <DistrictPicker
            options={options?.districts ?? []}
            value={districts}
            onChange={setDistricts}
          />
        </div>
      </div>

      <p className="rounded-input bg-bg p-3 text-[12px] leading-[18px] text-muted">
        One brand per trip, covering one or more districts. Fresh trips must finish within 270 min,
        Style and Tech within 480 min.
      </p>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-[10px]">
        <OutlineButton onClick={edit.closeModal}>Cancel</OutlineButton>
        <SolidButton onClick={create} disabled={busy}>
          Create trip
        </SolidButton>
      </div>
    </Modal>
  );
}
