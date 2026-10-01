import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { ToastState } from './usePlanEdit';

/** Figma "Toast": navy pill at the bottom with a green tick, what happened, and Undo. */
export function PlanToast({ toast }: { toast: ToastState }) {
  return (
    <div
      role="status"
      className="fixed bottom-8 left-[calc(50%+50px)] z-40 flex max-w-[calc(100vw-160px)] -translate-x-1/2 items-center gap-3 rounded-[20px] bg-primary px-[18px] py-[14px]"
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-[14px] text-white ${
          toast.kind === 'ok' ? 'bg-success' : 'bg-danger'
        }`}
      >
        <Icon name={toast.kind === 'ok' ? 'check' : 'alert'} size={14} />
      </span>
      <span className="flex flex-col gap-px">
        <span className="text-[14px] font-bold leading-5 text-bg">{toast.title}</span>
        {(toast.sub || toast.undo) && (
          <span className="text-[12px] leading-[17px] text-sand">
            {toast.sub}
            {toast.sub && toast.undo ? ' · ' : ''}
            {toast.undo && (
              <button type="button" onClick={toast.undo} className="underline">
                Undo
              </button>
            )}
          </span>
        )}
      </span>
      {toast.action && (
        <Link
          href={toast.action.href}
          className="shrink-0 rounded-pill border border-border bg-surface px-3 py-[6px] text-[12px] font-semibold leading-[17px] text-ink"
        >
          {toast.action.label}
        </Link>
      )}
    </div>
  );
}
