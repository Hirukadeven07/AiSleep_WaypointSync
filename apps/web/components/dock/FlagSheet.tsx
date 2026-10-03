'use client';

import { useState } from 'react';
import type { FlagRequest, FlagType, OrderLine } from '@waypoint/contracts';
import { Button } from '@/components/ui/Button';

const TYPES: { type: FlagType; label: string; hint: string }[] = [
  { type: 'missing', label: 'Missing', hint: 'Not in the depot' },
  { type: 'damaged', label: 'Damaged', hint: 'Broken, leaking or warm' },
  { type: 'wrong_quantity', label: 'Wrong quantity', hint: 'More or fewer than listed' },
];

/** L4: bottom sheet to flag one order line. */
export function FlagSheet({
  stopId,
  line,
  busy,
  onSubmit,
  onClose,
}: {
  stopId: string;
  line: OrderLine;
  busy: boolean;
  onSubmit: (flag: FlagRequest) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<FlagType>('missing');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

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
        aria-label={`Flag ${line.name}`}
        className="relative w-full max-w-md space-y-md rounded-t-hero bg-surface p-lg shadow-raised sm:rounded-hero"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            stopId,
            orderLineId: line.id,
            type,
            qty: qty === '' ? undefined : Number(qty),
            note: note.trim() || undefined,
          });
        }}
      >
        <div>
          <p className="text-eyebrow uppercase text-muted">Flag a line</p>
          <h2 className="text-title text-ink">
            {line.name} <span className="text-muted">× {line.qty}</span>
          </h2>
        </div>

        <fieldset className="space-y-sm">
          <legend className="sr-only">Problem</legend>
          {TYPES.map((t) => (
            <label
              key={t.type}
              className={`flex min-h-[52px] cursor-pointer items-center gap-md rounded-input border px-md py-sm ${
                type === t.type ? 'border-primary bg-info-tint' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="flag-type"
                value={t.type}
                checked={type === t.type}
                onChange={() => setType(t.type)}
                className="size-5 accent-primary"
              />
              <span>
                <span className="block text-body font-semibold text-ink">{t.label}</span>
                <span className="block text-caption text-muted">{t.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {type !== 'damaged' && (
          <label className="block space-y-xs">
            <span className="text-label text-muted">
              {type === 'missing' ? 'How many are missing?' : 'How many are actually here?'}
            </span>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
              placeholder={type === 'missing' ? String(line.qty) : ''}
              className="w-full rounded-input border border-border bg-bg px-md py-sm text-body text-ink"
            />
          </label>
        )}

        <label className="block space-y-xs">
          <span className="text-label text-muted">Note (optional)</span>
          <input
            value={note}
            maxLength={280}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-input border border-border bg-bg px-md py-sm text-body text-ink"
          />
        </label>

        <div className="flex gap-sm">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" className="flex-1" disabled={busy}>
            {busy ? 'Saving…' : 'Save flag'}
          </Button>
        </div>
      </form>
    </div>
  );
}
