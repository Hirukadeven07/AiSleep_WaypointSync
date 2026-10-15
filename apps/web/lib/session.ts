'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Me, Role } from '@waypoint/contracts';
import { api, ApiError } from './api';
import { WORKSPACES } from './roles';

export const HOMES: Record<Role, string> = {
  dispatcher: '/dispatch',
  store: '/store',
  loader: '/dock',
  driver: '/drive',
};

export function useSession() {
  const [me, setMe] = useState<Me | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  useEffect(() => {
    let cancelled = false;
    api<Me>('/me')
      .then((m) => !cancelled && setMe(m))
      .catch((e) => !cancelled && setError(e as ApiError))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return { me, loading, error };
}

/** Sends users with the wrong role to /no-access. Returns the session once it is allowed. */
export function useRequireRole(role: Role) {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session.me && session.me.role !== role) router.replace('/no-access');
  }, [session.me, role, router]);

  return { ...session, allowed: session.me?.role === role };
}

/** Ends the session and leaves the app. Still leaves when the server cannot be reached. */
/** Where a signed-out visitor of this role signs in again. */
export const loginPathFor = (role: Role) =>
  `/login/${WORKSPACES.find((w) => w.role === role)?.slug ?? role}`;

/**
 * A signed-in page can come back from the browser's back/forward cache with its old content, for
 * example Back after signing out. When that happens this asks the server (GET /api/me) whether the
 * session is still there and sends a signed-out visitor to their role's sign-in at once. While it
 * asks, `checking` is true so the shell can hide the old page instead of flashing it.
 */
export function useRestoreCheck(role: Role) {
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setChecking(true);
      fetch('/api/me', { credentials: 'include', cache: 'no-store' })
        .then((res) => {
          if (res.status === 401) window.location.replace(loginPathFor(role));
          else setChecking(false);
        })
        // Offline: the page still shows what it had; the next request decides.
        .catch(() => setChecking(false));
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [role]);

  return checking;
}

export async function logout(redirectTo = '/login') {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // Offline or already signed out: the cookie expires on its own; do not trap the user here.
  } finally {
    window.location.assign(redirectTo);
  }
}
