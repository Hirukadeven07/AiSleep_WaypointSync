'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Me } from '@waypoint/contracts';
import { Icon, type IconName } from '@/components/ui/Icon';
import { AccountMenu } from './AccountMenu';

export const CONSOLE_NAV: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: '/dispatch', label: 'Home', icon: 'home', exact: true },
  { href: '/dispatch/plan', label: 'Planning', icon: 'route' },
  { href: '/dispatch/board', label: 'Dispatch', icon: 'board' },
  { href: '/dispatch/map', label: 'Map', icon: 'map' },
  { href: '/dispatch/fleet', label: 'Fleet', icon: 'truck' },
  { href: '/dispatch/incidents', label: 'Incidents', icon: 'alert' },
];

function useActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Desktop navigation: the floating rail with six dispatcher destinations. */
export function ConsoleRail({ me }: { me: Me }) {
  const isActive = useActive();
  return (
    <aside className="sticky top-4 hidden h-[calc(100vh-32px)] w-[84px] shrink-0 flex-col items-center gap-[14px] rounded-shell bg-border px-[14px] py-5 md:flex">
      <img alt="Waypoint Sync" src="/brand/logo-mark-on-light.svg" className="size-[39.6px]" />
      <div className="h-[18px]" />
      {CONSOLE_NAV.map((n) => {
        const active = isActive(n.href, n.exact);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            className="flex flex-col items-center gap-1"
          >
            <span
              className={`flex size-11 items-center justify-center rounded-full ${
                active ? 'bg-primary text-white' : 'bg-surface text-slate'
              }`}
            >
              <Icon name={n.icon} size={20} />
            </span>
            <span
              className={`text-micro ${active ? 'font-bold text-ink' : 'font-medium text-muted'}`}
            >
              {n.label}
            </span>
          </Link>
        );
      })}
      <div className="flex-1" />
      <span
        title="Settings"
        className="flex size-11 items-center justify-center rounded-full bg-surface text-slate"
      >
        <Icon name="settings" size={20} />
      </span>
      <AccountMenu
        me={me}
        placement="right"
        label="Account"
        className="flex size-11 items-center justify-center rounded-full bg-sand text-label font-bold text-primary"
      >
        {initials(me.name)}
      </AccountMenu>
    </aside>
  );
}

/** Narrow-screen fallback: the console is built for a computer, so the rail becomes a scrolling strip. */
export function ConsoleStrip({ me }: { me: Me }) {
  const isActive = useActive();
  return (
    <header className="mb-4 flex flex-col gap-3 rounded-card bg-border p-3 md:hidden">
      <div className="flex items-center gap-2">
        <img alt="" src="/brand/logo-mark-on-light.svg" className="size-8" />
        <p className="flex-1 text-body font-semibold text-ink">Sync Console</p>
        <AccountMenu
          me={me}
          placement="below-end"
          label="Account"
          className="flex size-10 items-center justify-center rounded-full bg-sand text-label font-bold text-primary"
        >
          {initials(me.name)}
        </AccountMenu>
      </div>
      <nav className="flex gap-2 overflow-x-auto">
        {CONSOLE_NAV.map((n) => {
          const active = isActive(n.href, n.exact);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-pill px-4 py-2 text-label ${
                active ? 'bg-primary text-white' : 'bg-surface text-ink'
              }`}
            >
              <Icon name={n.icon} size={16} />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
