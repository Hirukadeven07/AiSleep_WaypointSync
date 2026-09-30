'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HOMES, useSession } from '@/lib/session';

export default function RootRedirect() {
  const router = useRouter();
  const { me, loading, error } = useSession();

  useEffect(() => {
    if (loading) return;
    router.replace(me ? HOMES[me.role] : '/login');
  }, [me, loading, error, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-label text-muted">
      Loading…
    </div>
  );
}
