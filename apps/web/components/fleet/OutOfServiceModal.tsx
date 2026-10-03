'use client';

import { useState } from 'react';
import {
  OUT_OF_SERVICE_REASONS,
  type FleetVehicle,
  type OutOfServiceResult,
} from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { dayLabel } from '@/components/plan/format';
import { Modal, ModalIcon, OutlineButton, SolidButton } from '@/components/plan/Modal';
import { api } from '@/lib/api';

/** The next 14 days from `from`, as { iso, label } for the "Expected back" field. */
function days(from: string) {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i + 1);
    const iso = d.toISOString().slice(0, 10);
    return { iso, label: dayLabel(iso) };
  });
}

function Pick({
  label,
  value,
  shown,
  onChange,
  options,
}: {
  label: string;
  value: string;
  shown: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[12px] font-semibold leading-[17px] text-muted">{label}</span>
      <span className="relative flex items-center rounded-note bg-bg px-4 py-3">
        <span className="min-w-px flex-1 text-[14px] leading-5 text-ink">{shown}</span>
        <span className="text-[12px] font-semibold leading-[17px] text-muted">▾</span>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

/** Figma "Fleet / Mark out of service": why, when it is back, and what happens to its planned trips. */
export function OutOfServiceModal({
  vehicle,
  today,
  onClose,
  onDone,
}: {
  vehicle: FleetVehicle;
  today: string;
  onClose: () => void;
  onDone: (result: OutOfServiceResult) => void;
}) {
  const options = days(today);
  const [reason, setReason] = useState<string>(OUT_OF_SERVICE_REASONS[0]);
  const [back, setBack] = useState('');
  const [time, setTime] = useState('14:30');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planned = vehicle.plannedTrips;
  const stops = planned.reduce((n, t) => n + t.stops, 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      onDone(
        await api<OutOfServiceResult>(`/fleet/${vehicle.id}/out-of-service`, {
          method: 'POST',
          body: {
            reason,
            note: note || undefined,
            ...(back ? { returnDate: `${back}T${time.slice(0, 5)}:00+05:30` } : {}),
          },
        }),
      );
    } catch {
      setBusy(false);
      setError('The vehicle could not be marked out of service. Try again.');
    }
  }

  return (
    <Modal label="Mark out of service" width={520} onClose={onClose}>
      <ModalIcon tone="bg-warning-tint text-warning">
        <Icon name="wrench" size={22} />
      </ModalIcon>
      <h2 className="text-[24px] font-semibold leading-[30px] text-ink">
        Mark {vehicle.plate} as out of service?
      </h2>
      {planned.length > 0 && (
        <div className="flex items-start gap-[10px] rounded-input bg-warning-tint p-3">
          <Icon name="alert" size={16} className="text-warning" />
          <p className="min-w-px flex-1 text-[12px] font-medium leading-[18px] text-ink">
            {vehicle.plate} is planned for{' '}
            {planned.map((t) => `Trip ${t.tripNumber}`).join(' and ')} today ({stops}{' '}
            {stops === 1 ? 'stop' : 'stops'}). Those orders go back to Planning so you can give them
            another vehicle.
          </p>
        </div>
      )}
      <Pick
        label="Reason"
        value={reason}
        shown={reason}
        onChange={setReason}
        options={OUT_OF_SERVICE_REASONS.map((r) => ({ value: r, label: r }))}
      />
      <Pick
        label="Expected back (optional)"
        value={back}
        shown={back ? (options.find((o) => o.iso === back)?.label ?? '') : 'Not set'}
        onChange={setBack}
        options={[{ value: '', label: 'Not set' }, ...options.map((o) => ({ value: o.iso, label: o.label }))]}
      />
      {back && (
        <label className="flex flex-col gap-[6px]">
          <span className="text-[12px] font-semibold leading-[17px] text-muted">Time back</span>
          <input
            type="time"
            aria-label="Time back"
            value={time}
            onChange={(e) => setTime(e.target.value || '14:30')}
            required
            className="rounded-note bg-bg px-4 py-3 text-[14px] leading-5 text-ink outline-none"
          />
        </label>
      )}
      <label className="flex flex-col gap-[6px]">
        <span className="text-[12px] font-semibold leading-[17px] text-muted">Note (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Anything the mechanic or next driver should know"
          className="h-[72px] resize-none rounded-note bg-bg px-4 py-3 text-[14px] leading-5 text-ink outline-none placeholder:text-quiet"
        />
      </label>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-[10px]">
        <OutlineButton onClick={onClose}>Cancel</OutlineButton>
        <SolidButton onClick={submit} disabled={busy} className="bg-warning text-white">
          Mark out of service
        </SolidButton>
      </div>
    </Modal>
  );
}
