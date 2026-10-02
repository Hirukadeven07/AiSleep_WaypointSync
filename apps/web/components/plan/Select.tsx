'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { useDropdown } from './useDropdown';

export type SelectOption = { value: string; label: string };

/**
 * Order queue filter pill ("Type All ▾"): pick one option from a list that drops down under it.
 * With `searchable`, a box at the top of the list narrows long lists such as stores.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  searchable = false,
  disabled = false,
  className = '',
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { open, setOpen, anchor, list, style } = useDropdown<HTMLButtonElement>();
  const [query, setQuery] = useState('');
  const current = options.find((o) => o.value === value)?.label ?? value;
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-w-px items-center gap-[6px] rounded-pill bg-bg py-2 pl-3 pr-[10px] text-left disabled:opacity-50 ${className}`}
      >
        <span className="text-[12px] font-medium leading-[15px] text-muted">{label}</span>
        <span className="truncate text-[12px] font-semibold leading-[15px] text-ink">
          {current}
        </span>
        <span className="min-w-px flex-1" />
        <Icon name="chevron-down" size={12} className="shrink-0 text-muted" />
      </button>

      {open &&
        createPortal(
          <div
            ref={list}
            style={style}
            className="fixed z-40 flex max-w-[320px] flex-col rounded-card bg-surface p-2 shadow-lg ring-1 ring-border"
          >
            {searchable && (
              <label className="mb-1 flex shrink-0 items-center gap-2 rounded-pill bg-bg px-3 py-[7px]">
                <Icon name="search" size={13} className="text-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}`}
                  className="min-w-px flex-1 bg-transparent text-[13px] leading-[18px] text-ink outline-none placeholder:text-muted"
                />
              </label>
            )}
            <ul role="listbox" aria-label={label} className="flex min-h-0 flex-col overflow-y-auto">
              {shown.map((o) => {
                const on = o.value === value;
                return (
                  <li key={o.value} role="option" aria-selected={on}>
                    <button
                      type="button"
                      onClick={() => pick(o.value)}
                      className={`flex w-full items-center gap-2 rounded-input px-2 py-[7px] text-left hover:bg-bg ${
                        on ? 'font-semibold text-ink' : 'text-ink'
                      }`}
                    >
                      <span className="min-w-px flex-1 truncate text-[13px] leading-[18px]">
                        {o.label}
                      </span>
                      {on && <Icon name="check" size={13} className="shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })}
              {shown.length === 0 && (
                <li className="px-2 py-[7px] text-[13px] leading-[18px] text-muted">No matches</li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
