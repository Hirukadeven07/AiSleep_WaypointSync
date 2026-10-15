'use client';

import type { StoreFlag } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { TIME_ZONE } from '@/lib/clock';
import { usePoll } from '@/lib/poll';
import { useOnStoreRefresh } from '@/components/store/settings';
import { PageTitle } from '@/components/store/parts';
import { EmptyState } from '@/components/ui/EmptyState';

const ISSUE_LABEL: Record<string, string> = {
  missing: 'Missing',
  damaged: 'Damaged',
  wrong_quantity: 'Wrong quantity',
};

const DECISION = {
  pending: { label: 'Waiting for driver', className: 'bg-warning-tint text-warning' },
  accepted: { label: 'Driver accepted', className: 'bg-success-tint text-success' },
  rejected: { label: 'Driver disputed', className: 'bg-danger-tint text-danger' },
} as const;

function when(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

function FlagGroup({ title, flags }: { title: string; flags: StoreFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <section className="space-y-sm">
      <h2 className="text-label font-semibold text-muted">
        {title} · {flags.length}
      </h2>
      <ul className="space-y-xs">
        {flags.map((f) => {
          const decision = DECISION[f.driverDecision];
          return (
            <li
              key={f.id}
              className={`flex items-center justify-between gap-sm rounded-card px-md py-sm ${
                f.resolveStatus ? 'bg-surface' : 'bg-danger-tint'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-label font-semibold text-ink">{f.itemName}</span>
                <span className={`block text-caption ${f.resolveStatus ? 'text-muted' : 'text-danger'}`}>
                  {ISSUE_LABEL[f.reason] ?? f.reason}
                  {f.qty !== null ? ` · ${f.qty}` : ''}
                  {' · '}
                  {when(f.raisedAt)}
                  {f.resolveStatus ? ' · Resolved' : ' · Not resolved'}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-pill px-chip py-xs text-caption font-semibold ${decision.className}`}
              >
                {decision.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Every item this store has flagged, open ones first. */
export default function FlagsPage() {
  const { data, error, refresh } = usePoll(() => api<StoreFlag[]>('/store/flags'));
  useOnStoreRefresh(refresh);

  const open = data?.filter((f) => !f.resolveStatus) ?? [];
  const resolved = data?.filter((f) => f.resolveStatus) ?? [];

  return (
    <section className="space-y-md lg:max-w-[720px]">
      <PageTitle eyebrow="Flags" title="Flagged items" />
      {!data && error != null && (
        <EmptyState
          title="Could not load flags"
          description="Check the connection. Retrying every 5 seconds."
        />
      )}
      {!data && !error && <p className="text-body text-muted">Loading…</p>}
      {data && data.length === 0 && (
        <EmptyState
          title="No flagged items"
          description="Lines you mark missing, damaged, or the wrong quantity show up here."
        />
      )}
      <FlagGroup title="Not resolved" flags={open} />
      <FlagGroup title="Resolved" flags={resolved} />
    </section>
  );
}
