'use client';

import type { RefObject } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { IslandMapHandle } from './IslandMap';

export function MapControls({ mapRef }: { mapRef: RefObject<IslandMapHandle | null> }) {
  const item =
    'flex size-10 items-center justify-center rounded-full bg-surface text-ink shadow';
  return (
    <div className="absolute bottom-4 right-4 flex flex-col gap-2">
      <button type="button" className={item} aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
        <Icon name="plus" size={16} />
      </button>
      <button type="button" className={item} aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
        <span className="text-[18px] font-medium leading-none">−</span>
      </button>
      <button
        type="button"
        className={item}
        aria-label="Reset view"
        onClick={() => mapRef.current?.reset()}
      >
        <Icon name="crosshair" size={16} />
      </button>
    </div>
  );
}
