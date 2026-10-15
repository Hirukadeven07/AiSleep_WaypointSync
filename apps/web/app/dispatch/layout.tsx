'use client';

import type { ReactNode } from 'react';
import { LiveNoticeAlerts } from '@/components/shell/LiveNotices';
import { RoleGate } from '@/components/shell/RoleGate';
import { ConsoleRail, ConsoleStrip } from '@/components/shell/ConsoleRail';

export default function DispatchLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate role="dispatcher">
      {(me) => (
        <div className="min-h-screen bg-bg p-4 md:flex md:items-start md:gap-4">
          <LiveNoticeAlerts />
          <ConsoleRail me={me} />
          <div className="min-w-0 flex-1 md:px-2">
            <ConsoleStrip me={me} />
            <main className="pb-lg">{children}</main>
          </div>
        </div>
      )}
    </RoleGate>
  );
}
