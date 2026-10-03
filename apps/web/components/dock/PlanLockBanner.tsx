'use client';

import type { PlanLock, PlanLockSlot } from '@waypoint/contracts';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

const SLOT_TONE: Record<PlanLockSlot['change'], string> = {
  kept: 'bg-surface text-ink',
  removed: 'bg-danger-tint text-danger line-through',
  added: 'bg-success-tint text-success',
};

/** One side of the before/after view, in load order: the first crate in is at the back of the truck. */
function LoadColumn({ title, slots }: { title: string; slots: PlanLockSlot[] }) {
  return (
    <div className="min-w-0 flex-1 space-y-xs">
      <p className="text-caption font-semibold text-muted">{title}</p>
      <p className="text-caption text-muted">Back of the truck</p>
      <ol className="space-y-xs">
        {slots.map((s) => (
          <li
            key={`${title}-${s.orderId}`}
            className={`truncate rounded-input px-md py-sm text-body ${SLOT_TONE[s.change]}`}
          >
            {s.change === 'added' ? '+ ' : s.change === 'removed' ? '− ' : ''}
            {s.storeName}
          </li>
        ))}
      </ol>
      <p className="text-caption text-muted">Doors</p>
    </div>
  );
}

/**
 * Plan-change lock: loading pauses until the loader accepts the dispatcher's new plan. Goods of
 * removed orders must be taken off the truck first; each is confirmed on its own.
 */
export function PlanLockBanner({
  lock,
  busy,
  onTakenOff,
  onAcknowledge,
}: {
  lock: PlanLock;
  busy: boolean;
  onTakenOff: (orderId: string) => void;
  onAcknowledge: () => void;
}) {
  const left = lock.removed.filter((r) => !r.takenOff).length;
  return (
    <div
      role="alert"
      className="space-y-md rounded-card border-2 border-warning bg-warning-tint p-lg"
    >
      <div className="flex items-start gap-sm">
        <Icon name="alert" className="text-warning" />
        <div>
          <p className="text-title text-ink">Plan changed by dispatch</p>
          <p className="text-body text-muted">
            Loading is paused. Version {lock.ackedPlanVersion} → {lock.planVersion}.
            {lock.removed.length > 0
              ? ' Take the removed goods off the truck, then resume.'
              : ' Check the changes, then resume.'}
          </p>
        </div>
      </div>

      {lock.removed.length > 0 && (
        <ul className="space-y-sm" aria-label="Goods to take off">
          {lock.removed.map((r) => (
            <li key={r.orderId} className="space-y-xs rounded-input bg-surface p-md">
              <div className="flex items-center gap-sm">
                <span className="min-w-0 flex-1 truncate text-body font-semibold text-danger">
                  − {r.storeName}
                </span>
                {r.takenOff ? (
                  <span className="flex items-center gap-xs text-caption font-semibold text-success">
                    <Icon name="check" size={14} />
                    Taken off
                  </span>
                ) : (
                  <Button variant="secondary" disabled={busy} onClick={() => onTakenOff(r.orderId)}>
                    Taken off
                  </Button>
                )}
              </div>
              {r.lines.length > 0 && (
                <ul className="space-y-xs pl-md">
                  {r.lines.map((l) => (
                    <li key={l.id} className="text-label text-ink">
                      {l.qty} × {l.name} <span className="text-muted">({l.pack})</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {(lock.before.length > 0 || lock.after.length > 0) && (
        <div className="flex gap-md">
          <LoadColumn title="Before" slots={lock.before} />
          <LoadColumn title="Now" slots={lock.after} />
        </div>
      )}

      <Button className="w-full" onClick={onAcknowledge} disabled={busy || left > 0}>
        {busy
          ? 'Resuming…'
          : left > 0
            ? `Take off ${left} removed ${left === 1 ? 'order' : 'orders'} first`
            : 'Acknowledge and resume'}
      </Button>
    </div>
  );
}
