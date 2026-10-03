'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { StoreNotice, StoreOrderView } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/clock';
import { usePoll } from '@/lib/poll';
import { EmptyState } from '@/components/ui/EmptyState';
import { DeferralCard, PageTitle } from '@/components/store/parts';
import { requestStoreRefresh, useOnStoreRefresh } from '@/components/store/settings';

/** S3: deferral notices and other messages from dispatch. */
export default function UpdatesPage() {
  const notices = usePoll(() => api<StoreNotice[]>('/store/notices'), 15_000);
  const orders = usePoll(() => api<StoreOrderView[]>('/store/orders'), 15_000);
  useOnStoreRefresh(notices.refresh);
  useOnStoreRefresh(orders.refresh);
  const deferred = orders.data?.filter((o) => o.status === 'deferred') ?? [];

  const router = useRouter();

  const refreshNotices = notices.refresh;
  /** Marks the notice read and goes to the screen it is about, when it names one of ours. */
  const open = useCallback(
    async (n: StoreNotice) => {
      if (!n.read) {
        await api(`/store/notices/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
        await refreshNotices();
        requestStoreRefresh();
      }
      if (n.link?.startsWith('/store') && n.link !== '/store/updates') router.push(n.link);
    },
    [refreshNotices, router],
  );

  return (
    <section className="space-y-md lg:max-w-[720px]">
      <PageTitle eyebrow="Updates" title="From dispatch" />

      {deferred.map((o) => (
        <DeferralCard key={o.id} order={o} />
      ))}

      {notices.data && notices.data.length === 0 && deferred.length === 0 && (
        <EmptyState title="No updates" description="Changes to your deliveries show up here." />
      )}
      {!notices.data && notices.loading && <p className="text-body text-muted">Loading…</p>}

      <ul className="space-y-sm">
        {notices.data?.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => open(n)}
              className={`w-full space-y-xs rounded-card p-md text-left ${n.read ? 'bg-surface' : 'bg-info-tint'}`}
            >
              <span className="flex items-start justify-between gap-sm">
                <span className="text-body font-semibold text-ink">{n.title}</span>
                <span className="shrink-0 text-caption text-muted">{formatTime(n.createdAt)}</span>
              </span>
              <span className="block text-label text-muted">{n.body}</span>
              {!n.read && (
                <span className="block text-caption font-semibold text-slate">
                  New · tap to open
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
