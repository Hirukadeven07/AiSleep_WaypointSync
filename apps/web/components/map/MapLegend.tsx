'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

const LEGEND_KEY = 'ws-map-legend-open';

/**
 * Open or minimised, remembered on this device and shared by the live map and the plan map.
 * Open the first time, as the legend always was.
 */
function useLegendOpen() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(LEGEND_KEY) === '0') setOpen(false);
    } catch {
      /* storage blocked: it just opens each visit */
    }
  }, []);
  const toggle = () =>
    setOpen((v) => {
      try {
        window.localStorage.setItem(LEGEND_KEY, v ? '0' : '1');
      } catch {
        /* the choice lasts for this visit only */
      }
      return !v;
    });
  return { open, toggle };
}

/**
 * The legend box over a map. Its header is a button: tap to minimise it to just "Legend", tap
 * again to open it at its usual size. The OpenStreetMap credit stays visible either way.
 * `width` is the open width as a Tailwind class, e.g. "w-[230px]".
 */
export function MapLegend({ width, children }: { width: string; children: ReactNode }) {
  const { open, toggle } = useLegendOpen();
  return (
    <div className="absolute bottom-4 left-4 flex max-w-[230px] flex-col items-start gap-1">
      <div className={`rounded-card bg-surface shadow ${open ? `${width} p-3` : 'px-3 py-2'}`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="map-legend-list"
          title={open ? 'Minimise the legend' : 'Show the legend'}
          className={`flex w-full items-center gap-2 text-left text-[12px] font-semibold text-muted ${open ? 'mb-2' : ''}`}
        >
          <span className="flex-1">Legend</span>
          <Icon name="chevron-down" size={14} className={open ? '' : '-rotate-90'} />
        </button>
        {open && (
          <ul id="map-legend-list" className="flex flex-col gap-1.5">
            {children}
          </ul>
        )}
      </div>
      <p className="px-1 text-[10px] leading-3 text-muted">
        Map data © OpenStreetMap · Boundaries © geoBoundaries
      </p>
    </div>
  );
}
