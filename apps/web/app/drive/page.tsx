'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { OfflineBanner } from '@/components/drive/OfflineBanner';
import { useDriver } from '@/components/drive/DriverShell';
import { Icon } from '@/components/ui/Icon';
import type { StopSummary } from '@/lib/driver-cache';
import {
  DISPATCH_PHONE,
  clockText,
  displayName,
  firstName,
  greeting,
  isStopDone,
  telHref,
  vehicleLabel,
  windowText,
} from '@/lib/driver-format';
import { usePendingCount } from '@/lib/use-pending-count';

const stopCount = (n: number) => `${n} ${n === 1 ? 'stop' : 'stops'}`;

function SectionHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center">
      <h2 className="flex-1 text-[20px] font-semibold leading-[26px] text-ink">{title}</h2>
      {aside}
    </div>
  );
}

/** Time labels over numbered circles: done stops are olive with a tick, the current stop is navy. */
function StopStrip({ stops, activeIdx }: { stops: StopSummary[]; activeIdx: number }) {
  return (
    <div className="flex items-start gap-[10px] overflow-x-auto">
      {stops.map((s, i) => {
        const done = isStopDone(s.status);
        const active = i === activeIdx;
        return (
          <div key={String(s.id)} className="flex min-w-[60px] flex-1 flex-col items-center gap-2">
            <span
              className={`min-h-[17px] text-[13px] leading-[17px] ${
                active ? 'font-bold text-ink' : 'font-medium text-muted'
              }`}
            >
              {clockText(s.eta ?? s.windowStart)}
            </span>
            <span
              className={`flex size-[60px] items-center justify-center rounded-full text-[20px] font-semibold ${
                done
                  ? 'bg-olive-ink text-white'
                  : active
                    ? 'bg-primary text-bg shadow-[0_6px_14px_0_rgba(26,38,59,0.25)]'
                    : 'bg-surface text-ink'
              }`}
            >
              {done ? <Icon name="check" size={20} /> : s.sequence}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function QuickCard({
  href,
  title,
  text,
  tag,
  tint,
  tagInk,
}: {
  href: string;
  title: string;
  text: string;
  tag: string;
  tint: string;
  tagInk: string;
}) {
  const className = `flex h-[124px] w-[158px] shrink-0 flex-col gap-[6px] rounded-card p-[14px] text-left lg:w-auto lg:flex-1 ${tint}`;
  const body = (
    <>
      <span className="text-[15px] font-bold leading-5 text-ink">{title}</span>
      <span className="text-caption leading-4 text-muted">{text}</span>
      <span className="flex-1" />
      <span className="flex items-center">
        <span className="flex-1 text-micro font-medium text-muted">Anytime</span>
        <span className={`rounded-pill bg-surface px-3 py-[6px] text-caption font-semibold leading-4 ${tagInk}`}>
          {tag}
        </span>
      </span>
    </>
  );
  return href.startsWith('tel:') ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

/** Figma "Driver / Home" (phone) and "Driver / Home · Desktop". */
export default function DriverHome() {
  const { me, day, trip, online } = useDriver();
  const pending = usePendingCount();

  const stops = trip ? [...trip.stops].sort((a, b) => a.sequence - b.sequence) : [];
  const activeIdx = stops.findIndex((s) => !isStopDone(s.status));
  const firstStop = stops[0];
  const nextTrip = day?.trips.find((t) => t.id !== trip?.id) ?? null;
  const vehicle = day?.vehicle ?? null;

  const subtitle = [displayName(me?.name), vehicle?.plate, vehicleLabel(vehicle?.type)].filter(Boolean).join(' · ');
  const name = firstName(me?.name);

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <header className="flex flex-col gap-1 pr-[111px]">
        <h1 className="text-[26px] font-semibold leading-8 text-ink lg:text-[32px] lg:leading-10">
          {greeting()}
          {name ? `, ${name}` : ''}
        </h1>
        {subtitle && <p className="text-[13px] font-medium leading-[17px] text-muted">{subtitle}</p>}
        {online && (
          <p
            className={`flex items-center gap-2 pt-3 text-caption font-semibold leading-4 lg:pt-[6px] ${
              pending === 0 ? 'text-success' : 'text-muted'
            }`}
          >
            <span aria-hidden className="size-2 rounded-full bg-current" />
            {pending === 0 ? 'Online · everything synced' : `Online · ${pending} waiting to sync`}
          </p>
        )}
      </header>

      {!online && <OfflineBanner />}

      {trip && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_412px] lg:gap-x-6">
          {/* Today's stops (right column on desktop, above the trips on a phone) */}
          <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
            <section className="flex flex-col gap-4 lg:rounded-card lg:bg-surface lg:p-5">
              <SectionHead
                title="Today’s stops"
                aside={<span className="text-body font-medium leading-[18px] text-muted">Trip {trip.tripNumber}</span>}
              />
              <StopStrip stops={stops} activeIdx={activeIdx} />
              {firstStop && (
                <div className="hidden flex-col gap-1 border-t border-info-tint pt-4 lg:flex">
                  <p className="text-[11px] font-semibold leading-[14px] tracking-[0.06em] text-muted">FIRST STOP</p>
                  <p className="text-[17px] font-bold leading-[22px] text-ink">{firstStop.outletName}</p>
                  <p className="text-[13px] font-medium leading-[17px] text-muted">
                    {[windowText(firstStop.windowStart, firstStop.windowEnd), firstStop.address]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              )}
            </section>

            {vehicle && (
              <section className="hidden items-center gap-3 rounded-card bg-sage p-4 lg:flex">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-success">
                  <Icon name="truck" size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold leading-5 text-ink">{vehicle.plate}</span>
                  <span className="block text-caption font-medium leading-4 text-muted">
                    {vehicleLabel(vehicle.type)}
                  </span>
                </span>
              </section>
            )}
          </div>

          {/* Your trips */}
          <section className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
            <SectionHead
              title="Your trips"
              aside={
                <Link href="/drive/stops" className="text-body font-medium leading-[18px] text-muted">
                  See all
                </Link>
              }
            />
            <div className="flex items-start gap-[10px] lg:gap-4">
              <div className="flex w-[294px] shrink-0 flex-col items-center gap-[6px] self-stretch rounded-hero bg-olive-tint px-4 py-[18px] lg:w-auto lg:min-w-0 lg:flex-1">
                <p className="text-[20px] font-bold leading-[26px] text-ink">Trip {trip.tripNumber}</p>
                <p className="text-[13px] font-medium leading-[17px] text-muted">{stopCount(stops.length)}</p>
                <div className="flex w-full flex-1 items-center justify-center">
                  <img
                    alt=""
                    src="/driver/trip-illustration.svg"
                    className="h-[100px] w-[262px] max-w-full lg:h-[170px] lg:w-full lg:object-contain"
                  />
                </div>
                <Link
                  href="/drive/stops"
                  className="flex w-full items-center justify-center rounded-pill bg-primary px-[18px] py-3 text-[15px] font-semibold leading-5 text-bg"
                >
                  View trip
                </Link>
              </div>

              {nextTrip && (
                <>
                  {/* Phone: the next trip peeks in from the right. */}
                  <div className="relative min-w-0 flex-1 self-stretch overflow-hidden rounded-hero bg-peek lg:hidden">
                    <div className="absolute left-[23.5px] top-[63.5px] flex h-[114px] w-[21px] items-center justify-center">
                      <p className="-rotate-90 whitespace-nowrap text-[16px] font-bold leading-[21px] text-slate">
                        Trip {nextTrip.tripNumber}
                      </p>
                    </div>
                  </div>
                  {/* Desktop: the next trip is a full card. */}
                  <div className="hidden min-w-0 flex-1 flex-col items-center gap-[6px] self-stretch rounded-hero bg-peek px-4 py-[18px] lg:flex">
                    <p className="text-[20px] font-bold leading-[26px] text-ink">Trip {nextTrip.tripNumber}</p>
                    <p className="text-[13px] font-medium leading-[17px] text-muted">
                      {stopCount(nextTrip.stops.length)}
                    </p>
                    <div className="flex w-full flex-1 items-center justify-center">
                      <span className="rounded-pill bg-surface px-[14px] py-2 text-[13px] font-semibold leading-[17px] text-slate">
                        Starts after Trip {trip.tripNumber}
                      </span>
                    </div>
                    <Link
                      href="/drive/stops"
                      className="flex w-full items-center justify-center rounded-pill bg-white/60 px-[18px] py-3 text-[15px] font-semibold leading-5 text-slate"
                    >
                      View trip
                    </Link>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <SectionHead title="Quick actions" />
        <div className="flex gap-[10px] overflow-x-auto lg:gap-4 lg:overflow-visible">
          <QuickCard
            href="/drive/break"
            title="Take a break"
            text="Pause your trip clock"
            tag="Break"
            tint="bg-tech-tint"
            tagInk="text-tech"
          />
          <QuickCard
            href="/drive/report"
            title="Report issue"
            text="Road blocked, damage…"
            tag="Report"
            tint="bg-style-tint"
            tagInk="text-style"
          />
          <QuickCard
            href={telHref(DISPATCH_PHONE)}
            title="Call dispatch"
            text="Talk to the depot"
            tag="Call"
            tint="bg-peek"
            tagInk="text-slate"
          />
        </div>
      </section>
    </div>
  );
}
