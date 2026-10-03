'use client';

import { Icon } from '@/components/ui/Icon';
import { rejectedText, useRejected } from '@/lib/sync-rejected';

/** Actions the server refused on sync, so the driver is never left thinking they were saved. */
export function RejectedBanner() {
  const { rejected, dismiss } = useRejected();
  if (rejected.length === 0) return null;
  const latest = rejected.slice(-3).reverse();
  return (
    <section
      role="alert"
      className="mb-4 flex flex-col gap-2 rounded-card bg-danger-tint p-4"
      aria-label="Actions not saved"
    >
      <p className="flex items-center gap-2 text-[15px] font-semibold leading-5 text-ink">
        <Icon name="alert" size={16} className="text-danger" />
        {rejected.length === 1
          ? 'An action was not saved'
          : `${rejected.length} actions were not saved`}
      </p>
      {latest.map((r) => (
        <p key={r.clientId} className="text-[14px] leading-5 text-ink">
          {rejectedText(r)}
        </p>
      ))}
      <p className="text-[13px] leading-[17px] text-muted">
        Check your stops and try again, or call dispatch.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="self-start rounded-pill border border-border bg-surface px-4 py-2 text-[14px] font-semibold text-ink"
      >
        OK
      </button>
    </section>
  );
}
