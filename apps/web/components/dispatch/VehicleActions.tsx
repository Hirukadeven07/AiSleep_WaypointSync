'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { Brand, LiveTrip } from '@waypoint/contracts';
import { Icon, type IconName } from '@/components/ui/Icon';

const HERO: Record<Brand, string> = {
  Fresh: 'bg-fresh-tint',
  Style: 'bg-style-tint',
  Tech: 'bg-tech-tint',
};

function Action({
  icon,
  title,
  text,
  onClick,
}: {
  icon: IconName;
  title: string;
  text: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex shrink-0 items-center gap-3 rounded-note bg-wash p-[14px] text-left"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-slate">
        <Icon name={icon} size={16} />
      </span>
      <span className="flex min-w-px flex-1 flex-col gap-px">
        <span className="text-[14px] font-semibold leading-[19px] text-ink">{title}</span>
        <span className="text-[12px] leading-4 text-muted">{text}</span>
      </span>
    </button>
  );
}

/** Figma "Vehicle actions drawer": what a dispatcher can do about a trip that is on the road. */
export function VehicleActions({
  trip,
  onClose,
  onNotify,
}: {
  trip: LiveTrip;
  onClose: () => void;
  onNotify: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const behind =
    trip.live === 'late'
      ? ` · running ${trip.lateMin} min late`
      : trip.live === 'not_synced'
        ? ` · not synced for ${trip.notSyncedMin} min`
        : '';

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/35"
      />
      <aside
        role="dialog"
        aria-label="Vehicle actions"
        className="absolute right-4 top-4 flex w-[400px] max-w-[calc(100vw-32px)] flex-col gap-[14px] rounded-hero bg-surface p-[22px] shadow-ghost"
      >
        <div className="flex items-center">
          <p className="min-w-px flex-1 text-[13px] font-semibold leading-[18px] text-muted">
            On the road
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full bg-bg text-ink"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className={`flex items-center gap-3 rounded-[22px] p-4 ${HERO[trip.brand]}`}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
            <Icon name="truck" size={20} />
          </span>
          <div className="flex min-w-px flex-1 flex-col">
            <p className="text-[15px] font-bold leading-5 text-ink">
              {trip.plate ?? trip.vehicleId} · {trip.brand} · {trip.district}
            </p>
            <p className="text-[12px] font-medium leading-4 text-muted">
              {trip.driverName ?? 'No driver yet'} · {trip.stopsTotal - trip.stopsDone}{' '}
              {trip.stopsTotal - trip.stopsDone === 1 ? 'stop' : 'stops'}
              {behind}
            </p>
          </div>
        </div>

        <Action
          icon="arrows"
          title="Move a stop"
          text="Reassign one of its remaining stops to another trip"
        />
        <Action
          icon="bell"
          title="Notify affected stores"
          text="Tell the stores on this trip about a delay or change"
          onClick={onNotify}
        />
        <Link
          href="/dispatch/map"
          className="flex items-center gap-2 rounded-pill bg-primary px-4 py-3 text-[14px] font-semibold leading-[19px] text-bg"
        >
          <Icon name="crosshair" size={18} />
          Locate on live map
        </Link>
      </aside>
    </div>
  );
}
