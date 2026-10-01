'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { enqueueAction } from '@/lib/outbox';
import { useDriver } from './DriverShell';
import { useToast } from './DriverToast';

/** Fixed SOS button plus its confirmation dialog. Works with no signal: the alert goes to the outbox. */
export function SosControl() {
  const { trip } = useDriver();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus(); // default focus on Cancel so a stray tap cannot send
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      triggerRef.current?.focus();
    };
  }, [open]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await enqueueAction('SOS_ALERT', { location: null }, trip?.id ?? null, trip?.planVersion ?? null);
      show('SOS alert queued. It sends as soon as you have signal.');
    } catch {
      show("Couldn't save the SOS alert. Call dispatch directly.", 'error');
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      {/* Pinned top-right so it never sits on the tab bar. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto max-w-[430px] lg:max-w-none">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Send emergency SOS alert"
          className="pointer-events-auto absolute right-5 top-[calc(3.5rem+env(safe-area-inset-top))] lg:right-10 lg:top-8 flex min-h-12 items-center gap-2 rounded-pill border-2 border-white bg-danger px-[18px] py-3 text-[16px] font-bold tracking-[0.5px] text-white shadow-[0_4px_14px_0_rgba(196,48,48,0.35)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          <Icon name="alert" size={20} />
          SOS
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sos-title"
            aria-describedby="sos-desc"
            className="w-full max-w-sm rounded-2xl bg-white p-5 text-neutral-900"
          >
            <h2 id="sos-title" className="text-xl font-bold">Send Emergency SOS Alert?</h2>
            <p id="sos-desc" className="mt-2 text-base text-neutral-700">
              Dispatch is alerted straight away. With no signal, the alert is kept on this phone and sent when you reconnect.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="h-14 rounded-xl bg-red-600 text-lg font-bold text-white disabled:opacity-60"
              >
                Send SOS
              </button>
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setOpen(false)}
                className="h-14 rounded-xl border-2 border-neutral-900 text-lg font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
