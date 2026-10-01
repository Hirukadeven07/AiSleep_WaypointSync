'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LoginRequest, LoginResponse } from '@waypoint/contracts';
import { api, ApiError } from '@/lib/api';
import { rememberLoginId, rememberRole } from '@/lib/roles';

/** One sign-in call shared by all four login screens. */
export function useSignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function signIn(body: LoginRequest, remember: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      const res = await api<LoginResponse>('/auth/login', { method: 'POST', body });
      rememberRole(body.role);
      rememberLoginId(body.role, remember ? body.loginId : null);
      router.push(res.home);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Those details are not right. Check them and try again.'
          : 'Sign in failed. Check your connection and try again.',
      );
      setBusy(false);
    }
  }

  const clearError = useCallback(() => setError(undefined), []);

  return { signIn, busy, error, clearError };
}
