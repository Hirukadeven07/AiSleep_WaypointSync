'use client';

import { useEffect, type ReactNode } from 'react';

/** Dark scrim with a white rounded panel in the middle (the Figma modals: 28px radius, 28px padding). */
export function Modal({
  label,
  width,
  onClose,
  children,
}: {
  label: string;
  /** Panel width in px (Figma: 520, 580 or 660). */
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 bg-ink/35"
      />
      <div
        role="dialog"
        aria-label={label}
        style={{ width }}
        className="relative flex max-h-[calc(100vh-32px)] max-w-full flex-col gap-4 overflow-y-auto rounded-hero bg-surface p-7 shadow-ghost"
      >
        {children}
      </div>
    </div>
  );
}

/** Round icon tile at the top of a modal. */
export function ModalIcon({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`flex size-12 shrink-0 items-center justify-center rounded-card ${tone}`}>
      {children}
    </span>
  );
}

export function OutlineButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded-pill border border-border bg-surface px-[18px] py-3 text-[14px] font-semibold leading-5 text-ink disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SolidButton({
  children,
  onClick,
  disabled,
  className = 'bg-primary text-bg',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center rounded-pill px-[18px] py-3 text-[14px] font-semibold leading-5 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
