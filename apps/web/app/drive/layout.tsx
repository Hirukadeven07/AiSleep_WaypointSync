'use client';

import type { ReactNode } from 'react';
import { RoleGate } from '@/components/shell/RoleGate';
import { PhoneTabBar, type PhoneTab } from '@/components/shell/PhoneTabBar';
import { PhoneTopRow } from '@/components/shell/PhoneTopRow';
import { Icon } from '@/components/ui/Icon';

const TABS: PhoneTab[] = [
  { href: '/drive', label: 'Home', icon: 'home', exact: true },
  { href: '/drive/stops', label: 'Stops', icon: 'route' },
  { href: '/drive/report', label: 'Report', icon: 'plus', fab: true },
  { href: '/drive/break', label: 'Break', icon: 'coffee' },
  { href: '/drive/vehicle', label: 'Vehicle', icon: 'truck' },
];

export default function DriveLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate role="driver">
      {(me) => (
        <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
          <PhoneTopRow me={me} />
          <main className="flex-1 px-5 pb-[130px] pt-2">{children}</main>

          {/* Fixed SOS control; the driver owner wires it to incidents. */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto max-w-[480px]">
            <button
              type="button"
              aria-label="SOS"
              className="pointer-events-auto absolute right-5 top-14 flex min-h-12 items-center gap-2 rounded-pill border-2 border-white bg-danger px-[18px] py-3 text-[16px] font-bold tracking-[0.5px] text-white shadow-[0_4px_14px_0_rgba(196,48,48,0.35)]"
            >
              <Icon name="alert" size={20} />
              SOS
            </button>
          </div>

          <PhoneTabBar tabs={TABS} />
        </div>
      )}
    </RoleGate>
  );
}
