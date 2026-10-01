'use client';

import { useEffect, useState } from 'react';
import type { Me } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { AccountMenu } from './AccountMenu';

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return online;
}

/** Sync Dock top bar: brand, role, sync state, depot and the signed-in loader. */
export function DockTopBar({ me }: { me: Me }) {
  const online = useOnline();
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-border px-[18px] py-[14px]">
      <div className="flex items-center gap-[10px]">
        <img alt="" src="/brand/logo-mark-on-light.svg" className="size-9" />
        <p className="whitespace-nowrap text-[16px] font-semibold text-ink">Waypoint Sync</p>
      </div>
      <span className="hidden h-6 w-px bg-mist sm:block" />
      <p className="hidden text-body font-semibold text-muted sm:block">Loader</p>
      <div className="flex-1" />
      <span
        className={`flex items-center gap-2 rounded-pill px-3 py-[6px] text-label ${
          online ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
        }`}
      >
        <span aria-hidden className="size-2 rounded-full bg-current" />
        {online ? 'Synced' : 'Offline'}
      </span>
      <span className="rounded-pill bg-surface px-4 py-[10px] text-body font-semibold text-ink">
        {me.depotId ?? '-'} depot
      </span>
      <AccountMenu
        me={me}
        placement="below-end"
        label="Account"
        className="flex h-10 items-center gap-[6px] rounded-pill bg-sand pl-3 pr-[14px] text-label font-bold text-primary"
      >
        <Icon name="user" size={14} />
        {me.name}
      </AccountMenu>
    </header>
  );
}
