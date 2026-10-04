'use client';

import { useState } from 'react';
import type { StartLoadingRequest } from '@waypoint/contracts';
import { Button } from '@/components/ui/Button';

const inputClass =
  'w-full rounded-input border border-mist bg-surface px-3 py-2 text-body text-ink outline-none focus:border-slate';

/**
 * The dock tablet is shared, so whoever joins a load confirms who they are with their loader ID and
 * their own PIN. The checklist opens only once the server accepts them.
 */
export function StartLoadingSheet({
  busy,
  error,
  joining,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  error: string | null;
  /** True when the load has already started and this person is being added to it. */
  joining: boolean;
  onSubmit: (credentials: StartLoadingRequest) => void;
  onClose: () => void;
}) {
  const [loaderId, setLoaderId] = useState('');
  const [pin, setPin] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-scrim/40"
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={joining ? 'Add a loader' : 'Start loading'}
        className="relative w-full max-w-md space-y-md rounded-t-hero bg-surface p-lg shadow-raised sm:rounded-hero"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ loaderId: loaderId.trim(), pin });
        }}
      >
        <div>
          <p className="text-eyebrow uppercase text-muted">Confirm it is you</p>
          <h2 className="text-title text-ink">{joining ? 'Add a loader' : 'Start loading'}</h2>
          <p className="text-body text-muted">
            Enter your own loader ID and PIN. You are added to this truck&apos;s loaders once they
            are confirmed.
          </p>
        </div>
        <label className="block space-y-xs">
          <span className="text-label font-semibold text-ink">Loader ID</span>
          <input
            value={loaderId}
            onChange={(e) => setLoaderId(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            required
            className={inputClass}
          />
        </label>
        <label className="block space-y-xs">
          <span className="text-label font-semibold text-ink">Your PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-label font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-sm">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={busy || !loaderId.trim() || pin.length < 4}>
            {busy ? 'Checking…' : joining ? 'Add me' : 'Confirm and start'}
          </Button>
        </div>
      </form>
    </div>
  );
}
