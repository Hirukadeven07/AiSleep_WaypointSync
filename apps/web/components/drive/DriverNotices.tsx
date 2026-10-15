'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { DriverNotice } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { LIVE_NOTICE } from '@/lib/live-notices';
import { OfflineBanner } from './OfflineBanner';
import { useDriver } from './DriverShell';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Colombo',
  });

/** What dispatch and stores sent this driver: trip published, plan changed, goods checked. */
export function DriverNotices() {
  const { online, refresh } = useDriver();
  const [notices, setNotices] = useState<DriverNotice[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/notices', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      setNotices((await res.json()) as DriverNotice[]);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, online]);

  useEffect(() => {
    const onNotice = () => void load();
    window.addEventListener(LIVE_NOTICE, onNotice);
    return () => window.removeEventListener(LIVE_NOTICE, onNotice);
  }, [load]);

  // Opening the list reads every unread notice; the home badge then catches up.
  useEffect(() => {
    const unread = notices?.filter((n) => !n.read) ?? [];
    if (unread.length === 0) return;
    void Promise.all(
      unread.map((n) =>
        fetch(`/api/driver/notices/${n.id}/read`, { method: 'POST', credentials: 'same-origin' }),
      ),
    )
      .then(() => refresh())
      .catch(() => {});
  }, [notices, refresh]);

  return (
    <div className="flex flex-col gap-4 lg:max-w-[640px]">
      <h1 className="text-[26px] font-semibold leading-8 text-ink">Messages</h1>
      {!online && <OfflineBanner />}
      {notices === null ? (
        <p className="rounded-card bg-surface p-4 text-[15px] leading-5 text-muted">
          {failed ? 'Messages need a signal. They load when you are back online.' : 'Loading…'}
        </p>
      ) : notices.length === 0 ? (
        <p className="rounded-card bg-surface p-4 text-[15px] leading-5 text-muted">
          No messages yet. Dispatch tells you here when a trip is ready or changes.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notices.map((n) => (
            <li key={n.id} className="flex gap-3 rounded-card bg-surface p-4">
              <span
                className={`mt-1 size-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-danger'}`}
                aria-label={n.read ? undefined : 'New'}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[15px] font-semibold leading-5 text-ink">{n.title}</span>
                <span className="text-[14px] leading-5 text-muted">{n.body}</span>
                <span className="text-caption leading-4 text-faint">{when(n.createdAt)}</span>
              </span>
              {n.link?.startsWith('/drive') && (
                <Link href={n.link} aria-label="Open" className="self-center text-slate">
                  <Icon name="chevron-right" size={18} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
