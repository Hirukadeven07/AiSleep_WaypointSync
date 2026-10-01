'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HOMES, useSession } from '@/lib/session';

/** Signed-in visitors skip the landing page and go straight to their workspace. */
export function SignedInRedirect() {
  const router = useRouter();
  const { me, loading } = useSession();

  useEffect(() => {
    if (!loading && me) router.replace(HOMES[me.role]);
  }, [me, loading, router]);

  return null;
}
