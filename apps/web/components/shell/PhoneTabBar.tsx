'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PHONE_MAX } from './PhoneColumn';

export interface PhoneTab {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  /** The raised centre action: a 60px navy circle with the label underneath. */
  fab?: boolean;
}

/** Bottom tab bar for the phone shells: four tabs around one raised centre action. */
export function PhoneTabBar({ tabs }: { tabs: PhoneTab[] }) {
  const pathname = usePathname();
  return (
    <nav className={`fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full ${PHONE_MAX} items-center rounded-t-shell bg-surface px-4 py-[10px] shadow-[0_-4px_20px_0_rgba(13,26,41,0.06)]`}>
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        if (t.fab) {
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span className="flex size-[60px] items-center justify-center rounded-full bg-primary text-white shadow-[0_6px_16px_0_rgba(26,38,59,0.3)]">
                <Icon name={t.icon} size={26} />
              </span>
              <span className="text-micro font-semibold text-muted">{t.label}</span>
            </Link>
          );
        }
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-[6px] py-[6px]"
          >
            <Icon name={t.icon} size={24} className={active ? 'text-ink' : 'text-slate'} />
            <span className={`text-caption ${active ? 'font-bold text-ink' : 'font-medium text-muted'}`}>
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
