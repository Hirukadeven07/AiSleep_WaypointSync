'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ROAD_ISSUE_LABEL,
  WAIT_ALERT_MIN,
  type DriverDayHandover,
  type DriverDayStop,
} from '@waypoint/contracts';
import { OfflineBanner } from '@/components/drive/OfflineBanner';
import { useDriver } from '@/components/drive/DriverShell';
import { Icon } from '@/components/ui/Icon';
import { fullDay } from '@/lib/driver-cache';
import {
  DISPATCH_PHONE,
  clockText,
  isStopDone,
  mapsUrl,
  telHref,
  windowText,
} from '@/lib/driver-format';
import { enqueueAction, getPendingActions, subscribeOutbox } from '@/lib/outbox';
import { useRoadIssue, writeRoadIssue } from '@/lib/road-issue';
import { useBreak } from '@/lib/use-break';

const DOCK: Record<DriverDayHandover['dockType'], string> = {
  rear_dock: 'Rear loading dock',
  street: 'Street drop at the shop front',
  mall_bay: 'Mall goods bay',
};
const PARKING: Record<DriverDayHandover['parking'], string | null> = {
  normal: null,
  van_only: 'Only a van can park here',
  mall_dock: 'Use the mall goods dock, not the car park',
};
/** Trips that have not left the depot yet. */
const AT_DEPOT = new Set(['published', 'loading', 'ready']);
/** The driver is at the store and the store is checking the goods. */
const AT_STORE = new Set(['arrived', 'waiting']);

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });

function handoverLines(h: DriverDayHandover | undefined): string[] {
  if (!h) return [];
  return [
    DOCK[h.dockType],
    PARKING[h.parking],
    h.mallWindow ? `Mall delivery slot ${h.mallWindow}` : null,
  ].filter((x): x is string => Boolean(x));
}

/** Arrivals, acknowledgements and road-issue reports still waiting on this phone to be sent. */
function useQueued() {
  const [queued, setQueued] = useState<{
    arrived: Map<string, string>;
    acked: Set<string>;
    roadIssueTrips: Set<string>;
  }>({
    arrived: new Map(),
    acked: new Set(),
    roadIssueTrips: new Set(),
  });
  useEffect(() => {
    let alive = true;
    const check = () =>
      getPendingActions()
        .then((list) => {
          if (!alive) return;
          const arrived = new Map<string, string>();
          const acked = new Set<string>();
          const roadIssueTrips = new Set<string>();
          for (const a of list) {
            const stopId = String(a.payload.stopId ?? '');
            if (a.type === 'ARRIVED') arrived.set(stopId, a.createdOnPhoneAt);
            if (a.type === 'ACKNOWLEDGEMENT') acked.add(stopId);
            if (a.type === 'ROAD_ISSUE' && a.tripId != null) roadIssueTrips.add(String(a.tripId));
          }
          setQueued({ arrived, acked, roadIssueTrips });
        })
        .catch(() => {});
    check();
    const unsubscribe = subscribeOutbox(check);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return queued;
}

/** The clock, ticking once a second while `on`. */
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-px flex-1 flex-col gap-1 rounded-input bg-bg px-3 py-[10px]">
      <span className="text-[11px] font-semibold leading-[14px] tracking-[0.06em] text-muted">
        {label}
      </span>
      <span className="text-[20px] font-bold leading-[26px] text-ink">{value || '–'}</span>
    </div>
  );
}

function CallStore({ stop, primary = false }: { stop: DriverDayStop; primary?: boolean }) {
  const look = primary ? 'bg-primary text-bg' : 'border border-border bg-surface text-ink';
  return stop.phone ? (
    <a
      href={telHref(stop.phone)}
      className={`flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-pill px-4 text-[16px] font-semibold ${look}`}
    >
      <Icon name="phone" size={17} />
      {primary ? 'Call the store now' : 'Call store'}
    </a>
  ) : (
    <span className="flex min-h-[52px] flex-1 items-center justify-center rounded-pill bg-bg px-4 text-[15px] text-muted">
      No phone number
    </span>
  );
}

function StopDetails({ stop }: { stop: DriverDayStop }) {
  const handover = handoverLines(stop.handover);
  return (
    <section className="flex flex-col gap-3 rounded-card bg-surface p-4" aria-label="Stop details">
      <div className="flex gap-2">
        <Fact label="ETA" value={clockText(stop.eta)} />
        <Fact label="WINDOW" value={windowText(stop.windowStart, stop.windowEnd)} />
      </div>
      <div className="flex flex-col gap-1 rounded-input bg-bg px-3 py-[10px]">
        <span className="text-[11px] font-semibold leading-[14px] tracking-[0.06em] text-muted">
          HANDOVER
        </span>
        {handover.length > 0 ? (
          handover.map((line) => (
            <span key={line} className="text-[15px] font-medium leading-5 text-ink">
              {line}
            </span>
          ))
        ) : (
          <span className="text-[15px] leading-5 text-muted">No handover details on file</span>
        )}
        {stop.urgentNote && (
          <span className="mt-1 flex items-start gap-2 text-[14px] font-semibold leading-5 text-warning">
            <Icon name="alert" size={15} className="mt-[2px] shrink-0" />
            {stop.urgentNote}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <CallStore stop={stop} />
        <a
          href={mapsUrl(stop)}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-pill border border-border bg-surface px-4 text-[16px] font-semibold text-ink"
        >
          <Icon name="arrow-up-right" size={17} />
          Navigate
        </a>
      </div>
    </section>
  );
}

/**
 * Figma "Driver / Next stop" and "Driver / Waiting at the store". Only the stop the driver is on:
 * address, ETA, window, handover and a call. "I've arrived" tells the store and starts the wait;
 * after WAIT_ALERT_MIN minutes dispatch is alerted (by the server) and the driver calls the store.
 * The driver never marks the goods fine: they acknowledge once the store's receipt exists, and
 * must do so before the next stop shows. An open road issue pauses the next stop.
 */
export function NextStop() {
  const { day, trip: active, online, refresh } = useDriver();
  const full = fullDay(day);
  const trip = full?.trips.find((t) => t.id === active?.id) ?? full?.trips[0] ?? null;
  const stops = trip ? [...trip.stops].sort((a, b) => a.sequence - b.sequence) : [];
  const queued = useQueued();
  const localIssue = useRoadIssue(trip?.id);
  // The server's open issue covers a reinstalled or other phone. While this phone still has a
  // report or a "resume" to send, its own copy is the newer one.
  const serverIssue =
    trip && full?.roadIssue?.tripId === trip.id && !queued.roadIssueTrips.has(trip.id)
      ? full.roadIssue
      : null;
  const issue = localIssue ?? serverIssue;
  const onBreak = useBreak();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const acked = (s: DriverDayStop) => Boolean(s.driverAckAt) || queued.acked.has(s.id);
  // The stop the driver is on: not finished yet, or finished but not acknowledged.
  const stop = stops.find(
    (s) => !isStopDone(s.status) || (Boolean(s.storeConfirmedAt) && !acked(s)),
  );
  const arrivedAt = stop ? (stop.arrivedAt ?? queued.arrived.get(stop.id) ?? null) : null;
  const phase: 'travel' | 'waiting' | 'ack' | null = !stop
    ? null
    : stop.storeConfirmedAt
      ? 'ack'
      : AT_STORE.has(stop.status) || queued.arrived.has(stop.id)
        ? 'waiting'
        : 'travel';

  const now = useNow(phase === 'waiting');
  useEffect(() => setMessage(null), [stop?.id, phase]);

  // While waiting, look for the store's receipt every 15 s.
  useEffect(() => {
    if (phase !== 'waiting') return;
    const t = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(t);
  }, [phase, refresh]);

  if (!trip || !stop) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[26px] font-semibold leading-8 text-ink">Next stop</h1>
        {!online && <OfflineBanner />}
        <p className="rounded-card bg-surface p-4 text-[15px] leading-5 text-muted">
          {trip
            ? `All stops on Trip ${trip.tripNumber} are done. Head back to the depot.`
            : 'No trip for you today yet. Dispatch sends it here once it is planned.'}
        </p>
        <Link href="/drive/stops" className="text-[15px] font-semibold text-slate">
          See the whole trip
        </Link>
      </div>
    );
  }

  const index = stops.indexOf(stop) + 1;
  const waited = arrivedAt ? Math.max(0, Math.floor((now - Date.parse(arrivedAt)) / 1000)) : 0;
  const waitedMin = Math.floor(waited / 60);
  const longWait = waitedMin >= WAIT_ALERT_MIN;

  async function send(run: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await run();
    } catch {
      setMessage('Could not save that on this phone. Try again, or call dispatch.');
    } finally {
      setBusy(false);
    }
  }

  const arrived = () => {
    if (AT_DEPOT.has(trip.status)) {
      setMessage('You can mark arrival once the trip has left the depot.');
      return;
    }
    void send(() => enqueueAction('ARRIVED', { stopId: stop.id }, trip.id, trip.planVersion));
  };
  const acknowledge = () =>
    void send(() =>
      enqueueAction('ACKNOWLEDGEMENT', { stopId: stop.id }, trip.id, trip.planVersion),
    );
  const resume = () =>
    void send(async () => {
      if (!issue) return;
      await enqueueAction(
        'ROAD_ISSUE',
        { status: 'resolved', kind: issue.kind, note: null, photo: null, location: null },
        trip.id,
        trip.planVersion,
      );
      writeRoadIssue(trip.id, null);
    });

  // A break pauses the next stop until the driver ends it.
  if (onBreak.onBreakSince !== null && phase === 'travel') {
    return (
      <div className="flex flex-col gap-4 lg:max-w-[640px]">
        <header className="flex flex-col gap-1 pr-[111px]">
          <p className="text-[13px] font-semibold leading-[17px] text-muted">
            Next stop · {index} of {stops.length} · Trip {trip.tripNumber}
          </p>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">On break</h1>
        </header>
        {!online && <OfflineBanner />}
        <section
          className="flex flex-col gap-2 rounded-card bg-tech-tint p-4"
          aria-label="On break"
          role="status"
        >
          <p className="flex items-center gap-2 text-[17px] font-semibold leading-[22px] text-ink">
            <Icon name="coffee" size={18} className="text-tech" />
            Since {timeOf(new Date(onBreak.onBreakSince).toISOString())}
          </p>
          <p className="text-[14px] leading-5 text-muted">
            {stop.outletName} waits until you end the break. Dispatch can see you are on a break.
          </p>
        </section>
        <button
          type="button"
          onClick={() => void send(onBreak.end)}
          disabled={busy}
          className="flex min-h-[56px] items-center justify-center rounded-pill bg-primary px-5 text-[17px] font-semibold text-bg disabled:opacity-60"
        >
          End break and resume
        </button>
        {message && (
          <p role="alert" className="text-[14px] font-medium leading-5 text-danger">
            {message}
          </p>
        )}
      </div>
    );
  }

  // A reported road issue pauses the next stop until the driver resumes.
  if (issue && phase === 'travel') {
    return (
      <div className="flex flex-col gap-4 lg:max-w-[640px]">
        <header className="flex flex-col gap-1 pr-[111px]">
          <p className="text-[13px] font-semibold leading-[17px] text-muted">
            Next stop · {index} of {stops.length} · Trip {trip.tripNumber}
          </p>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Trip paused</h1>
        </header>
        {!online && <OfflineBanner />}
        <section
          className="flex flex-col gap-2 rounded-card bg-danger-tint p-4"
          aria-label="Trip paused"
          role="status"
        >
          <p className="flex items-center gap-2 text-[17px] font-semibold leading-[22px] text-ink">
            <Icon name="alert" size={18} className="text-danger" />
            {ROAD_ISSUE_LABEL[issue.kind]} · reported {timeOf(issue.reportedAt)}
          </p>
          {issue.note && <p className="text-[15px] leading-5 text-ink">{issue.note}</p>}
          <p className="text-[14px] leading-5 text-muted">
            Dispatch has been told. {stop.outletName} waits until you resume.
          </p>
        </section>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resume}
            disabled={busy}
            className="flex min-h-[56px] flex-1 items-center justify-center rounded-pill bg-primary px-5 text-[17px] font-semibold text-bg disabled:opacity-60"
          >
            Resume trip
          </button>
          <a
            href={telHref(DISPATCH_PHONE)}
            className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-pill border border-border bg-surface px-5 text-[17px] font-semibold text-ink"
          >
            <Icon name="phone" size={17} />
            Call dispatch
          </a>
        </div>
        {message && (
          <p role="alert" className="text-[14px] font-medium leading-5 text-danger">
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:max-w-[640px]">
      <header className="flex flex-col gap-1 pr-[111px]">
        <p className="text-[13px] font-semibold leading-[17px] text-muted">
          {phase === 'travel' ? 'Next stop' : 'At the store'} · {index} of {stops.length} · Trip{' '}
          {trip.tripNumber}
        </p>
        <h1 className="text-[26px] font-semibold leading-8 text-ink lg:text-[32px] lg:leading-10">
          {stop.outletName}
        </h1>
        <p className="flex items-center gap-[6px] text-[15px] font-medium leading-5 text-muted">
          <Icon name="pin" size={15} />
          {stop.address || 'No address on file'}
        </p>
      </header>

      {!online && <OfflineBanner />}

      {phase === 'travel' && AT_DEPOT.has(trip.status) && (
        <section
          className="flex flex-col gap-1 rounded-card bg-surface p-4"
          aria-label="Waiting for the loader"
          role="status"
        >
          <p className="text-[17px] font-semibold leading-[22px] text-ink">
            Waiting for the loader
          </p>
          <p className="text-[14px] leading-5 text-muted">
            You can leave once the loader confirms the truck is loaded. This screen updates on its
            own.
          </p>
        </section>
      )}

      {phase === 'waiting' && (
        <section
          className={`flex flex-col items-center gap-2 rounded-card p-5 text-center ${
            longWait ? 'bg-warning-tint' : 'bg-sage'
          }`}
          aria-label="Waiting for the store"
          role="status"
        >
          <p className="text-[13px] font-semibold leading-[17px] text-muted">
            {queued.arrived.has(stop.id)
              ? 'Saved on this phone. The store is told as soon as you have signal.'
              : `Store notified${arrivedAt ? ` at ${timeOf(arrivedAt)}` : ''}`}
          </p>
          <p className="text-[44px] font-bold leading-[52px] text-ink" aria-label="Time waiting">
            {waitedMin}:{String(waited % 60).padStart(2, '0')}
          </p>
          <p className="text-[15px] font-medium leading-5 text-ink">
            Waiting for the store to check the goods and confirm in their app.
          </p>
          {longWait && (
            <>
              <p className="flex items-start gap-2 text-left text-[14px] font-semibold leading-5 text-warning">
                <Icon name="alert" size={16} className="mt-[2px] shrink-0" />
                {WAIT_ALERT_MIN}+ minutes. Dispatch has been alerted. Call the store now.
              </p>
              <div className="flex w-full pt-1">
                <CallStore stop={stop} primary />
              </div>
            </>
          )}
        </section>
      )}

      {phase === 'ack' && (
        <section
          className="flex flex-col gap-1 rounded-card bg-sage p-4"
          aria-label="Store confirmed"
          role="status"
        >
          <p className="flex items-center gap-2 text-[17px] font-semibold leading-[22px] text-ink">
            <Icon name="check" size={18} className="text-success" />
            Store confirmed the receipt
            {stop.storeConfirmedAt ? ` at ${timeOf(stop.storeConfirmedAt)}` : ''}
          </p>
          <p className="text-[14px] leading-5 text-muted">Acknowledge it to see your next stop.</p>
        </section>
      )}

      <StopDetails stop={stop} />

      {phase === 'travel' ? (
        <button
          type="button"
          onClick={arrived}
          disabled={busy}
          className="flex min-h-[60px] items-center justify-center gap-2 rounded-pill bg-primary px-6 text-[18px] font-semibold text-bg disabled:opacity-60"
        >
          <Icon name="pin" size={19} />
          I&apos;ve arrived
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={acknowledge}
            disabled={busy || phase !== 'ack'}
            className="flex min-h-[60px] items-center justify-center gap-2 rounded-pill bg-primary px-6 text-[18px] font-semibold text-bg disabled:bg-bg disabled:text-muted"
          >
            <Icon name="check" size={19} />
            Acknowledge receipt
          </button>
          {phase === 'waiting' && (
            <p className="text-center text-caption leading-4 text-muted">
              Unlocks when the store confirms the receipt in their app.
            </p>
          )}
        </div>
      )}
      {message && (
        <p role="alert" className="text-[14px] font-medium leading-5 text-danger">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/drive/stops" className="text-[15px] font-semibold text-slate">
          See the whole trip
        </Link>
        <Link href="/drive/report" className="text-[15px] font-semibold text-danger">
          Report a road issue
        </Link>
      </div>
    </div>
  );
}
