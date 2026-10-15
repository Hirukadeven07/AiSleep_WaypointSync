'use client';

import type { ReactNode } from 'react';
import { LiveNoticeAlerts } from '@/components/shell/LiveNotices';
import { RoleGate } from '@/components/shell/RoleGate';
import { DockTopBar } from '@/components/shell/DockTopBar';

export default function DockLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate role="loader">
      {(me) => (
        <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col gap-4 p-4">
          <LiveNoticeAlerts />
          <DockTopBar me={me} />
          <main className="flex-1">{children}</main>
        </div>
      )}
    </RoleGate>
  );
}
