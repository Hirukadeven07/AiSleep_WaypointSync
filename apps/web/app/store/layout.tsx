'use client';

import type { ReactNode } from 'react';
import { RoleGate } from '@/components/shell/RoleGate';
import { PhoneTabBar, type PhoneTab } from '@/components/shell/PhoneTabBar';
import { PhoneTopRow } from '@/components/shell/PhoneTopRow';

const TABS: PhoneTab[] = [
  { href: '/store', label: 'Home', icon: 'home', exact: true },
  { href: '/store/delivery', label: 'Delivery', icon: 'truck' },
  { href: '/store/order', label: 'Order', icon: 'plus', fab: true },
  { href: '/store/updates', label: 'Updates', icon: 'inbox' },
  { href: '/store/receive', label: 'Receive', icon: 'check' },
];

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate role="store">
      {(me) => (
        <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
          <PhoneTopRow me={me} />
          <main className="flex-1 px-5 pb-[130px] pt-2">{children}</main>
          <PhoneTabBar tabs={TABS} />
        </div>
      )}
    </RoleGate>
  );
}
