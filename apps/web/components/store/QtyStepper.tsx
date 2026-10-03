'use client';

import { useState } from 'react';

/** Minus, a typeable count, plus. The count is clamped to min..max; an empty field counts as min. */
export function QtyStepper({
  name,
  value,
  max,
  min = 0,
  disabled = false,
  plusTone = 'primary',
  onChange,
}: {
  name: string;
  value: number;
  max: number;
  min?: number;
  disabled?: boolean;
  plusTone?: 'primary' | 'outline';
  onChange: (value: number) => void;
}) {
  // Only set while the field has focus, so it can be empty mid-edit without the count jumping.
  const [text, setText] = useState<string>();
  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  return (
    <div className="flex shrink-0 items-center gap-xs">
      <button
        type="button"
        aria-label={`Fewer ${name}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="size-11 rounded-full border border-mist text-title text-ink disabled:opacity-40"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={`Quantity of ${name}`}
        disabled={disabled}
        value={text ?? String(value)}
        onFocus={(e) => {
          setText(String(value));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
          const next = clamp(digits === '' ? min : Number(digits));
          // Typing past the limit shows the limit, not the number that was refused.
          setText(digits === '' || Number(digits) === next ? digits : String(next));
          onChange(next);
        }}
        onBlur={() => setText(undefined)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="h-11 w-14 rounded-input border border-mist bg-surface text-center text-title text-ink disabled:opacity-40"
      />
      <button
        type="button"
        aria-label={`More ${name}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className={`size-11 rounded-full text-title disabled:opacity-40 ${
          plusTone === 'primary' ? 'bg-primary text-on-primary' : 'border border-mist text-ink'
        }`}
      >
        +
      </button>
    </div>
  );
}
