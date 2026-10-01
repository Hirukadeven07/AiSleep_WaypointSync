'use client';

import { useEffect, useState } from 'react';
import { DEFER_REASONS, type DeferPreview, type DeferResult } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { dayLabel } from './format';
import { Modal, ModalIcon, OutlineButton, SolidButton } from './Modal';
import type { PlanEdit } from './usePlanEdit';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const weekday = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });

/** Figma "Plan v2 / Move to later": why, the new date, and the message the store will get. */
export function DeferModal({ orderId, edit }: { orderId: string; edit: PlanEdit }) {
  const [reason, setReason] = useState<string>(DEFER_REASONS[0]);
  const [preview, setPreview] = useState<DeferPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<DeferPreview>('/plan/defer/preview', { method: 'POST', body: { orderId, reason } })
      .then((p) => live && setPreview(p))
      .catch(() => live && edit.closeModal());
    return () => {
      live = false;
    };
    // The reason is the only thing that changes the preview.
  }, [orderId, reason]);

  async function move() {
    if (!preview) return;
    setBusy(true);
    try {
      await api<DeferResult>('/plan/defer', { method: 'POST', body: { orderId, reason } });
      await edit.reload();
      edit.closeModal();
      edit.closeDrawer();
      edit.showToast({
        kind: 'ok',
        title: `${preview.storeName} moved to ${dayLabel(preview.newDate)}`,
        sub: 'The store has been told why',
        undo: () => {
          void api('/plan/bring-back', { method: 'POST', body: { orderId } })
            .then(edit.reload)
            .finally(edit.dismissToast);
        },
      });
    } catch {
      setBusy(false);
      edit.showToast({
        kind: 'error',
        title: `${preview.storeName} could not be moved`,
        sub: 'Try again.',
      });
    }
  }

  const day = preview ? weekday(preview.newDate) : '';

  return (
    <Modal label="Move to later" width={520} onClose={edit.closeModal}>
      <ModalIcon tone="bg-warning-tint text-warning">
        <Icon name="clock" size={22} />
      </ModalIcon>
      <h2 className="text-[24px] font-semibold leading-[30px] text-ink">
        Move {preview?.storeName ?? '…'} to later?
      </h2>
      {preview && (
        <div className="flex items-start gap-[10px] rounded-input bg-warning-tint p-3">
          <Icon name="alert" size={16} className="text-warning" />
          <p className="min-w-px flex-1 text-[13px] font-medium leading-[19px] text-ink">
            {preview.times > 1 ? `This would be the ${ordinal(preview.times)} time. ` : ''}
            It will be first in line on {day}.
          </p>
        </div>
      )}

      <label className="flex flex-col gap-[6px]">
        <span className="text-[12px] font-semibold leading-[17px] text-muted">Why</span>
        <span className="relative flex items-center rounded-note bg-bg px-4 py-3">
          <span className="min-w-px flex-1 text-[14px] leading-5 text-ink">{reason}</span>
          <span className="text-[12px] font-semibold leading-[17px] text-muted">▾</span>
          <select
            aria-label="Why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {DEFER_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </span>
      </label>

      <div className="flex flex-col gap-[6px]">
        <span className="text-[12px] font-semibold leading-[17px] text-muted">New date</span>
        <span className="flex items-center rounded-note bg-bg px-4 py-3">
          <span className="min-w-px flex-1 text-[14px] leading-5 text-ink">
            {preview ? `${dayLabel(preview.newDate)} · first in line` : '…'}
          </span>
          <span className="text-[12px] font-semibold leading-[17px] text-muted">▾</span>
        </span>
      </div>

      <div className="flex items-start gap-[10px] rounded-note bg-info-tint p-[14px]">
        <Icon name="msg" size={16} className="text-slate" />
        <p className="min-w-px flex-1 text-[13px] leading-[19px] text-ink">
          {preview ? `Store gets: "${preview.storeMessage}"` : '…'}
        </p>
      </div>

      <div className="flex justify-end gap-[10px]">
        <OutlineButton onClick={edit.closeModal}>Cancel</OutlineButton>
        <SolidButton onClick={move} disabled={!preview || busy} className="bg-warning text-white">
          Move to {day || '…'}
        </SolidButton>
      </div>
    </Modal>
  );
}
