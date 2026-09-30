'use client';

import type { ReactNode } from 'react';
import type { Me, Role } from '@waypoint/contracts';
import { useRequireRole } from '@/lib/session';

/** Renders children only for the given role; other roles are redirected to /no-access. */
export function RoleGate({
  role,
  children,
}: {
  role: Role;
  children: (me: Me) => ReactNode;
}) {
  const { me, allowed, loading } = useRequireRole(role);

  if (loading || !me || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-label text-muted">
        Loading…
      </div>
    );
  }
  return <>{children(me)}</>;
}
