'use client';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthError, fetchDriverDay, fetchMe } from '@/lib/driver-api';
import { subscribeOutbox } from '@/lib/outbox';
import { flushOutbox } from '@/lib/sync-runner';
import {
  clearCachedShell,
  pickActiveTrip,
  readCachedShell,
  writeCachedShell,
  type DriverDay,
  type Me,
  type TripSummary,
} from '@/lib/driver-cache';
import { signOutDriver } from '@/lib/driver-sign-out';
import { useRoadPings } from '@/lib/use-road-pings';
import { LiveNoticeAlerts } from '@/components/shell/LiveNotices';
import { DriverSidebar } from '@/components/shell/DriverSidebar';
import { PhoneColumn } from '@/components/shell/PhoneColumn';
import { PhoneTabBar } from '@/components/shell/PhoneTabBar';
import { PhoneTopRow } from '@/components/shell/PhoneTopRow';
import { DRIVER_TABS } from '@/components/shell/driverTabs';
import { SosControl } from './SosControl';
import { OfflineBanner } from './OfflineBanner';
import { RejectedBanner } from './RejectedBanner';

interface DriverContextValue {
  me: Me | null;
  day: DriverDay | null;
  trip: TripSummary | null;
  online: boolean;
  /** true while showing saved details that have not been refreshed from the server */
  stale: boolean;
  cachedAt: string | null;
  refresh: () => Promise<void>;
}

const DriverContext = createContext<DriverContextValue | null>(null);

export function useDriver(): DriverContextValue {
  const ctx = useContext(DriverContext);
  if (!ctx) throw new Error('useDriver must be used inside <DriverShell>');
  return ctx;
}

type Phase = 'loading' | 'ready' | 'no-access' | 'offline-empty';

export function DriverShell({ children }: { children: ReactNode }) {
  return <ShellInner>{children}</ShellInner>;
}

function ShellInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === '/drive/login';
  const isSos = pathname === '/drive/sos';

  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [day, setDay] = useState<DriverDay | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchMe();
      if (fresh.role !== 'driver') {
        setPhase('no-access');
        return;
      }
      let nextDay = readCachedShell()?.day ?? null; // keep saved trips if only the trips call fails
      try {
        nextDay = await fetchDriverDay();
      } catch (e) {
        if (e instanceof AuthError) throw e;
      }
      const saved = writeCachedShell({ me: fresh, day: nextDay });
      setMe(fresh);
      setDay(nextDay);
      setCachedAt(saved.cachedAt);
      setStale(false);
      setOnline(true);
      setPhase('ready');
    } catch (e) {
      if (e instanceof AuthError) {
        clearCachedShell();
        setMe(null);
        setDay(null);
        router.replace('/login/driver');
        return;
      }
      // Network trouble: keep whatever is on screen
      setOnline(false);
      setStale(true);
      setPhase((p) => (p === 'loading' ? 'offline-empty' : p));
    }
  }, [router]);

  // Load on entry: paint the saved state immediately, then refresh from the server.
  useEffect(() => {
    if (isLogin) return;
    const cached = readCachedShell();
    if (cached) {
      setMe(cached.me);
      setDay(cached.day);
      setCachedAt(cached.cachedAt);
      setStale(true);
      setPhase('ready');
    }
    void refresh();
  }, [isLogin, refresh]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      if (!isLogin) void refresh();
    };
    const goOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [isLogin, refresh]);

  useEffect(() => {
    if (phase === 'no-access') router.replace('/no-access');
  }, [phase, router]);

  // Send queued actions (I've arrived, SOS, ...) whenever there is something to send and a signal:
  // on load, as soon as one is queued, when the phone comes back online, and every 30 s.
  // A successful send reloads the day so stop statuses catch up with the server.
  useEffect(() => {
    if (isLogin || phase !== 'ready') return;
    const sync = () =>
      void flushOutbox().then((sent) => {
        if (sent > 0) void refresh();
      });
    sync();
    const unsubscribe = subscribeOutbox(sync);
    window.addEventListener('online', sync);
    const timer = setInterval(sync, 30_000);
    return () => {
      unsubscribe();
      window.removeEventListener('online', sync);
      clearInterval(timer);
    };
  }, [isLogin, phase, refresh]);

  // Installable PWA. Production only, so dev hot-reload is never served from cache.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }
  }, []);

  const trip = useMemo(() => pickActiveTrip(day), [day]);

  // Keep asking for the day. At the depot every 15 s: confirming the load moves the trip to
  // on_road, which lets the driver mark arrival. On the road every 30 s, so plan changes, store
  // receipts and messages arrive without a tap. With no trip, every minute for a newly sent trip.
  const atDepot = !!trip && ['published', 'loading', 'ready'].includes(trip.status);
  useEffect(() => {
    if (isLogin || phase !== 'ready') return;
    const timer = setInterval(() => void refresh(), atDepot ? 15_000 : trip ? 30_000 : 60_000);
    return () => clearInterval(timer);
  }, [isLogin, phase, atDepot, trip, refresh]);

  // GPS pings for the dispatch board while the trip is on the road (the SOS screen sends its own).
  useRoadPings(trip, !isLogin && !isSos && phase === 'ready');

  const value = useMemo<DriverContextValue>(
    () => ({ me, day, trip, online, stale, cachedAt, refresh }),
    [me, day, trip, online, stale, cachedAt, refresh],
  );

  if (isLogin) {
    return (
      <DriverContext.Provider value={value}>
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">{children}</main>
      </DriverContext.Provider>
    );
  }

  const alerts = <LiveNoticeAlerts onNotice={() => void refresh()} />;

  // The Figma has no frames for loading, wrong account or "no signal and nothing saved", so these
  // show only the blank canvas (and, offline, the Figma offline banner).
  if (phase === 'loading' || phase === 'no-access') {
    return (
      <>
        {alerts}
        <div className="min-h-dvh bg-bg" />
      </>
    );
  }
  if (phase === 'offline-empty') {
    return (
      <>
        {alerts}
        <main className="mx-auto min-h-dvh w-full max-w-[430px] px-5 pt-6">
          <OfflineBanner />
        </main>
      </>
    );
  }

  // Full-screen emergency page: no tab bar, sidebar or SOS button.
  if (isSos) {
    return (
      <DriverContext.Provider value={value}>
        {alerts}
        {children}
      </DriverContext.Provider>
    );
  }

  return (
    <DriverContext.Provider value={value}>
      {alerts}
      {/* Phone column with a tab bar below 1024px; sidebar layout from 1024px (Figma desktop frames). */}
      <div className="lg:flex lg:min-h-dvh">
        {me && <DriverSidebar me={me} />}
        <PhoneColumn className="lg:relative lg:mx-0 lg:min-w-0 lg:max-w-none lg:flex-1">
          {me && (
            <div className="pt-[env(safe-area-inset-top)] lg:hidden">
              <PhoneTopRow me={me} onSignOut={signOutDriver} />
            </div>
          )}
          <main className="flex-1 px-5 pb-[130px] pt-2 lg:px-10 lg:py-8">
            <RejectedBanner />
            {children}
          </main>
        </PhoneColumn>
        <SosControl />
        <div className="lg:hidden">
          <PhoneTabBar tabs={DRIVER_TABS} />
        </div>
      </div>
    </DriverContext.Provider>
  );
}
