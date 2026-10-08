'use client';

import { useState, type FormEvent } from 'react';
import type { LoadSheet, StartLoadingRequest } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { messageOf } from '@/lib/api-error';
import { Button } from '@/components/ui/Button';

const inputClass =
  'w-full rounded-input border border-mist bg-surface px-3 py-2 text-body text-ink outline-none focus:border-slate';

/**
 * The dock tablet is shared, so everyone who loads a truck adds themselves with their own loader ID
 * and PIN, as many people as needed. Each one is checked by the server and joins the trip's loader
 * list; "Continue to loading" opens the checklist once at least one person has been added.
 */
export function StartLoadingSheet({
  tripId,
  title,
  initialNames = [],
  onSheet,
  onContinue,
  onClose,
}: {
  tripId: string;
  title: string;
  /** Loaders already on this trip. */
  initialNames?: string[];
  /** The checklist as the server returned it after a loader was added. */
  onSheet?: (sheet: LoadSheet) => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  const [names, setNames] = useState<string[]>(initialNames);
  const [loaderId, setLoaderId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: StartLoadingRequest = { loaderId: loaderId.trim(), ...(pin ? { pin } : {}) };
      const sheet = await api<LoadSheet>(`/loads/${tripId}/start`, { method: 'POST', body });
      setNames(sheet.session?.loaderNames ?? []);
      onSheet?.(sheet);
      setLoaderId('');
      setPin('');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-scrim/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-full w-full max-w-md space-y-md overflow-y-auto rounded-t-hero bg-surface p-lg shadow-raised sm:rounded-hero"
      >
        <div>
          <p className="text-eyebrow uppercase text-muted">Who is loading?</p>
          <h2 className="text-title text-ink">{title}</h2>
          <p className="text-body text-muted">
            Add every loader on this truck with their own loader ID and PIN. Add as many as you
            need, then continue.
          </p>
        </div>

        <div>
          <p className="text-label font-semibold text-ink">Loaders added · {names.length}</p>
          {names.length === 0 ? (
            <p className="text-label text-muted">Nobody yet.</p>
          ) : (
            <ul className="mt-xs flex flex-wrap gap-xs">
              {names.map((n) => (
                <li
                  key={n}
                  className="rounded-pill bg-olive-tint px-chip py-xs text-caption font-semibold text-olive-ink"
                >
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={add} aria-label="Add a loader" className="space-y-sm">
          <label className="block space-y-xs">
            <span className="text-label font-semibold text-ink">Loader ID</span>
            <input
              value={loaderId}
              onChange={(e) => setLoaderId(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              className={inputClass}
            />
          </label>
          <label className="block space-y-xs">
            <span className="text-label font-semibold text-ink">
              Loader PIN <span className="font-normal text-muted">(if you have one)</span>
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={inputClass}
            />
          </label>
          {error && (
            <p role="alert" className="text-label font-medium text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            disabled={busy || !loaderId.trim()}
          >
            {busy ? 'Checking…' : '+ Add loader'}
          </Button>
        </form>

        <div className="flex gap-sm">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={names.length === 0}
            onClick={onContinue}
          >
            Continue to loading
          </Button>
        </div>
      </div>
    </div>
  );
}
