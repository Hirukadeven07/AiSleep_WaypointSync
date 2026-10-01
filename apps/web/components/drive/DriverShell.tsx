'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthError, fetchDriverDay, fetchMe } from '@/lib/driver-api';
import {
  clearCachedShell,
  pickActiveTrip,
  readCachedShell,
  writeCachedShell,
  type DriverDay,
  type Me,
  type TripSummary,
} from '@/lib/driver-cache';
import { usePendingCount } from '@/lib/use-pending-count';
import { PhoneTabBar, type PhoneTab } from '@/components/shell/PhoneTabBar';
import { PhoneTopRow } from '@/components/shell/PhoneTopRow';
import { SosControl } from './SosControl';
import { ToastProvider } from './DriverToast';

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

const TABS: PhoneTab[] = [
  { href: '/drive', label: 'Home', icon: 'home', exact: true },
  { href: '/drive/stops', label: 'Stops', icon: 'route' },
  { href: '/drive/report', label: 'Report', icon: 'plus', fab: true },
  { href: '/drive/break', label: 'Break', icon: 'coffee' },
  { href: '/drive/vehicle', label: 'Vehicle', icon: 'truck' },
];

const DriverContext = createContext<DriverContextValue | null>(null);

export function useDriver(): DriverContextValue {
  const ctx = useContext(DriverContext);
  if (!ctx) throw new Error('useDriver must be used inside <DriverShell>');
  return ctx;
}

type Phase = 'loading' | 'ready' | 'no-access' | 'offline-empty';

export function DriverShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ShellInner>{children}</ShellInner>
    </ToastProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === '/drive/login';

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
        router.replace('/drive/login');
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

  // Installable PWA. Production only, so dev hot-reload is never served from cache.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }
  }, []);

  const trip = useMemo(() => pickActiveTrip(day), [day]);
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

  if (phase === 'loading') {
    return <Centered title="Loading your day" />;
  }
  if (phase === 'no-access') {
    return (
      <Centered title="This account isn't a driver account">
        <Link href="/drive/login" className="mt-4 inline-flex h-12 items-center rounded-xl bg-black px-5 text-base font-semibold text-white">
          Sign in as a driver
        </Link>
      </Centered>
    );
  }
  if (phase === 'offline-empty') {
    return (
      <Centered title="No signal, and nothing saved yet">
        <p className="mt-2 text-neutral-700">Connect once to load your trips. After that they open offline.</p>
        <button onClick={() => void refresh()} className="mt-4 h-12 rounded-xl bg-black px-5 text-base font-semibold text-white">
          Try again
        </button>
      </Centered>
    );
  }

  return (
    <DriverContext.Provider value={value}>
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
        <div className="flex items-center justify-between pr-5 pt-[env(safe-area-inset-top)]">
          {me && <PhoneTopRow me={me} />}
          <SyncStatus online={online} />
        </div>
        <main className="flex-1 px-5 pb-[130px] pt-2">{children}</main>
        <SosControl />
        <PhoneTabBar tabs={TABS} />
      </div>
    </DriverContext.Provider>
  );
}

function SyncStatus({ online }: { online: boolean }) {
  const pending = usePendingCount();
  return (
    <div className="flex items-center gap-2">
      {!online && <span className="rounded-full bg-warning-tint px-3 py-1 text-label text-warning">Offline</span>}
      <span
        aria-label={`${pending} pending ${pending === 1 ? 'action' : 'actions'}`}
        className={`rounded-full px-3 py-1 text-label ${
          pending > 0 ? 'bg-primary text-on-primary' : 'bg-surface text-muted'
        }`}
      >
        {pending} pending
      </span>
    </div>
  );
}

function Centered({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </main>
  );
}
