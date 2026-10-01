'use client';

import type { PlanLock } from '@waypoint/contracts';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

/** L5: loading pauses until the loader accepts the dispatcher's new plan. */
export function PlanLockBanner({
  lock,
  addedNames,
  busy,
  onAcknowledge,
}: {
  lock: PlanLock;
  addedNames: string[];
  busy: boolean;
  onAcknowledge: () => void;
}) {
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
            Loading is paused. Version {lock.ackedPlanVersion} → {lock.planVersion}. Check the
            changes, then resume.
          </p>
        </div>
      </div>

      {(lock.removed.length > 0 || addedNames.length > 0) && (
        <ul className="space-y-xs">
          {lock.removed.map((r) => (
            <li
              key={r.orderId}
              className="flex items-center gap-sm rounded-input bg-danger-tint px-md py-sm text-body text-danger"
            >
              <span className="font-bold">−</span>
              <span className="min-w-0 flex-1 truncate line-through">{r.storeName}</span>
              <span className="text-caption font-semibold">Unload</span>
            </li>
          ))}
          {addedNames.map((name) => (
            <li
              key={name}
              className="flex items-center gap-sm rounded-input bg-success-tint px-md py-sm text-body text-success"
            >
              <span className="font-bold">+</span>
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className="text-caption font-semibold">New</span>
            </li>
          ))}
        </ul>
      )}

      <Button className="w-full" onClick={onAcknowledge} disabled={busy}>
        {busy ? 'Resuming…' : 'Acknowledge and resume'}
      </Button>
    </div>
  );
}
