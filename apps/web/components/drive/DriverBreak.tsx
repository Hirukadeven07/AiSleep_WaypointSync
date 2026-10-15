'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useBreak, useTick } from '@/lib/use-break';
import { OfflineBanner } from './OfflineBanner';
import { useDriver } from './DriverShell';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * R4 break: one tap starts a break, which pauses the trip (the next stop waits) and shows on the
 * dispatch board; the screen counts the break and what is left of today's allowance.
 */
export function DriverBreak() {
  const { online } = useDriver();
  const b = useBreak();
  const now = useTick(b.onBreakSince !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runningMs = b.onBreakSince !== null ? now - b.onBreakSince : 0;
  const leftMin = Math.floor(b.allowanceMin - b.usedMin - runningMs / 60_000);
  const over = leftMin < 0;

  async function tap(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError('Could not save that on this phone. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:max-w-[640px]">
      <h1 className="text-[26px] font-semibold leading-8 text-ink">Break</h1>
      {!online && <OfflineBanner />}

      <section
        className={`flex flex-col items-center gap-2 rounded-card p-6 text-center ${
          b.onBreakSince !== null ? 'bg-tech-tint' : 'bg-surface'
        }`}
        role="status"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-surface text-tech">
          <Icon name="coffee" size={26} />
        </span>
        {b.onBreakSince !== null ? (
          <>
            <p className="text-[15px] font-semibold leading-5 text-muted">On break · trip paused</p>
            <p className="text-[44px] font-bold leading-[52px] text-ink tabular-nums">
              {mmss(runningMs)}
            </p>
          </>
        ) : (
          <p className="text-[17px] font-semibold leading-[22px] text-ink">You are driving</p>
        )}
        <p className={`text-[15px] font-medium leading-5 ${over ? 'text-danger' : 'text-muted'}`}>
          {over
            ? `Over today's ${b.allowanceMin} min allowance by ${-leftMin} min`
            : `${leftMin} of ${b.allowanceMin} min break left today`}
        </p>
      </section>

      {b.onBreakSince !== null ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void tap(b.end)}
          className="flex min-h-[56px] items-center justify-center rounded-pill bg-primary px-5 text-[17px] font-semibold text-on-primary disabled:opacity-60"
        >
          End break and resume
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void tap(b.start)}
          className="flex min-h-[56px] items-center justify-center rounded-pill bg-primary px-5 text-[17px] font-semibold text-on-primary disabled:opacity-60"
        >
          Start break
        </button>
      )}
      {error && <p className="text-[14px] leading-5 text-danger">{error}</p>}
      <p className="text-[14px] leading-5 text-muted">
        Dispatch sees that you are on a break. Your next stop waits until you end it. This works
        with no signal and syncs later.
      </p>
    </div>
  );
}
