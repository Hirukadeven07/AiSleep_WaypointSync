'use client';

import type { PlanPublishResult, PublishCheck } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { Modal, ModalIcon, SolidButton } from './Modal';
import type { PlanEdit } from './usePlanEdit';

/** Sends the plan, then says how many trips and stores it reached (Figma "Published" toast). */
export async function publishPlan(edit: PlanEdit, anyway: boolean, tripId?: string) {
  try {
    const res = await api<PlanPublishResult>('/plan/publish', {
      method: 'POST',
      body: { anyway, ...(tripId ? { tripId } : {}) },
    });
    await edit.reload();
    edit.closeModal();
    const one = Boolean(tripId);
    edit.showToast({
      kind: 'ok',
      title: one ? 'Trip published' : 'Trips published',
      sub: `${res.tripCount} ${res.tripCount === 1 ? 'trip' : 'trips'} sent to loaders and drivers · ${res.storeCount} ${
        res.storeCount === 1 ? 'store' : 'stores'
      } notified`,
      action: { label: 'View dispatch board', href: '/dispatch/board' },
    });
  } catch (e) {
    const body = (e as { body?: { message?: string } }).body;
    edit.closeModal();
    edit.showToast({
      kind: 'error',
      title: 'The plan was not published',
      sub: body?.message ?? 'Try again.',
    });
  }
}

/** Figma "Plan v2 / Publish check": what is still open. A capacity problem blocks; other warnings can go through. */
export function PublishModal({
  check,
  edit,
  tripId,
}: {
  check: PublishCheck;
  edit: PlanEdit;
  tripId?: string;
}) {
  const n = check.problems.length;
  return (
    <Modal label="Publish check" width={520} onClose={edit.closeModal}>
      <ModalIcon tone="bg-danger-tint text-danger">
        <Icon name="alert" size={22} />
      </ModalIcon>
      <h2 className="whitespace-nowrap text-[24px] font-semibold leading-[30px] text-ink">
        {n} {n === 1 ? 'problem is' : 'problems are'} still open
      </h2>
      {check.problems.map((p) => (
        <div
          key={`${p.tripId}-${p.code}`}
          className="flex items-center gap-[10px] rounded-note bg-danger-wash p-[14px]"
        >
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full ${p.severity === 'block' ? 'bg-danger' : 'bg-warning'}`}
          />
          <p className="min-w-px flex-1 text-[13px] font-medium leading-[19px] text-ink">
            {p.message}
          </p>
        </div>
      ))}
      <p className="text-[14px] leading-[21px] text-muted">
        Publishing sends {check.tripCount} {check.tripCount === 1 ? 'trip' : 'trips'} to loaders and
        drivers, and tells every store its delivery window or new date.
      </p>
      <div className="flex gap-[10px]">
        <button
          type="button"
          disabled={!check.canPublish}
          onClick={() => void publishPlan(edit, true, tripId)}
          className="flex min-w-px flex-1 items-center justify-center rounded-pill border border-border bg-surface px-[18px] py-3 text-[14px] font-semibold leading-5 text-ink disabled:opacity-40"
        >
          Publish anyway
        </button>
        <SolidButton onClick={edit.closeModal} className="min-w-px flex-1 bg-primary text-on-primary">
          Back to plan
        </SolidButton>
      </div>
      {!check.canPublish && (
        <p className="text-[12px] leading-[17px] text-muted">
          A trip over its weight or volume limit cannot be published. Move a stop to another trip or
          to later, then publish again.
        </p>
      )}
    </Modal>
  );
}
