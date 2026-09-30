'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Local stand-in for Methuli's shared toast. When the shared one lands, replace this file's
 * internals and keep the `useToast().show(message, tone)` signature.
 */
type Tone = 'info' | 'error';
interface ToastItem { id: number; message: string; tone: Tone }
const ToastContext = createContext<{ show: (message: string, tone?: Tone) => void }>({ show: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const show = useCallback((message: string, tone: Tone = 'info') => {
    const id = next.current++;
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-50 mx-auto flex max-w-md flex-col gap-2 px-4"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-base font-medium shadow-lg ${
              t.tone === 'error' ? 'bg-red-700 text-white' : 'bg-neutral-900 text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
