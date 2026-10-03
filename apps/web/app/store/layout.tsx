'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Me, StoreHome, StoreNotice } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/poll';
import { RoleGate } from '@/components/shell/RoleGate';
import { PhoneColumn } from '@/components/shell/PhoneColumn';
import { PhoneTabBar, type PhoneTab } from '@/components/shell/PhoneTabBar';
import { PhoneTopRow } from '@/components/shell/PhoneTopRow';
import { Icon } from '@/components/ui/Icon';
import { Toast } from '@/components/ui/Toast';
import { formatDuration, useServerMinutes } from '@/components/store/parts';
import { StoreSidebar } from '@/components/store/StoreSidebar';
import {
  STORE_REFRESH,
  isMuted,
  playChime,
  readLocal,
  showPopup,
  useStoreSettings,
  writeLocal,
} from '@/components/store/settings';

const TABS: PhoneTab[] = [
  { href: '/store', label: 'Home', icon: 'home', exact: true },
  { href: '/store/delivery', label: 'Delivery', icon: 'truck' },
  { href: '/store/order', label: 'Order', icon: 'plus', fab: true },
  { href: '/store/updates', label: 'Updates', icon: 'inbox' },
  { href: '/store/receive', label: 'Receive', icon: 'check' },
];

const REMINDER_DISMISSED = 'ws_store_reminder_dismissed';
const REMINDER_ALERTED = 'ws_store_reminder_alerted';

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <RoleGate role="store">{(me) => <StoreShell me={me}>{children}</StoreShell>}</RoleGate>;
}

/**
 * The store shell plus what every store screen shares: the unread count, alerts and the cutoff
 * reminder. Phone column with a tab bar below 1024px; sidebar layout from 1024px, as the driver app.
 */
function StoreShell({ me, children }: { me: Me; children: ReactNode }) {
  const pathname = usePathname();
  const [settings] = useStoreSettings();
  const notices = usePoll(() => api<StoreNotice[]>('/store/notices'), 15_000);
  const home = usePoll(() => api<StoreHome>('/store/home'), 30_000);
  const nowMin = useServerMinutes(home.data?.nowMin);
  const [toast, setToast] = useState<string>();
  const clearToast = useCallback(() => setToast(undefined), []);
  const [dismissedDay, setDismissedDay] = useState<string | null>(null);

  useEffect(() => setDismissedDay(readLocal(REMINDER_DISMISSED)), []);

  const refreshNotices = notices.refresh;
  const refreshHome = home.refresh;
  useEffect(() => {
    const refresh = () => {
      void refreshNotices();
      void refreshHome();
    };
    window.addEventListener(STORE_REFRESH, refresh);
    return () => window.removeEventListener(STORE_REFRESH, refresh);
  }, [refreshNotices, refreshHome]);

  // Alert once for each notice that arrives while the app is open; what was already there stays quiet.
  const seen = useRef<Set<string>>();
  useEffect(() => {
    if (!notices.data) return;
    const unread = notices.data.filter((n) => !n.read);
    if (!seen.current) {
      seen.current = new Set(unread.map((n) => n.id));
      return;
    }
    const fresh = unread.filter((n) => !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    const loud = fresh.filter((n) => !isMuted(n, settings));
    if (!settings.alerts || loud.length === 0) return;
    setToast(loud.length === 1 ? loud[0]!.title : `${loud.length} new updates`);
    if (settings.sound) playChime();
    void showPopup(loud[0]!.title, loud[0]!.body);
  }, [notices.data, settings]);

  const unread = notices.data?.filter((n) => !n.read && !isMuted(n, settings)).length ?? 0;

  const today = home.data?.today;
  const left = home.data && nowMin !== undefined ? home.data.cutoffMin - nowMin : undefined;
  const reminderDue =
    settings.cutoffReminderMin > 0 &&
    left !== undefined &&
    left > 0 &&
    left <= settings.cutoffReminderMin &&
    !home.data?.nextOrder;

  // The sound and pop-up for the reminder fire once a day; the banner stays until it is dismissed.
  useEffect(() => {
    if (!reminderDue || !today || left === undefined) return;
    if (readLocal(REMINDER_ALERTED) === today) return;
    writeLocal(REMINDER_ALERTED, today);
    if (!settings.alerts) return;
    if (settings.sound) playChime();
    void showPopup('Ordering closes soon', `${formatDuration(left)} left to order for tomorrow.`);
  }, [reminderDue, today, left, settings.alerts, settings.sound]);

  const showReminder = reminderDue && dismissedDay !== today && pathname !== '/store/order';
  const tabs = TABS.map((t) => (t.href === '/store/updates' ? { ...t, badge: unread } : t));

  return (
    <div className="lg:flex lg:min-h-dvh">
      <StoreSidebar me={me} tabs={tabs} storeName={home.data?.storeName} />
      <PhoneColumn className="lg:relative lg:mx-0 lg:min-w-0 lg:max-w-none lg:flex-1">
        <div className="relative lg:hidden">
          <PhoneTopRow me={me} />
          <Link
            href="/store/settings"
            aria-label="Settings"
            className="absolute right-5 top-1.5 flex size-9 items-center justify-center rounded-full bg-sand text-primary"
          >
            <Icon name="settings" size={16} />
          </Link>
        </div>
        <main className="flex-1 px-5 pb-[130px] pt-2 lg:px-10 lg:py-8">
          {/* Wide screens stop growing here, so lines stay readable. */}
          <div className="lg:max-w-[1160px]">
            {showReminder && left !== undefined && (
              <div className="mb-md flex items-center gap-sm rounded-card bg-warning-tint p-md">
                <Link href="/store/order" className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-ink">
                    Ordering closes in {formatDuration(left)}
                  </span>
                  <span className="block text-label text-muted">
                    Nothing ordered for tomorrow yet. Order now ›
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label="Dismiss reminder"
                  onClick={() => {
                    if (!today) return;
                    writeLocal(REMINDER_DISMISSED, today);
                    setDismissedDay(today);
                  }}
                  className="flex size-11 shrink-0 items-center justify-center text-muted"
                >
                  <Icon name="x" size={18} />
                </button>
              </div>
            )}
            {children}
          </div>
        </main>
      </PhoneColumn>
      <div className="lg:hidden">
        <PhoneTabBar tabs={tabs} />
      </div>
      {toast && <Toast message={toast} onClose={clearToast} durationMs={6000} />}
    </div>
  );
}
