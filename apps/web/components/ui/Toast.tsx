'use client';

import { useEffect } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  info: 'bg-slate',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/** Controlled toast: render it while `message` is set and clear the message in `onClose`. */
export function Toast({
  message,
  tone = 'info',
  onClose,
  durationMs = 4000,
}: {
  message: string;
  tone?: Tone;
  onClose: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const id = setTimeout(onClose, durationMs);
    return () => clearTimeout(id);
  }, [message, durationMs, onClose]);

  return (
    <div
      role="status"
      className="fixed bottom-lg left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[20px] bg-primary px-[18px] py-[14px] text-body font-bold text-on-primary shadow-raised"
    >
      <span aria-hidden className={`h-7 w-7 shrink-0 rounded-full ${tones[tone]}`} />
      {message}
    </div>
  );
}
