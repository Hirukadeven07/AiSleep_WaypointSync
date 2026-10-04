'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LoadQueueItem } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/poll';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusChip } from '@/components/ui/StatusChip';
import { Icon } from '@/components/ui/Icon';
import { JobNote } from '@/components/dock/JobNote';
import { StartLoadingSheet } from '@/components/dock/StartLoadingSheet';

/** L2: published trips for this depot, today and tomorrow's plan, in loading order. */
export default function DockQueuePage() {
  const { data, error, loading } = usePoll(() => api<LoadQueueItem[]>('/loads'));

  return (
    <section className="space-y-md">
      <div className="flex items-end justify-between gap-sm">
        <div>
          <p className="text-eyebrow uppercase text-muted">To load</p>
          <h1 className="text-heading font-semibold text-ink">Loading queue</h1>
        </div>
        {data && <p className="text-label text-muted">{data.length} trips</p>}
      </div>

      {loading && !data && <p className="text-body text-muted">Loading trips…</p>}
      {error && !data ? (
        <EmptyState
          title="Could not load the queue"
          description="Check the connection. Retrying every 5 seconds."
        />
      ) : null}
      {data && data.length === 0 && (
        <EmptyState
          title="No trips to load"
          description="Trips appear here as soon as the dispatcher publishes the plan."
        />
      )}

      {/* Today's trips first, then tomorrow's plan (loaded the evening before), each under a heading. */}
      {(
        [
          ['Today', data?.filter((t) => !t.later) ?? []],
          ['Tomorrow', data?.filter((t) => t.later) ?? []],
        ] as const
      ).map(([day, trips]) =>
        trips.length === 0 ? null : (
          <div key={day} className="space-y-sm">
            <h2 className="text-title font-semibold text-ink">
              {day} <span className="text-label font-normal text-muted">· {trips.length}</span>
            </h2>
            <ul className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
              {trips.map((t) => (
                <li key={t.tripId}>
                  <QueueCard trip={t} />
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </section>
  );
}

function QueueCard({ trip }: { trip: LoadQueueItem }) {
  const started = trip.status !== 'published';
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const cardClass =
    'flex h-full w-full flex-col gap-md rounded-card bg-surface p-lg text-left outline-none ring-primary focus-visible:ring-2';
  const body = (
    <>
      <div className="flex items-start justify-between gap-sm">
        <div className="min-w-0">
          <p className="truncate text-title text-ink">{trip.vehicle.plate ?? trip.vehicle.id}</p>
          <p className="text-label text-muted">
            {trip.vehicle.type} · {trip.vehicle.temp} · Trip {trip.tripNumber}
          </p>
        </div>
        <StatusChip status={trip.status} />
      </div>

      <div className="flex flex-wrap gap-xs">
        <span className="rounded-pill bg-olive-tint px-chip py-xs text-caption font-semibold text-olive-ink">
          {trip.brand}
        </span>
        <span className="rounded-pill bg-info-tint px-chip py-xs text-caption font-semibold text-slate">
          {trip.district}
        </span>
        {trip.vehicle.temp === 'reefer' && (
          <span className="rounded-pill bg-chilled-tint px-chip py-xs text-caption font-semibold text-chilled">
            Chilled
          </span>
        )}
      </div>

      <p className="text-body text-ink">
        {trip.stopCount} stops · {trip.lineCount} lines
      </p>

      <JobNote job={trip.job} compact />

      <div className="mt-auto flex items-center justify-between gap-sm">
        <p className="flex min-w-0 items-center gap-xs text-label text-muted">
          <Icon name="user" size={16} />
          <span className="truncate">
            {trip.loaderNames.length ? trip.loaderNames.join(', ') : 'Nobody loading yet'}
          </span>
        </p>
        <span className="shrink-0 rounded-pill bg-primary px-md py-sm text-label text-on-primary">
          {started ? 'Continue' : 'Start loading'}
        </span>
      </div>
    </>
  );
  // Starting a truck first asks who is loading; a truck already being loaded opens straight away.
  return started ? (
    <Link href={`/dock/${trip.tripId}`} className={cardClass}>
      {body}
    </Link>
  ) : (
    <>
      <button type="button" onClick={() => setAdding(true)} className={cardClass}>
        {body}
      </button>
      {adding && (
        <StartLoadingSheet
          tripId={trip.tripId}
          title="Start loading"
          initialNames={trip.loaderNames}
          onClose={() => setAdding(false)}
          onContinue={() => router.push(`/dock/${trip.tripId}`)}
        />
      )}
    </>
  );
}
