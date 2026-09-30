'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { HOMES, useSession } from '@/lib/session';

export default function NoAccess() {
  const { me } = useSession();
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-md">
      <EmptyState
        title="No access"
        description="Your role cannot open this area."
        action={
          <Link href={me ? HOMES[me.role] : '/login'} className="text-label text-primary underline">
            {me ? 'Go to my home' : 'Sign in'}
          </Link>
        }
      />
    </main>
  );
}
