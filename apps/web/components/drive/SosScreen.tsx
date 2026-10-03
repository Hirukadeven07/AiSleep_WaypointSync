'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { DISPATCH_PHONE, telHref } from '@/lib/driver-format';
import { enqueueAction } from '@/lib/outbox';
import { useDriver } from './DriverShell';

function CallCard({
  href,
  title,
  subtitle,
  number,
  primary = false,
}: {
  href: string;
  title: string;
  subtitle: string;
  number: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-[14px] rounded-card p-[18px] text-left ${
        primary ? 'bg-surface' : 'bg-white/10'
      }`}
    >
      <span
        className={`flex size-12 shrink-0 items-center justify-center rounded-card ${
          primary ? 'bg-danger text-white' : 'bg-surface text-sos'
        }`}
      >
        <Icon name="handset" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[17px] font-bold leading-[23px] ${primary ? 'text-sos' : 'text-white'}`}>
          {title}
        </span>
        <span className={`block text-caption font-medium leading-4 ${primary ? 'text-sos-mid' : 'text-sos-soft'}`}>
          {subtitle}
        </span>
      </span>
      <span className={`whitespace-nowrap text-[15px] font-bold ${primary ? 'text-sos' : 'text-white'}`}>
        {number}
      </span>
    </a>
  );
}

/** How often the open SOS screen sends the driver's position. */
const SOS_PING_MS = 30_000;

/**
 * Shares the phone's position with dispatch only while the SOS screen is open: each fix (at most
 * every 30 s) goes through the outbox as a LOCATION_PING with `sos: true`, which moves the open SOS
 * alert. Leaving the screen clears the watch, so sharing stops when SOS is closed.
 */
function useSosLocation(tripId: string | null, planVersion: number | null) {
  const [state, setState] = useState<'starting' | 'on' | 'off'>('starting');
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState('off');
      return;
    }
    let last = 0;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setState('on');
        const now = Date.now();
        if (now - last < SOS_PING_MS) return;
        last = now;
        const { latitude, longitude, accuracy, speed } = pos.coords;
        void enqueueAction(
          'LOCATION_PING',
          {
            lat: latitude,
            lng: longitude,
            accuracyM: Number.isFinite(accuracy) ? accuracy : null,
            speedKmh: speed != null && Number.isFinite(speed) ? speed * 3.6 : null,
            sos: true,
          },
          tripId,
          planVersion,
        ).catch(() => {});
      },
      () => setState('off'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [tripId, planVersion]);
  return state;
}

/**
 * Figma "Driver / SOS": a full-screen emergency page. Opening it sends one SOS alert (through the
 * outbox, so it works with no signal); there is no confirmation step.
 */
export function SosScreen() {
  const router = useRouter();
  const { me, trip } = useDriver();
  const sent = useRef(false);
  const sharing = useSosLocation(
    trip?.id != null ? String(trip.id) : null,
    trip?.planVersion ?? null,
  );

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void enqueueAction('SOS_ALERT', { location: null }, trip?.id ?? null, trip?.planVersion ?? null).catch(() => {});
  }, [trip]);

  // Back to the driver screen the SOS button was pressed on (Home if unknown).
  const close = () => {
    const from = new URLSearchParams(window.location.search).get('from') ?? '';
    const ok = from.startsWith('/drive') && !from.startsWith('/drive/sos') && !from.startsWith('//');
    router.replace(ok ? from : '/drive');
  };

  return (
    <div className="min-h-dvh bg-sos text-on-primary">
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col pt-[env(safe-area-inset-top)]">
        <header className="flex items-center gap-3 px-4 py-[6px]">
          <button
            type="button"
            onClick={close}
            aria-label="Close SOS"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-sos"
          >
            <Icon name="x" size={20} />
          </button>
          <div>
            <h1 className="text-[18px] font-semibold leading-6 text-on-primary">Emergency</h1>
            <p className="text-caption font-medium leading-4 text-sand">Only use when you need help now</p>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-3 px-4 py-1">
          <section className="flex flex-col gap-[6px] rounded-card bg-white/[0.12] p-[18px]">
            <p className="flex items-center gap-2 text-body font-semibold leading-[19px] text-white">
              <Icon name="pin" size={16} />
              Dispatch gets your vehicle, trip and last stop
            </p>
            <p className="text-caption leading-4 text-sos-soft">
              {sharing === 'on'
                ? 'Your location is shared with dispatch while this screen is open. Closing SOS stops it.'
                : sharing === 'off'
                  ? 'Location is off on this phone, so dispatch gets your trip and last stop only.'
                  : 'Finding your location…'}
            </p>
          </section>

          <CallCard
            primary
            href={telHref(DISPATCH_PHONE)}
            title="Call dispatcher"
            subtitle={me?.depotId ? `Dispatch · ${me.depotId}` : 'Dispatch'}
            number={DISPATCH_PHONE}
          />
          <CallCard href={telHref('119')} title="Police emergency" subtitle="Sri Lanka Police" number="119" />
          <CallCard href={telHref('1990')} title="Ambulance" subtitle="Suwa Seriya" number="1990" />

          <div className="flex-1" />
          <button
            type="button"
            onClick={close}
            className="flex min-h-11 items-center justify-center pb-[env(safe-area-inset-bottom)] text-[15px] font-semibold text-sos-soft"
          >
            I&apos;m safe, close SOS
          </button>
        </main>
      </div>
    </div>
  );
}
