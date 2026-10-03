'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ROAD_ISSUE_KINDS,
  ROAD_ISSUE_LABEL,
  type RoadIssueKind,
  type RoadIssuePayload,
} from '@waypoint/contracts';
import { OfflineBanner } from '@/components/drive/OfflineBanner';
import { useDriver } from '@/components/drive/DriverShell';
import { Icon, type IconName } from '@/components/ui/Icon';
import { enqueueAction } from '@/lib/outbox';
import { writeRoadIssue } from '@/lib/road-issue';

const TILE: Record<RoadIssueKind, { icon: IconName; tint: string }> = {
  road_blocked: { icon: 'x', tint: 'bg-danger-tint' },
  traffic: { icon: 'clock', tint: 'bg-warning-tint' },
  accident: { icon: 'alert', tint: 'bg-danger-tint' },
  vehicle: { icon: 'wrench', tint: 'bg-info-tint' },
  weather: { icon: 'snow', tint: 'bg-info-tint' },
  other: { icon: 'msg', tint: 'bg-peek' },
};

type Fix = RoadIssuePayload['location'];

/** Shrink a camera photo to at most 960 px on the long side as a JPEG data URL (~50-150 kB). */
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 960 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Ask the phone for its position once; null when it is refused, unavailable or too slow. */
function useLocation() {
  const [fix, setFix] = useState<Fix | 'looking'>('looking');
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setFix(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setFix({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null,
        }),
      () => setFix(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);
  return fix;
}

/**
 * Figma "Driver / Report issue": large tiles, a note, an optional photo; the trip and the
 * phone's location go with it. Sending pauses the next stop until the driver resumes.
 */
export function RoadIssueForm() {
  const router = useRouter();
  const { day, trip, online } = useDriver();
  const [kind, setKind] = useState<RoadIssueKind | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fix = useLocation();

  useEffect(() => setError(null), [kind, note]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await shrinkPhoto(file));
    } catch {
      setError('That photo could not be read. Try another one, or send without a photo.');
    }
  }

  async function submit() {
    if (!trip) {
      setError('No trip today to report against. Call dispatch instead.');
      return;
    }
    if (!kind) {
      setError('Not enough info: tap what happened first.');
      return;
    }
    if (kind === 'other' && note.trim() === '') {
      setError('Not enough info: say what happened in the note.');
      return;
    }
    setBusy(true);
    try {
      const payload: RoadIssuePayload = {
        status: 'reported',
        kind,
        note: note.trim() || null,
        photo,
        location: fix === 'looking' ? null : fix,
      };
      await enqueueAction('ROAD_ISSUE', { ...payload }, trip.id, trip.planVersion);
      writeRoadIssue(String(trip.id), {
        kind,
        note: payload.note,
        reportedAt: new Date().toISOString(),
      });
      router.push('/drive/next');
    } catch {
      setBusy(false);
      setError('Could not save the report on this phone. Try again, or call dispatch.');
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:max-w-[720px]">
      <header className="flex flex-col gap-1 pr-[111px]">
        <h1 className="text-[26px] font-semibold leading-8 text-ink lg:text-[32px] lg:leading-10">
          Report a road issue
        </h1>
        <p className="text-[13px] font-medium leading-[17px] text-muted">
          Dispatch is told and your next stop is paused until you resume.
        </p>
      </header>

      {!online && <OfflineBanner />}

      <section aria-label="What happened" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {ROAD_ISSUE_KINDS.map((k) => {
          const on = kind === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setKind(k)}
              className={`flex min-h-[112px] flex-col items-start justify-between gap-3 rounded-card p-4 text-left ${TILE[k].tint} ${
                on ? 'ring-[3px] ring-primary' : ''
              }`}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-surface text-ink">
                <Icon name={on ? 'check' : TILE[k].icon} size={18} />
              </span>
              <span className="text-[17px] font-bold leading-[22px] text-ink">
                {ROAD_ISSUE_LABEL[k]}
              </span>
            </button>
          );
        })}
      </section>

      <label className="flex flex-col gap-[6px]">
        <span className="text-[13px] font-semibold leading-[17px] text-muted">
          Note{kind === 'other' ? '' : ' (optional)'}
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Where, and how long you think it will take"
          className="h-[96px] resize-none rounded-card bg-surface p-4 text-[16px] leading-6 text-ink outline-none placeholder:text-quiet"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold leading-[17px] text-muted">
          Photo (optional)
        </span>
        {photo ? (
          <div className="flex items-center gap-3">
            <img
              src={photo}
              alt="Photo to send"
              className="h-[88px] w-auto rounded-[12px] object-cover"
            />
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="rounded-pill border border-border bg-surface px-4 py-2 text-[14px] font-semibold text-ink"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-card border-2 border-dashed border-mist bg-surface px-4 text-[16px] font-semibold text-ink">
            <Icon name="plus" size={17} />
            Take or choose a photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => void pickPhoto(e.target.files?.[0])}
            />
          </label>
        )}
      </div>

      <section
        className="flex flex-col gap-1 rounded-card bg-surface p-4"
        aria-label="Sent with it"
      >
        <p className="flex items-center gap-2 text-[14px] leading-5 text-ink">
          <Icon name="truck" size={15} className="text-muted" />
          {trip
            ? `Trip ${trip.tripNumber}${day?.vehicle ? ` · ${day.vehicle.plate}` : ''}`
            : 'No trip today'}
        </p>
        <p className="flex items-center gap-2 text-[14px] leading-5 text-ink">
          <Icon name="pin" size={15} className="text-muted" />
          {fix === 'looking'
            ? 'Finding your location…'
            : fix
              ? `Location attached (within ${fix.accuracyM ?? '?'} m)`
              : 'Location not available; the report still goes without it'}
        </p>
      </section>

      {error && (
        <p role="alert" className="text-[14px] font-medium leading-5 text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="flex min-h-[60px] items-center justify-center gap-2 rounded-pill bg-danger px-6 text-[18px] font-semibold text-white disabled:opacity-60"
      >
        <Icon name="send" size={18} />
        Send report
      </button>
    </div>
  );
}
