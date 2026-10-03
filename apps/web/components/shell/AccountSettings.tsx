'use client';

import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  PASSWORD_MIN_LENGTH,
  PIN_PATTERN,
  type ChangePasswordRequest,
  type Me,
} from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { messageOf } from '@/lib/api-error';
import { DEPOTS } from '@/lib/depots';

const inputClass =
  'w-full rounded-input border border-mist bg-surface px-3 py-2 text-body text-ink outline-none focus:border-slate';

/** Drivers and loaders use a PIN; dispatchers and store managers a password (same split as sign-in). */
const usesPin = (role: Me['role']) => role === 'driver' || role === 'loader';

function SecretForm({ me }: { me: Me }) {
  const pin = usesPin(me.role);
  const word = pin ? 'PIN' : 'password';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const rule = pin
    ? 'The new PIN is 4 to 6 digits.'
    : `The new password has at least ${PASSWORD_MIN_LENGTH} characters.`;
  const valid = pin ? PIN_PATTERN.test(next) : next.length >= PASSWORD_MIN_LENGTH;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return setNote({ ok: false, text: rule });
    if (next !== again) return setNote({ ok: false, text: `The new ${word}s do not match.` });
    setBusy(true);
    setNote(null);
    try {
      const body: ChangePasswordRequest = {
        ...(current ? { currentSecret: current } : {}),
        newSecret: next,
      };
      await api('/me/password', { method: 'POST', body });
      setCurrent('');
      setNext('');
      setAgain('');
      setNote({
        ok: true,
        text: `Your ${word} is changed. Other devices signed in as you were signed out.`,
      });
    } catch (err) {
      setNote({ ok: false, text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label={`Change ${word}`}>
      <p className="text-body font-semibold text-ink">Change {word}</p>
      <input
        type="password"
        inputMode={pin ? 'numeric' : undefined}
        autoComplete="current-password"
        placeholder={pin ? 'Current PIN (empty if you have none)' : 'Current password'}
        aria-label={`Current ${word}`}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        inputMode={pin ? 'numeric' : undefined}
        autoComplete="new-password"
        placeholder={`New ${word}`}
        aria-label={`New ${word}`}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        inputMode={pin ? 'numeric' : undefined}
        autoComplete="new-password"
        placeholder={`New ${word} again`}
        aria-label={`New ${word} again`}
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        className={inputClass}
      />
      <p className="text-caption text-muted">{rule}</p>
      {note && (
        <p role="status" className={`text-caption ${note.ok ? 'text-success' : 'text-danger'}`}>
          {note.text}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || (!pin && !current) || !next || !again}
        className="rounded-pill bg-primary px-4 py-2 text-label font-semibold text-bg disabled:opacity-50"
      >
        {busy ? 'Saving…' : `Change ${word}`}
      </button>
    </form>
  );
}

/** Dispatchers and loaders work at one depot at a time; store and driver depots follow their store or truck. */
function DepotForm({ me }: { me: Me }) {
  const [depotId, setDepotId] = useState(me.depotId ?? DEPOTS[0]!.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api<Me>('/me/depot', { method: 'PATCH', body: { depotId } });
      // Every screen is scoped to the depot, so start again from a clean page.
      window.location.reload();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body font-semibold text-ink">Depot</p>
      <div className="flex gap-2" role="radiogroup" aria-label="Depot">
        {DEPOTS.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={depotId === d.id}
            onClick={() => setDepotId(d.id)}
            className={`flex-1 rounded-pill border px-3 py-2 text-label font-semibold ${
              depotId === d.id ? 'border-slate bg-bg text-ink' : 'border-mist bg-surface text-muted'
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>
      {me.role === 'loader' && (
        <p className="text-caption text-muted">Next time you sign in, pick this depot.</p>
      )}
      {error && <p className="text-caption text-danger">{error}</p>}
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || depotId === me.depotId}
        className="rounded-pill border border-mist bg-surface px-4 py-2 text-label font-semibold text-ink disabled:opacity-50"
      >
        {busy ? 'Switching…' : 'Switch depot'}
      </button>
    </div>
  );
}

/** Account settings for every role: change the password or PIN, and the depot where it applies. */
export function AccountSettings({ me, onClose }: { me: Me; onClose: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Account settings"
        className="relative flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-card bg-surface p-5 shadow-raised"
      >
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-title font-semibold text-ink">Account settings</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-muted">
            <Icon name="x" size={18} />
          </button>
        </div>
        {(me.role === 'dispatcher' || me.role === 'loader') && <DepotForm me={me} />}
        <SecretForm me={me} />
      </section>
    </div>,
    document.body,
  );
}
