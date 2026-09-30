'use client';

import type { ReactNode } from 'react';
import { RoleGate } from '@/components/shell/RoleGate';
import { NavLink } from '@/components/shell/NavLink';
import { logout } from '@/lib/session';

export default function DriveLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate role="driver">
      {(me) => (
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
          <header className="flex items-center justify-between border-b border-border px-md py-sm">
            <p className="text-title font-semibold text-primary">Sync Driver</p>
            <button onClick={logout} className="text-label text-muted">
              {me.name} · Sign out
            </button>
          </header>
          <main className="flex-1 p-md pb-[calc(theme(spacing.2xl)+theme(spacing.2xl))]">
            {children}
          </main>

          {/* SOS placeholder - wired to incidents by the driver owner */}
          <button
            type="button"
            aria-label="SOS"
            className="fixed bottom-24 right-md z-40 flex h-14 w-14 items-center justify-center rounded-full bg-danger text-label font-bold text-text shadow-lg"
          >
            SOS
          </button>

          <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md border-t border-border bg-bg">
            <NavLink href="/drive" exact className="flex-1 py-md text-center text-label">
              Today
            </NavLink>
            <span className="flex-1 py-md text-center text-label text-muted opacity-50">Route</span>
            <span className="flex-1 py-md text-center text-label text-muted opacity-50">Inbox</span>
          </nav>
        </div>
      )}
    </RoleGate>
  );
}
