'use client';

import { useEffect } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  info: 'border-border',
  success: 'border-success',
  warning: 'border-warning',
  danger: 'border-danger',
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
      className={`fixed bottom-lg left-1/2 z-50 -translate-x-1/2 rounded-card border bg-surface px-md py-sm text-label text-text shadow-lg ${tones[tone]}`}
    >
      {message}
    </div>
  );
}
