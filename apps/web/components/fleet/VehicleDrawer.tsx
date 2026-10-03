'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { FleetTrip, FleetVehicle } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { initials } from '@/lib/initials';
import { STATUS } from './Fleet';

const TONE: Record<FleetTrip['tone'], string> = {
  on_time: 'bg-success/[0.12] text-success',
  late: 'bg-warning/[0.12] text-warning',
  breakdown: 'bg-danger/[0.12] text-danger',
  not_synced: 'bg-muted/[0.12] text-muted',
  completed: 'bg-info/[0.12] text-info',
  planned: 'bg-muted/[0.12] text-muted',
};
const HERO = { Fresh: 'bg-fresh-tint', Style: 'bg-style-tint', Tech: 'bg-tech-tint' } as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] leading-[18px]">
      <p className="min-w-px flex-1 text-muted">{label}</p>
      <p className="whitespace-nowrap font-semibold text-ink">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex shrink-0 flex-col gap-[10px] rounded-[20px] bg-bg p-4">
      <h3 className="text-[15px] font-semibold leading-[21px] text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** Figma "Vehicle detail drawer": specs, today's trips, fuel quota, and the actions for the vehicle. */
export function VehicleDrawer({
  vehicle: v,
  onClose,
  onMarkOut,
  onBack,
}: {
  vehicle: FleetVehicle;
  onClose: () => void;
  onMarkOut: () => void;
  onBack: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const status = STATUS[v.status];
  const hero = v.trips[0] ? HERO[v.trips[0].brand] : 'bg-info-tint';
  const outOfService = v.status === 'out_of_service';

  return (
    <aside
      aria-label="Vehicle details"
      className="flex flex-col gap-[10px] overflow-y-auto rounded-hero bg-surface p-5 shadow-[0_8px_32px_0_rgba(13,26,41,0.12)] [scrollbar-width:none] lg:w-[360px] lg:shrink-0 [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex shrink-0 items-center">
        <p className="min-w-px flex-1 text-[13px] font-semibold leading-[18px] text-muted">
          Vehicle details
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

      <div className={`flex shrink-0 flex-col gap-[10px] rounded-card p-[18px] ${hero}`}>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-surface text-ink">
            <Icon name="truck" size={20} />
          </span>
          <div className="flex min-w-px flex-1 flex-col whitespace-nowrap">
            <p className="text-[12px] font-medium leading-[17px] text-muted">
              {v.type === 'van' ? 'Van' : 'Truck'} ·{' '}
              {v.temp === 'reefer' ? 'Refrigerated' : 'Ambient'}
            </p>
            <p className="text-[24px] font-semibold leading-7 text-ink">{v.plate}</p>
          </div>
        </div>
        <div className="flex gap-[6px]">
          <span
            className={`flex items-center gap-[6px] whitespace-nowrap rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${status.chip}`}
          >
            <span aria-hidden className="size-[7px] rounded-full bg-current" />
            {status.label}
          </span>
          {v.type === 'van' && (
            <span className="whitespace-nowrap rounded-pill bg-surface px-[10px] py-1 text-[12px] font-semibold leading-[15px] text-ink">
              Van-only outlets OK
            </span>
          )}
        </div>
      </div>

      {outOfService && v.outOfServiceReason && (
        <p className="shrink-0 rounded-note bg-warning-tint p-3 text-[12px] font-medium leading-[18px] text-ink">
          {v.outOfServiceReason}
          {v.returnDate
            ? ` · back ${new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Colombo',
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }).format(new Date(v.returnDate))}`
            : ''}
        </p>
      )}

      <Section title="Specs">
        <Row label="Weight limit" value={`${v.weightCapKg.toLocaleString('en-US')} kg`} />
        <Row label="Volume limit" value={`${v.volumeCapM3.toFixed(1)} m³`} />
        <Row label="Temperature" value={v.temp === 'reefer' ? 'Refrigerated' : 'Ambient only'} />
        <Row label="Home depot" value={v.homeDepot} />
        {v.driverName && (
          <div className="flex items-center gap-[10px]">
            <span className="flex size-9 items-center justify-center rounded-full bg-sand text-[12px] font-bold leading-[17px] text-primary">
              {initials(v.driverName)}
            </span>
            <div className="flex min-w-px flex-1 flex-col whitespace-nowrap">
              <p className="text-[13px] font-semibold leading-[18px] text-ink">{v.driverName}</p>
              <p className="text-[12px] leading-[17px] text-muted">
                Driver{v.driverPhone ? ` · ${v.driverPhone}` : ''}
              </p>
            </div>
            {v.driverPhone && (
              <a
                href={`tel:${v.driverPhone}`}
                aria-label="Call driver"
                className="flex size-[34px] items-center justify-center rounded-full bg-surface text-slate"
              >
                <Icon name="phone" size={15} />
              </a>
            )}
          </div>
        )}
      </Section>

      {v.trips.length > 0 && (
        <Section title="Today's trips">
          {v.trips.map((t) => (
            <div key={t.id} className="flex flex-col gap-[6px] rounded-[14px] bg-surface p-3">
              <div className="flex items-center">
                <p className="min-w-px flex-1 text-[13px] font-semibold leading-[18px] text-ink">
                  Trip {t.tripNumber} · {t.brand} · {t.district}
                </p>
                <span
                  className={`flex items-center gap-[6px] whitespace-nowrap rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${TONE[t.tone]}`}
                >
                  <span aria-hidden className="size-[7px] rounded-full bg-current" />
                  {t.label}
                </span>
              </div>
              <span className="h-2 w-full overflow-hidden rounded-[4px] bg-bg">
                <span
                  className="block h-2 rounded-[4px] bg-blue"
                  style={{
                    width: `${t.stopsTotal ? Math.max((t.stopsDone / t.stopsTotal) * 100, 2) : 0}%`,
                  }}
                />
              </span>
              <p className="text-[12px] leading-[17px] text-muted">
                {t.tone === 'planned'
                  ? `Planned · ${t.stopsTotal} stops`
                  : `${t.stopsDone}/${t.stopsTotal} delivered`}
              </p>
            </div>
          ))}
        </Section>
      )}

      {v.fuel && (
        <Section title="Fuel quota">
          <div className="flex text-[13px] leading-[18px]">
            <p className="min-w-px flex-1 text-muted">
              {v.fuel.usedL} of {v.fuel.quotaL} L used this week
            </p>
            <p className="font-bold text-ink">{v.fuel.pct}%</p>
          </div>
          <span className="h-2 w-full overflow-hidden rounded-[4px] bg-surface">
            <span
              className={`block h-2 rounded-[4px] ${v.fuel.pct > 100 ? 'bg-danger' : 'bg-slate'}`}
              style={{ width: `${Math.min(v.fuel.pct, 100)}%` }}
            />
          </span>
        </Section>
      )}

      <span className="min-h-px flex-1" />

      <div className="flex shrink-0 gap-2">
        {outOfService ? (
          <button
            type="button"
            onClick={onBack}
            className="flex min-w-px flex-1 items-center justify-center rounded-pill bg-primary px-[18px] py-[11px] text-[14px] font-semibold leading-5 text-bg"
          >
            Mark back in service
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onMarkOut}
              className="flex min-w-px flex-1 items-center justify-center whitespace-nowrap rounded-pill border border-border bg-surface px-[18px] py-[11px] text-[14px] font-semibold leading-5 text-ink"
            >
              Mark out of service
            </button>
            {v.trips.some((t) => t.tone !== 'planned' && t.tone !== 'completed') && (
              <Link
                href="/dispatch/board"
                className="flex min-w-px flex-1 items-center justify-center whitespace-nowrap rounded-pill bg-primary px-[18px] py-[11px] text-[14px] font-semibold leading-5 text-bg"
              >
                View live trip
              </Link>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
