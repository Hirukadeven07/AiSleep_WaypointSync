'use client';

import { useEffect, useState } from 'react';
import type { AddVehicleRequest, FleetVehicle } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { Modal, ModalIcon, OutlineButton, SolidButton } from '@/components/plan/Modal';
import { api } from '@/lib/api';

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex min-w-px flex-1 flex-col gap-[6px]">
      <span className="text-[12px] font-semibold leading-[17px] text-muted">{label}</span>
      <div className="flex gap-1 rounded-pill bg-bg p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`flex min-w-px flex-1 justify-center whitespace-nowrap rounded-pill px-3 py-[9px] text-[13px] font-semibold leading-[18px] ${
              value === o.value ? 'bg-surface text-ink' : 'text-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  unit,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  unit?: string;
  numeric?: boolean;
}) {
  return (
    <label className="flex min-w-px flex-1 flex-col gap-[6px]">
      <span className="text-[12px] font-semibold leading-[17px] text-muted">{label}</span>
      <span className="flex items-center gap-2 rounded-note bg-bg px-4 py-3">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={numeric ? 'decimal' : 'text'}
          className="min-w-px flex-1 bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-quiet"
        />
        {unit && <span className="text-[13px] leading-[18px] text-muted">{unit}</span>}
      </span>
    </label>
  );
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')));

/** Fleet "Add vehicle": plate, kind and capacity of a new vehicle at the depot. */
export function AddVehicleModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (vehicle: FleetVehicle) => void;
}) {
  const [plate, setPlate] = useState('');
  const [type, setType] = useState<AddVehicleRequest['type']>('truck');
  const [temp, setTemp] = useState<AddVehicleRequest['temp']>('ambient');
  const [weight, setWeight] = useState('');
  const [volume, setVolume] = useState('');
  const [kmPerL, setKmPerL] = useState('');
  const [quota, setQuota] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fix to the form clears the last message.
  useEffect(() => setError(null), [plate, type, temp, weight, volume, kmPerL, quota]);

  async function submit() {
    const w = num(weight);
    const v = num(volume);
    const k = num(kmPerL);
    const q = num(quota);
    const missing = [
      plate.trim() === '' ? 'the plate' : null,
      w === null ? 'the weight capacity' : null,
      v === null ? 'the volume capacity' : null,
    ].filter(Boolean);
    if (missing.length > 0) {
      setError(`Not enough info to add the vehicle: enter ${missing.join(', ')}.`);
      return;
    }
    const bad = [
      !Number.isFinite(w) || w! <= 0 ? 'weight' : null,
      !Number.isFinite(v) || v! <= 0 ? 'volume' : null,
      k !== null && (!Number.isFinite(k) || k <= 0) ? 'km per litre' : null,
      q !== null && (!Number.isFinite(q) || q <= 0) ? 'weekly fuel quota' : null,
    ].filter(Boolean);
    if (bad.length > 0) {
      setError(`Check the ${bad.join(', ')}: use a number above 0.`);
      return;
    }

    setBusy(true);
    try {
      const body: AddVehicleRequest = {
        plate: plate.trim(),
        type,
        temp,
        weightCapKg: w!,
        volumeCapM3: v!,
        ...(k !== null ? { kmPerL: k } : {}),
        ...(q !== null ? { weeklyFuelQuotaL: q } : {}),
      };
      onDone(await api<FleetVehicle>('/fleet', { method: 'POST', body }));
    } catch (e) {
      setBusy(false);
      const message = (e as { body?: { message?: string | string[] } }).body?.message;
      setError(
        Array.isArray(message)
          ? `Check the details: ${message.join('; ')}.`
          : (message ?? 'The vehicle could not be added. Try again.'),
      );
    }
  }

  return (
    <Modal label="Add a vehicle" width={560} onClose={onClose}>
      <ModalIcon tone="bg-info-tint text-slate">
        <Icon name="truck" size={22} />
      </ModalIcon>
      <h2 className="text-[24px] font-semibold leading-[30px] text-ink">Add a vehicle</h2>
      <p className="text-[14px] leading-5 text-muted">
        It joins this depot&apos;s fleet and can take trips from today.
      </p>

      <Field label="Plate" value={plate} onChange={setPlate} placeholder="e.g. WP LB-1234" />
      <div className="flex flex-wrap gap-3">
        <Choice
          label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: 'truck', label: 'Truck' },
            { value: 'van', label: 'Van' },
          ]}
        />
        <Choice
          label="Temperature"
          value={temp}
          onChange={setTemp}
          options={[
            { value: 'reefer', label: 'Refrigerated' },
            { value: 'ambient', label: 'Ambient' },
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Field
          label="Weight capacity"
          value={weight}
          onChange={setWeight}
          placeholder="3000"
          unit="kg"
          numeric
        />
        <Field
          label="Volume capacity"
          value={volume}
          onChange={setVolume}
          placeholder="15"
          unit="m³"
          numeric
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Field
          label="Fuel use (optional)"
          value={kmPerL}
          onChange={setKmPerL}
          placeholder="6"
          unit="km / L"
          numeric
        />
        <Field
          label="Weekly fuel quota (optional)"
          value={quota}
          onChange={setQuota}
          placeholder="500"
          unit="L"
          numeric
        />
      </div>

      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-[10px]">
        <OutlineButton onClick={onClose}>Cancel</OutlineButton>
        <SolidButton onClick={submit} disabled={busy}>
          Add vehicle
        </SolidButton>
      </div>
    </Modal>
  );
}
