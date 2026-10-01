'use client';

import type { ReactNode } from 'react';
import { RoleGate } from '@/components/shell/RoleGate';
import { DriverSidebar } from '@/components/shell/DriverSidebar';
import { PhoneColumn, PHONE_MAX } from '@/components/shell/PhoneColumn';
import { PhoneTabBar } from '@/components/shell/PhoneTabBar';
import { PhoneTopRow } from '@/components/shell/PhoneTopRow';
import { DRIVER_TABS } from '@/components/shell/driverTabs';
import { Icon } from '@/components/ui/Icon';

/** Phone column with a tab bar below 1024px; sidebar layout from 1024px (see the Figma desktop frames). */
export default function DriveLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate role="driver">
      {(me) => (
        <div className="lg:flex lg:min-h-dvh">
          <DriverSidebar me={me} />

          <PhoneColumn className="lg:mx-0 lg:min-w-0 lg:max-w-none lg:flex-1">
            <div className="lg:hidden">
              <PhoneTopRow me={me} />
            </div>
            <main className="flex-1 px-5 pb-[130px] pt-2 lg:px-10 lg:py-8">{children}</main>
          </PhoneColumn>

          {/* Fixed SOS control; the driver owner wires it to incidents. */}
          <div className={`pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto ${PHONE_MAX} lg:max-w-none`}>
            <button
              type="button"
              aria-label="SOS"
              className="pointer-events-auto absolute right-5 top-14 flex min-h-12 items-center gap-2 rounded-pill border-2 border-white bg-danger px-[18px] py-3 text-[16px] font-bold tracking-[0.5px] text-white shadow-[0_4px_14px_0_rgba(196,48,48,0.35)] lg:right-10 lg:top-8"
            >
              <Icon name="alert" size={20} />
              SOS
            </button>
          </div>

          <div className="lg:hidden">
            <PhoneTabBar tabs={DRIVER_TABS} />
          </div>
        </div>
      )}
    </RoleGate>
  );
}
