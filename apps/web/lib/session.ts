'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Me, Role } from '@waypoint/contracts';
import { api, ApiError } from './api';

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
export async function logout(redirectTo = '/login') {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // Offline or already signed out: the cookie expires on its own; do not trap the user here.
  } finally {
    window.location.assign(redirectTo);
  }
}
