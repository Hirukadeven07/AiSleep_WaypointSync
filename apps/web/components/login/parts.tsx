'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

const PHOTO = '/login/skyline.webp';

/** Hero photo with the navy gradient, absolutely filling its parent. `variant` picks the crop. */
export function SkylinePhoto({ variant }: { variant: 'panel' | 'sheet' | 'hero' }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <img
        alt=""
        src={PHOTO}
        className={
          variant === 'sheet'
            ? 'absolute left-[-393%] top-[-31%] h-[182%] w-[607%] max-w-none'
            : variant === 'hero'
              ? 'absolute inset-0 size-full max-w-none object-cover blur-[7px] [object-position:85%_50%] lg:inset-auto lg:left-[-300px] lg:top-[-40px] lg:size-[1100px] lg:[object-position:50%_50%]'
              : 'absolute inset-0 size-full max-w-none object-cover [object-position:85%_50%]'
        }
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            variant === 'hero'
              ? 'linear-gradient(180deg, rgba(13,27,42,0.55) 0%, rgba(13,27,42,0.7) 45%, rgba(13,27,42,0.95) 100%)'
              : variant === 'panel'
                ? 'linear-gradient(180deg, rgba(27,38,59,0.15) 0%, rgba(27,38,59,0.35) 45%, rgba(27,38,59,0.95) 100%)'
                : 'linear-gradient(180deg, rgba(27,38,59,0.8) 0%, rgba(27,38,59,0.45) 12%, rgba(27,38,59,0.25) 30%, rgba(27,38,59,0.7) 60%, rgba(27,38,59,0.9) 100%)',
        }}
      />
    </div>
  );
}

export function SwitchRole({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <Link
        href="/login?switch=1"
        className="flex items-center gap-[6px] rounded-pill py-[9px] pl-3 pr-[14px] text-label font-semibold text-ink"
      >
        <Icon name="switch" size={14} />
        Switch role
      </Link>
    </span>
  );
}

export function Field({
  label,
  trailing,
  children,
}: {
  label: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-[6px]">
      <div className="flex items-start text-label font-semibold text-muted">
        <span className="flex-1">{label}</span>
        {trailing}
      </div>
      {children}
    </div>
  );
}

export function TextInput({
  invalid,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={`w-full min-w-0 bg-transparent text-[15px] leading-[21px] text-ink outline-none placeholder:text-muted/70 ${className}`}
    />
  );
}

/** Input shell: white card with a line (desktop) or canvas tint (phone). */
export function InputBox({
  tone,
  children,
}: {
  tone: 'card' | 'tint';
  children: ReactNode;
}) {
  return (
    <div
      className={`flex w-full items-center gap-2 rounded-note px-4 py-[14px] focus-within:ring-2 focus-within:ring-slate/40 ${
        tone === 'card' ? 'border border-border bg-surface' : 'bg-bg py-4'
      }`}
    >
      {children}
    </div>
  );
}

export function PasswordInput({
  tone,
  value,
  onChange,
  autoComplete = 'current-password',
}: {
  tone: 'card' | 'tint';
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <InputBox tone={tone}>
      <TextInput
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className={tone === 'tint' ? 'text-[16px] font-medium' : ''}
      />
      <button
        type="button"
        aria-label={shown ? 'Hide password' : 'Show password'}
        onClick={() => setShown((v) => !v)}
        className="shrink-0 text-slate"
      >
        <Icon name={shown ? 'eye-off' : 'eye'} size={18} />
      </button>
    </InputBox>
  );
}

export function CheckRow({
  checked,
  onChange,
  children,
  size = 22,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  size?: 20 | 22;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-[10px] text-left text-body leading-5 text-ink"
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-[6px] text-[12px] font-bold ${
          checked ? 'bg-primary text-on-primary' : 'border-2 border-mist bg-surface'
        }`}
        style={{ width: size, height: size }}
      >
        {checked ? '✓' : ''}
      </span>
      {children}
    </button>
  );
}

export function SubmitButton({
  busy,
  disabled,
  children,
  busyLabel = 'Signing in…',
  className = '',
}: {
  busy: boolean;
  disabled?: boolean;
  children: ReactNode;
  busyLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className={`flex w-full items-center justify-center rounded-pill bg-primary px-5 text-[15px] font-semibold text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:bg-mist disabled:text-slate ${className}`}
    >
      {busy ? busyLabel : children}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="w-full rounded-note bg-danger-tint px-4 py-3 text-label font-medium text-danger">
      {message}
    </p>
  );
}

/**
 * Number pad used by the dock password and the driver PIN. Also listens for the physical
 * keyboard when no text field has focus, so it can be tested on a computer.
 */
export function Keypad({
  onDigit,
  onBackspace,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (/^[0-9]$/.test(e.key)) onDigit(e.key);
      else if (e.key === 'Backspace') onBackspace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDigit, onBackspace]);

  const key =
    'flex h-[50px] items-center justify-center rounded-input bg-bg text-[20px] font-semibold text-ink active:bg-border';
  return (
    <div className="grid w-full grid-cols-3 gap-2">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} type="button" className={key} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <span aria-hidden />
      <button type="button" className={key} onClick={() => onDigit('0')}>
        0
      </button>
      <button type="button" aria-label="Delete" className={key} onClick={onBackspace}>
        <Icon name="backspace" size={20} />
      </button>
    </div>
  );
}
