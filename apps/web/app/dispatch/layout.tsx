'use client';

import type { ReactNode } from 'react';
import { RoleGate } from '@/components/shell/RoleGate';
import { NavLink } from '@/components/shell/NavLink';
import { Button } from '@/components/ui/Button';
import { logout } from '@/lib/session';

const NAV = [
  { href: '/dispatch', label: 'Live day', exact: true },
  { href: '/dispatch/plan', label: 'Plan board' },
  { href: '/dispatch/board', label: 'Dispatch board' },
  { href: '/dispatch/map', label: 'Live map' },
  { href: '/dispatch/fleet', label: 'Fleet' },
  { href: '/dispatch/incidents', label: 'Incidents' },
];

export default function DispatchLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate role="dispatcher">
      {(me) => (
        <div className="flex min-h-screen">
          <aside className="hidden w-64 shrink-0 flex-col gap-xs border-r border-border p-md md:flex">
            <p className="mb-md text-title font-semibold text-primary">Sync Console</p>
            {NAV.map((n) => (
              <NavLink
                key={n.href}
                href={n.href}
                exact={n.exact}
                className="rounded-card px-md py-sm text-label"
              >
                {n.label}
              </NavLink>
            ))}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between border-b border-border px-lg py-sm">
              <span className="text-label text-muted">Depot {me.depotId ?? '-'}</span>
              <div className="flex items-center gap-md">
                <span className="text-label">{me.name}</span>
                <Button variant="secondary" onClick={logout}>
                  Sign out
                </Button>
              </div>
            </header>
            <nav className="flex gap-xs overflow-x-auto border-b border-border p-sm md:hidden">
              {NAV.map((n) => (
                <NavLink
                  key={n.href}
                  href={n.href}
                  exact={n.exact}
                  className="whitespace-nowrap rounded-card px-md py-sm text-label"
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <main className="flex-1 p-lg">{children}</main>
          </div>
        </div>
      )}
    </RoleGate>
  );
}
