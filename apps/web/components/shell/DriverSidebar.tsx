'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Me } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { initials } from '@/lib/initials';
import { signOutDriver } from '@/lib/driver-sign-out';
import { AccountMenu } from './AccountMenu';
import { DRIVER_TABS } from './driverTabs';

/**
 * Desktop navigation for Sync Driver. From `lg` it replaces the phone tab bar, and the raised
 * Report tab becomes the "Report issue" button.
 */
export function DriverSidebar({ me }: { me: Me }) {
  const pathname = usePathname();
  const report = DRIVER_TABS.find((t) => t.fab);
  const menu = DRIVER_TABS.filter((t) => !t.fab);

  return (
    // z-30: the sticky sidebar is its own stacking layer, so without it the account card and its
    // click-away backdrop render under the page and cannot be clicked.
    <aside className="sticky top-0 z-30 hidden h-dvh w-[248px] shrink-0 flex-col gap-[6px] border-r border-info-tint bg-surface px-5 pb-6 pt-7 lg:flex">
      <div className="flex items-center gap-3 pb-[22px] pl-1">
        <span className="flex size-10 items-center justify-center rounded-[12px] bg-primary">
          <img alt="" src="/landing/logo-mark.svg" className="size-[26.8px]" />
        </span>
        <div className="whitespace-nowrap">
          <p className="text-[18px] font-bold leading-6 text-ink">Sync Driver</p>
          <p className="text-caption font-medium leading-4 text-muted">Waypoint Sync</p>
        </div>
      </div>

      {report && (
        <Link
          href={report.href}
          className="flex items-center justify-center gap-[10px] rounded-pill bg-primary px-[18px] py-[14px] text-[15px] font-semibold text-on-primary shadow-[0_6px_16px_0_rgba(26,38,59,0.3)]"
        >
          <Icon name="plus" size={20} />
          Report issue
        </Link>
      )}

      <p className="pb-[6px] pl-[14px] pt-[22px] text-[11px] font-semibold tracking-[0.08em] text-faint">MENU</p>

      {menu.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-[14px] px-[14px] py-3 text-[15px] leading-5 ${
              active ? 'bg-bg font-bold text-ink' : 'font-medium text-muted'
            }`}
          >
            <Icon name={t.icon} size={24} className={active ? 'text-ink' : 'text-slate'} />
            {t.label}
          </Link>
        );
      })}

      <div className="flex-1" />

      <AccountMenu
        me={me}
        placement="above"
        label="Account"
        onSignOut={signOutDriver}
        className="flex w-full items-center gap-3 rounded-[16px] bg-bg p-3 text-left"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-[14px] font-bold text-bg">
          {initials(me.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold leading-[18px] text-ink">{me.name}</span>
          <span className="block truncate text-caption font-medium leading-4 text-muted">
            {me.depotId ? `${me.depotId} depot` : 'Driver'}
          </span>
        </span>
      </AccountMenu>
    </aside>
  );
}
