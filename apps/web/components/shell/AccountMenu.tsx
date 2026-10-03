'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Me, Profile } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { logout } from '@/lib/session';
import { AccountSettings } from './AccountSettings';

const ROLE_LABEL: Record<Me['role'], string> = {
  dispatcher: 'Dispatcher',
  driver: 'Driver',
  loader: 'Loader',
  store: 'Store manager',
};

/** "Sat 3 Oct, 09:14" in Colombo time. */
const whenText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Colombo',
      })
    : null;

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-caption text-muted">{label}</dt>
      <dd className="truncate text-right text-caption font-semibold text-ink">{value}</dd>
    </div>
  );
}

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState(false);

  // The details load when the card opens; the name and role show straight away.
  useEffect(() => {
    if (!open) return;
    let live = true;
    api<Profile>('/me/profile')
      .then((p) => live && setProfile(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open]);

  const position =
    placement === 'above'
      ? 'inset-x-0 bottom-full mb-2'
      : placement === 'right'
        ? 'bottom-0 left-full ml-3 w-72'
        : placement === 'below-end'
          ? 'right-0 top-full mt-2 w-72'
          : 'left-0 top-full mt-2 w-72';

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
            <p className="mb-3 text-caption text-muted">{ROLE_LABEL[me.role] ?? me.role}</p>
            <dl className="mb-3 flex flex-col gap-[6px] rounded-input bg-bg p-3" aria-label="Profile">
              {profile ? (
                <>
                  <Row label="Login ID" value={profile.loginId} />
                  <Row label="Depot" value={profile.depot?.name ?? null} />
                  <Row label="Store" value={profile.store?.name ?? null} />
                  <Row label="Employee no." value={profile.employeeNo} />
                  <Row label="Phone" value={profile.phone} />
                  <Row label="Signed in" value={whenText(profile.signedInAt)} />
                  <Row label="Session until" value={whenText(profile.sessionExpiresAt)} />
                </>
              ) : (
                <p className="text-caption text-muted">Loading your details…</p>
              )}
            </dl>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setSettings(true);
              }}
              className="mb-2 flex w-full items-center gap-2 rounded-pill border border-mist px-4 py-2 text-label text-ink hover:bg-bg"
            >
              <Icon name="settings" size={16} />
              Account settings
            </button>
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
      {settings && <AccountSettings me={me} onClose={() => setSettings(false)} />}
    </div>
  );
}
