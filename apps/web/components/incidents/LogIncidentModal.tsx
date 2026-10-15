'use client';

import { useEffect, useState } from 'react';
import type { IncidentDetail, LiveDay, LiveTrip, LogIncidentRequest } from '@waypoint/contracts';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Modal, ModalIcon, OutlineButton, SolidButton } from '@/components/plan/Modal';
import { Select } from '@/components/plan/Select';
import { api } from '@/lib/api';

type Kind = LogIncidentRequest['type'];

const KINDS: { id: Kind; label: string; hint: string; icon: IconName; tint: string }[] = [
  {
    id: 'breakdown',
    label: 'Breakdown',
    hint: 'Stops the trip so you can recover its stops',
    icon: 'wrench',
    tint: 'bg-danger-tint',
  },
  {
    id: 'delay',
    label: 'Running late',
    hint: 'The trip is behind',
    icon: 'clock',
    tint: 'bg-warning-tint',
  },
  {
    id: 'quiet_driver',
    label: 'Driver gone quiet',
    hint: 'No answer or no sync',
    icon: 'wifi-off',
    tint: 'bg-info-tint',
  },
  {
    id: 'wait_timeout',
    label: 'Long wait at a store',
    hint: 'The store is not taking the goods',
    icon: 'inbox',
    tint: 'bg-peek',
  },
];

/** Trips an incident can be logged on: sent and not finished. A breakdown needs the trip loading or out. */
const LOGGABLE = new Set(['published', 'loading', 'ready', 'on_road', 'breakdown']);
const BREAKABLE = new Set(['loading', 'ready', 'on_road']);

const tripLabel = (t: LiveTrip, when: string) =>
  `${t.plate ?? t.vehicleId} · Trip ${t.tripNumber} · ${t.brand} · ${t.district} (${when})`;

/** "+ Log incident": pick a trip and what went wrong, add a note. */
export function LogIncidentModal({
  onClose,
  onLogged,
}: {
  onClose: () => void;
  onLogged: (incident: IncidentDetail) => void;
}) {
  const [day, setDay] = useState<LiveDay | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tripId, setTripId] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<LiveDay>('/dispatch/live')
      .then(setDay)
      .catch(() => setLoadError(true));
  }, []);
  useEffect(() => setError(null), [tripId, kind, note]);

  const trips = [
    ...(day?.trips ?? []).map((t) => ({ t, when: 'today' })),
    ...(day?.tomorrowTrips ?? []).map((t) => ({ t, when: 'tomorrow' })),
  ].filter(({ t }) => LOGGABLE.has(t.status));
  const picked = trips.find(({ t }) => t.id === tripId)?.t ?? null;

  async function submit() {
    const missing = [!tripId ? 'pick a trip' : null, !kind ? 'pick what happened' : null].filter(
      Boolean,
    );
    if (missing.length > 0) {
      setError(`Not enough info to log the incident: ${missing.join(' and ')}.`);
      return;
    }
    if (kind === 'breakdown' && picked && !BREAKABLE.has(picked.status)) {
      setError('Only a trip that is loading, ready or on the road can break down.');
      return;
    }
    setBusy(true);
    try {
      const body: LogIncidentRequest = {
        tripId,
        type: kind!,
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      onLogged(await api<IncidentDetail>('/incidents', { method: 'POST', body }));
    } catch (e) {
      setBusy(false);
      const message = (e as { body?: { message?: string | string[] } }).body?.message;
      setError(
        Array.isArray(message)
          ? message.join('; ')
          : (message ?? 'The incident could not be logged. Try again.'),
      );
    }
  }

  return (
    <Modal label="Log an incident" width={580} onClose={onClose}>
      <ModalIcon tone="bg-danger-tint text-danger">
        <Icon name="alert" size={22} />
      </ModalIcon>
      <h2 className="text-[24px] font-semibold leading-[30px] text-ink">Log an incident</h2>
      <p className="text-[14px] leading-5 text-muted">
        It is added to the incidents list with your note, so the team can follow it up.
      </p>

      <div className="flex flex-col gap-[6px]">
        <span className="text-[12px] font-semibold leading-[17px] text-muted">Trip</span>
        {loadError ? (
          <p className="rounded-input bg-bg p-3 text-[13px] text-danger">
            The trips could not be loaded. Close this and try again.
          </p>
        ) : !day ? (
          <p className="rounded-input bg-bg p-3 text-[13px] text-muted">Loading the trips…</p>
        ) : trips.length === 0 ? (
          <p className="rounded-input bg-bg p-3 text-[13px] text-muted">
            No sent trips to log against yet. Publish the plan first.
          </p>
        ) : (
          <Select
            label="Trip"
            value={tripId || 'none'}
            options={[
              { value: 'none', label: 'Pick a trip' },
              ...trips.map(({ t, when }) => ({ value: t.id, label: tripLabel(t, when) })),
            ]}
            onChange={(v) => setTripId(v === 'none' ? '' : v)}
            searchable={trips.length > 6}
            className="w-full"
          />
        )}
      </div>

      <div className="flex flex-col gap-[6px]">
        <span className="text-[12px] font-semibold leading-[17px] text-muted">What happened</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What happened">
          {KINDS.map((k) => {
            const on = kind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(k.id)}
                className={`flex items-start gap-3 rounded-note p-3 text-left ${k.tint} ${
                  on ? 'ring-[3px] ring-primary' : ''
                }`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
                  <Icon name={on ? 'check' : k.icon} size={15} />
                </span>
                <span className="flex min-w-px flex-col gap-[2px]">
                  <span className="text-[14px] font-semibold leading-5 text-ink">{k.label}</span>
                  <span className="text-[12px] leading-4 text-muted">{k.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-[6px]">
        <span className="text-[12px] font-semibold leading-[17px] text-muted">Note (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="What you know so far"
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
        <SolidButton onClick={submit} disabled={busy} className="bg-danger text-white">
          Log incident
        </SolidButton>
      </div>
    </Modal>
  );
}
