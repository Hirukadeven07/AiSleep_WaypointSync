'use client';

import type { ReactNode } from 'react';
import { RoleGate } from '@/components/shell/RoleGate';
import { Button } from '@/components/ui/Button';
import { logout } from '@/lib/session';

export default function DockLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate role="loader">
      {(me) => (
        <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col">
          <header className="flex flex-wrap items-center justify-between gap-sm border-b border-border px-md py-sm">
            <p className="text-title font-semibold text-primary">Sync Dock</p>
            <div className="flex items-center gap-sm">
              <span className="text-label">{me.name}</span>
              <Button variant="secondary" onClick={logout}>
                Sign out
              </Button>
            </div>
          </header>
          <main className="flex-1 p-md">{children}</main>
        </div>
      )}
    </RoleGate>
  );
}
