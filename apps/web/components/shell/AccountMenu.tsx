'use client';

import { useState, type ReactNode } from 'react';
import type { Me } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { logout } from '@/lib/session';

/**
 * Click target (children) that opens a small raised card with the signed-in user and a
 * sign-out action. `placement` decides which side of the trigger the card opens on.
 */
export function AccountMenu({
  me,
  placement,
  label,
  className = '',
  children,
}: {
  me: Me;
  placement: 'right' | 'below-end' | 'below-start';
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const position =
    placement === 'right'
      ? 'bottom-0 left-full ml-3'
      : placement === 'below-end'
        ? 'right-0 top-full mt-2'
        : 'left-0 top-full mt-2';

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={className}
      >
        {children}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className={`absolute z-50 w-56 rounded-note bg-surface p-3 text-left shadow-raised ${position}`}
          >
            <p className="truncate text-body font-semibold text-ink">{me.name}</p>
            <p className="mb-3 text-caption capitalize text-muted">{me.role}</p>
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-pill border border-mist px-4 py-2 text-label text-ink hover:bg-bg"
            >
              <Icon name="logout" size={16} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
