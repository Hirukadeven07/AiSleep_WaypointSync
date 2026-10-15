'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Me } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { initials } from '@/lib/initials';
import { AccountMenu } from '@/components/shell/AccountMenu';
import type { PhoneTab } from '@/components/shell/PhoneTabBar';

const SETTINGS: PhoneTab = { href: '/store/settings', label: 'Settings', icon: 'settings' };

/**
 * Desktop navigation for Sync Store, after the driver's sidebar. From `lg` it replaces the phone
 * tab bar and top row: the raised Order tab becomes the "Place order" button, and Settings and
 * the account card move in here.
 */
export function StoreSidebar({
  me,
  tabs,
  storeName,
}: {
  me: Me;
  tabs: PhoneTab[];
  storeName?: string;
}) {
  const pathname = usePathname();
  const order = tabs.find((t) => t.fab);
  const menu = [...tabs.filter((t) => !t.fab), SETTINGS];

  return (
    // z-30: the sticky sidebar is its own stacking layer, so the account card opens over the page.
    <aside className="sticky top-0 z-30 hidden h-dvh w-[248px] shrink-0 flex-col gap-[6px] border-r border-info-tint bg-surface px-5 pb-6 pt-7 lg:flex">
      <div className="flex items-center gap-3 pb-[22px] pl-1">
        <span className="flex size-10 items-center justify-center rounded-[12px] bg-primary">
          <img alt="" src="/landing/logo-mark.svg" className="size-[26.8px]" />
        </span>
        <div className="whitespace-nowrap">
          <p className="text-[18px] font-bold leading-6 text-ink">Sync Store</p>
          <p className="text-caption font-medium leading-4 text-muted">Waypoint Sync</p>
        </div>
      </div>

      {order && (
        <Link
          href={order.href}
          className="flex items-center justify-center gap-[10px] rounded-pill bg-primary px-[18px] py-[14px] text-[15px] font-semibold text-on-primary shadow-[0_6px_16px_0_rgba(26,38,59,0.3)]"
        >
          <Icon name="plus" size={20} />
          Place order
        </Link>
      )}

      <p className="pb-[6px] pl-[14px] pt-[22px] text-[11px] font-semibold tracking-[0.08em] text-faint">
        MENU
      </p>

      {menu.map((t) => {
        const active = t.exact
          ? pathname === t.href
          : pathname === t.href || pathname.startsWith(`${t.href}/`);
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
            <span className="flex-1">{t.label}</span>
            {t.badge ? (
              <span
                aria-label={`${t.badge} unread`}
                className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-[6px] text-[11px] font-bold leading-none text-white"
              >
                {t.badge > 9 ? '9+' : t.badge}
              </span>
            ) : null}
          </Link>
        );
      })}

      <div className="flex-1" />

      <AccountMenu
        me={me}
        placement="above"
        label="Account"
        className="flex w-full items-center gap-3 rounded-[16px] bg-bg p-3 text-left"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-[14px] font-bold text-on-primary">
          {initials(me.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold leading-[18px] text-ink">
            {me.name}
          </span>
          <span className="block truncate text-caption font-medium leading-4 text-muted">
            {storeName ?? 'Store manager'}
          </span>
        </span>
      </AccountMenu>
    </aside>
  );
}
