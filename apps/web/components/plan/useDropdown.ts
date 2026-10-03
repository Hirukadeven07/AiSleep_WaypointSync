'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Open/close state and placement for a dropdown list drawn over the page (in a portal), so a
 * scrolling panel or dialog cannot clip it. The list always drops down under its field and
 * follows it on scroll and resize. Outside clicks and Escape close it; Escape is caught first so
 * it closes the list, not a dialog the field sits in.
 */
export function useDropdown<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const anchor = useRef<T>(null);
  const list = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const pin = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      setStyle({
        left: r.left,
        top: r.bottom + 4,
        minWidth: r.width,
        maxHeight: Math.max(160, window.innerHeight - r.bottom - 12),
      });
    };
    pin();
    window.addEventListener('resize', pin);
    window.addEventListener('scroll', pin, true);
    return () => {
      window.removeEventListener('resize', pin);
      window.removeEventListener('scroll', pin, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  return { open, setOpen, anchor, list, style };
}
