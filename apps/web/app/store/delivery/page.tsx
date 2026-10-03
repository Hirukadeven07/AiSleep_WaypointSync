'use client';

import Link from 'next/link';
import type { StoreDelivery } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/poll';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusChip } from '@/components/ui/StatusChip';
import { HandoffTimeline, IssueList, PageTitle } from '@/components/store/parts';

/** S5: where each of today's deliveries is in the handoff, polled every 5 seconds. */
export default function DeliveryPage() {
  const { data, error } = usePoll(() => api<StoreDelivery[]>('/store/deliveries'));

  return (
    <section className="space-y-md">
      <PageTitle eyebrow="Today" title="Delivery" />
      {!data &&
        (error ? (
          <EmptyState title="Could not load deliveries" />
        ) : (
          <p className="text-body text-muted">Loading…</p>
        ))}
      {data && data.length === 0 && (
        <EmptyState
          title="No delivery today"
          description="Deliveries appear here once the plan is published."
        />
      )}
      <div className="space-y-md lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        {data?.map((d) => (
          <div key={d.stopId} className="space-y-md rounded-card bg-surface p-lg">
            <div className="flex items-start justify-between gap-sm">
              <div className="min-w-0">
                <p className="truncate text-title text-ink">{d.plate}</p>
                <p className="text-label text-muted">
                  {d.driverName ?? 'Driver'} · {d.lines.length} lines{d.chilled ? ' · chilled' : ''}
                </p>
              </div>
              <StatusChip status={d.status} />
            </div>
            <HandoffTimeline delivery={d} />
            <IssueList delivery={d} />
            {(d.status === 'arrived' || d.status === 'waiting') && (
              <Link
                href="/store/receive"
                className="flex min-h-[44px] items-center justify-center rounded-pill bg-primary text-body font-semibold text-on-primary"
              >
                Check the goods
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
