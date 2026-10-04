'use client';

import { useEffect, useState } from 'react';
import type { DriverProfile } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { dayText, vehicleLabel } from '@/lib/driver-format';
import { OfflineBanner } from './OfflineBanner';
import { useDriver } from './DriverShell';
import { depotName } from '@/lib/depots';

const CACHE = 'ws_driver_profile_v1';
/** A licence this close to expiry is shown as a warning. */
const EXPIRY_WARN_DAYS = 30;

function readCached(): DriverProfile | null {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE);
    return raw ? (JSON.parse(raw) as DriverProfile) : null;
  } catch {
    return null;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex-1 text-[14px] leading-5 text-muted">{label}</span>
      <span className="text-right text-[15px] font-semibold leading-5 text-ink">{value}</span>
    </div>
  );
}

const STATUS: Record<string, string> = {
  published: 'Sent',
  loading: 'Loading',
  ready: 'Ready',
  on_road: 'On the road',
  completed: 'Done',
  breakdown: 'Broke down',
};

/** R4 profile: licence expiry, the driver's vehicle and their latest trips. Works from the last copy offline. */
export function DriverProfileView() {
  const { online, day } = useDriver();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setProfile((p) => p ?? readCached());
    let alive = true;
    fetch('/api/driver/profile', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const fresh = (await res.json()) as DriverProfile;
        if (!alive) return;
        setProfile(fresh);
        setFailed(false);
        try {
          globalThis.localStorage?.setItem(CACHE, JSON.stringify(fresh));
        } catch {
          /* the profile still shows for this visit */
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [online]);

  const today = day?.serviceDate ?? new Date().toISOString().slice(0, 10);
  const expiry = profile?.licenseExpiry ?? null;
  const daysLeft = expiry
    ? Math.round(
        (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
      )
    : null;

  return (
    <div className="flex flex-col gap-4 lg:max-w-[640px]">
      <h1 className="text-[26px] font-semibold leading-8 text-ink">Profile</h1>
      {!online && <OfflineBanner />}
      {!profile ? (
        <p className="rounded-card bg-surface p-4 text-[15px] leading-5 text-muted">
          {failed
            ? 'Your profile needs a signal the first time. Try again when online.'
            : 'Loading…'}
        </p>
      ) : (
        <>
          <section className="flex flex-col rounded-card bg-surface px-4 py-2" aria-label="Licence">
            <h2 className="pt-2 text-[17px] font-semibold leading-[22px] text-ink">
              {profile.name}
            </h2>
            <Row label="Driver ID" value={profile.loginId} />
            {profile.phone && <Row label="Phone" value={profile.phone} />}
            {profile.depotId && <Row label="Depot" value={depotName(profile.depotId)} />}
            <Row label="Licence" value={profile.licenseNo ?? 'Not recorded'} />
            <Row
              label="Licence expires"
              value={expiry ? dayText(expiry) + ` ${expiry.slice(0, 4)}` : 'Not recorded'}
            />
            {daysLeft !== null && daysLeft <= EXPIRY_WARN_DAYS && (
              <p
                role="alert"
                className="mb-2 flex items-center gap-2 rounded-note bg-danger-tint p-3 text-[14px] font-medium leading-5 text-ink"
              >
                <Icon name="alert" size={16} className="text-danger" />
                {daysLeft < 0
                  ? 'Your licence has expired. Tell dispatch before driving.'
                  : `Your licence expires in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}.`}
              </p>
            )}
          </section>

          <section className="flex flex-col rounded-card bg-surface px-4 py-2" aria-label="Vehicle">
            <h2 className="pt-2 text-[17px] font-semibold leading-[22px] text-ink">Your vehicle</h2>
            {profile.vehicle ? (
              <>
                <Row label="Plate" value={profile.vehicle.plate} />
                <Row
                  label="Type"
                  value={`${vehicleLabel(profile.vehicle.type)}${profile.vehicle.temp === 'reefer' ? ' · refrigerated' : ''}`}
                />
                <Row
                  label="Load limit"
                  value={`${profile.vehicle.weightCapKg.toLocaleString('en-US')} kg · ${profile.vehicle.volumeCapM3} m³`}
                />
              </>
            ) : (
              <p className="py-2 text-[14px] leading-5 text-muted">
                No vehicle is registered to you. Dispatch puts you on a trip&apos;s truck.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2" aria-label="Recent trips">
            <h2 className="text-[17px] font-semibold leading-[22px] text-ink">Recent trips</h2>
            {profile.recentTrips.length === 0 ? (
              <p className="rounded-card bg-surface p-4 text-[14px] leading-5 text-muted">
                No trips yet.
              </p>
            ) : (
              profile.recentTrips.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-card bg-surface p-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-5 text-ink">
                      {dayText(t.serviceDate, today)} · Trip {t.tripNumber}
                    </span>
                    <span className="block text-caption font-medium leading-4 text-muted">
                      {t.plate} · {t.stopsDone}/{t.stopsTotal} stops done
                    </span>
                  </span>
                  <span className="rounded-pill bg-bg px-3 py-1 text-caption font-semibold leading-4 text-slate">
                    {STATUS[t.status] ?? t.status}
                  </span>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
