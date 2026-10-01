'use client';

import Link from 'next/link';
import type { StoreHome } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { formatMinutes } from '@/lib/clock';
import { usePoll } from '@/lib/poll';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { StatusChip } from '@/components/ui/StatusChip';
import {
  DeferralCard,
  HandoffTimeline,
  PageTitle,
  formatDate,
  formatDuration,
  useServerMinutes,
} from '@/components/store/parts';

/** S1: delivery window, order cutoff countdown, today's delivery and any deferral. */
export default function StoreHomePage() {
  const { data, error } = usePoll(() => api<StoreHome>('/store/home'), 15_000);
  const nowMin = useServerMinutes(data?.nowMin);

  if (!data) {
    return error ? (
      <EmptyState
        title="Could not load your store"
        description="Check the connection. Retrying shortly."
      />
    ) : (
      <p className="text-body text-muted">Loading…</p>
    );
  }

  const open = nowMin !== undefined && nowMin < data.cutoffMin;
  const left = nowMin !== undefined ? data.cutoffMin - nowMin : 0;
  const canReceive = data.delivery && ['arrived', 'waiting'].includes(data.delivery.status);

  return (
    <section className="space-y-md">
      <PageTitle eyebrow={data.brand} title={data.storeName} />

      <div className="grid grid-cols-2 gap-sm">
        <div className="rounded-card bg-surface p-md">
          <p className="text-caption text-muted">Delivery window</p>
          <p className="text-title text-ink">
            {formatMinutes(data.windowOpenMin)}–{formatMinutes(data.windowCloseMin)}
          </p>
        </div>
        <div
          className={`rounded-card p-md ${open ? (left <= 60 ? 'bg-warning-tint' : 'bg-surface') : 'bg-border'}`}
        >
          <p className="text-caption text-muted">Order cutoff {formatMinutes(data.cutoffMin)}</p>
          <p
            className={`text-title ${open ? (left <= 60 ? 'text-warning' : 'text-ink') : 'text-muted'}`}
          >
            {open ? `${formatDuration(left)} left` : 'Ordering closed'}
          </p>
        </div>
      </div>

      {data.deferral && (
        <Link href="/store/updates" className="block">
          <DeferralCard order={data.deferral} />
        </Link>
      )}

      {canReceive && (
        <Link
          href="/store/receive"
          className="flex items-center gap-md rounded-card bg-primary p-lg text-on-primary shadow-raised"
        >
          <Icon name="truck" />
          <span className="flex-1">
            <span className="block text-title">The driver is here</span>
            <span className="block text-label opacity-80">Check the goods and confirm receipt</span>
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}

      <div className="space-y-md rounded-card bg-surface p-lg">
        <div className="flex items-center justify-between gap-sm">
          <p className="text-title text-ink">Today&apos;s delivery</p>
          {data.delivery && <StatusChip status={data.delivery.status} />}
        </div>
        {data.delivery ? (
          <>
            <p className="text-label text-muted">
              {data.delivery.plate}
              {data.delivery.driverName ? ` · ${data.delivery.driverName}` : ''} ·{' '}
              {data.delivery.lines.length} lines
            </p>
            <HandoffTimeline delivery={data.delivery} />
          </>
        ) : (
          <p className="text-body text-muted">No delivery planned for {formatDate(data.today)}.</p>
        )}
      </div>

      <div className="flex items-center gap-md rounded-card bg-surface p-lg">
        <div className="min-w-0 flex-1">
          <p className="text-title text-ink">Next order</p>
          <p className="text-label text-muted">
            {data.nextOrder
              ? `${formatDate(data.nextOrder.deliveryDate)} · ${data.nextOrder.units} units · ${data.nextOrder.status}`
              : 'Nothing ordered for tomorrow yet.'}
          </p>
        </div>
        {open && (
          <Link
            href="/store/order"
            className="shrink-0 rounded-pill bg-olive px-md py-sm text-label font-semibold text-ink"
          >
            Order
          </Link>
        )}
      </div>
    </section>
  );
}
