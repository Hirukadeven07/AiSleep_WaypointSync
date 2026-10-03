'use client';

import { createPortal } from 'react-dom';
import { districtKey } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { useDropdown } from './useDropdown';

/**
 * New trip "Districts": tick one or more. `value` keeps the order they were ticked in;
 * the first is the trip's main district. The list drops down under the field.
 */
export function DistrictPicker({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { open, setOpen, anchor: root, list, style } = useDropdown();

  const picked = new Set(value.map(districtKey));
  const toggle = (d: string) =>
    onChange(
      picked.has(districtKey(d))
        ? value.filter((v) => districtKey(v) !== districtKey(d))
        : [...value, d],
    );

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Districts"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-input bg-bg px-[14px] py-[11px] text-left"
      >
        <span
          className={`min-w-px flex-1 truncate text-[14px] font-medium leading-5 ${
            value.length > 0 ? 'text-ink' : 'text-muted'
          }`}
        >
          {value.length > 0 ? value.join(', ') : 'Pick districts'}
        </span>
        {value.length > 1 && (
          <span className="rounded-pill bg-primary px-[7px] text-[11px] font-semibold leading-[17px] text-bg">
            {value.length}
          </span>
        )}
        <span className="text-[12px] font-semibold leading-[17px] text-muted">▾</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={list}
            style={style}
            className="fixed z-40 flex flex-col rounded-card bg-surface p-2 shadow-lg ring-1 ring-border"
          >
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <span className="text-[12px] font-semibold leading-[15px] text-muted">
                {value.length === 0 ? 'Pick one or more' : `${value.length} selected`}
              </span>
              {value.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[12px] font-semibold leading-[15px] text-primary"
                >
                  Clear
                </button>
              )}
            </div>
            <ul
              role="listbox"
              aria-multiselectable
              aria-label="Districts"
              className="flex max-h-[280px] min-h-0 flex-col overflow-y-auto"
            >
              {options.map((d) => {
                const on = picked.has(districtKey(d));
                return (
                  <li key={d} role="option" aria-selected={on}>
                    <button
                      type="button"
                      onClick={() => toggle(d)}
                      className="flex w-full items-center gap-2 rounded-input px-2 py-[7px] text-left hover:bg-bg"
                    >
                      <span
                        aria-hidden
                        className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] ${
                          on ? 'bg-primary text-bg' : 'ring-1 ring-inset ring-mist'
                        }`}
                      >
                        {on && <Icon name="check" size={12} />}
                      </span>
                      <span className="min-w-px flex-1 text-[13px] leading-[18px] text-ink">
                        {d}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
