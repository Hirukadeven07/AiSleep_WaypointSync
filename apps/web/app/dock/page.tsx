'use client';

import Link from 'next/link';
import type { LoadQueueItem } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/poll';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusChip } from '@/components/ui/StatusChip';
import { Icon } from '@/components/ui/Icon';

/** L2: today's published trips for this depot, in loading order. */
export default function DockQueuePage() {
  const { data, error, loading } = usePoll(() => api<LoadQueueItem[]>('/loads'));

  return (
    <section className="space-y-md">
      <div className="flex items-end justify-between gap-sm">
        <div>
          <p className="text-eyebrow uppercase text-muted">Today</p>
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

      <ul className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((t) => (
          <li key={t.tripId}>
            <QueueCard trip={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function QueueCard({ trip }: { trip: LoadQueueItem }) {
  const started = trip.status !== 'published';
  return (
    <Link
      href={`/dock/${trip.tripId}`}
      className="flex h-full flex-col gap-md rounded-card bg-surface p-lg outline-none ring-primary focus-visible:ring-2"
    >
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
    </Link>
  );
}
