import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  accent: 'bg-olive text-ink hover:opacity-90',
  secondary: 'bg-surface text-ink border border-mist hover:opacity-90',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'bg-transparent text-muted hover:text-text',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-pill px-[22px] py-[13px] text-body font-semibold disabled:cursor-not-allowed disabled:bg-mist disabled:text-slate disabled:border-transparent ${variants[variant]} ${className}`}
    />
  );
}
