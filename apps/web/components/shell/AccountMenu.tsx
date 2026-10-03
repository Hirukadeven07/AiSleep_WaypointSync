'use client';

import { useState, type ReactNode } from 'react';
import type { Me } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { logout } from '@/lib/session';

/**
 * Click target (children) that opens a small raised card with the signed-in user and a
 * sign-out action. `placement` decides which side of the trigger the card opens on; `above`
 * opens over the trigger at its width. `onSignOut` replaces the default sign-out.
 */
export function AccountMenu({
  me,
  placement,
  label,
  className = '',
  onSignOut,
  children,
}: {
  me: Me;
  placement: 'right' | 'below-end' | 'below-start' | 'above';
  label: string;
  className?: string;
  onSignOut?: () => void | Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const position =
    placement === 'above'
      ? 'inset-x-0 bottom-full mb-2'
      : placement === 'right'
        ? 'bottom-0 left-full ml-3 w-56'
        : placement === 'below-end'
          ? 'right-0 top-full mt-2 w-56'
          : 'left-0 top-full mt-2 w-56';

  async function signOut() {
    setLeaving(true);
    await (onSignOut ?? (() => logout()))();
  }

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
            className={`absolute z-50 rounded-note bg-surface p-3 text-left shadow-raised ${position}`}
          >
            <p className="truncate text-body font-semibold text-ink">{me.name}</p>
            <p className="mb-3 text-caption capitalize text-muted">{me.role}</p>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={leaving}
              className="flex w-full items-center gap-2 rounded-pill border border-mist px-4 py-2 text-label text-ink hover:bg-bg disabled:opacity-60"
            >
              <Icon name="logout" size={16} />
              {leaving ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
