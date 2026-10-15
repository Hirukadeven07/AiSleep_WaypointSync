'use client';

import { useEffect, useState } from 'react';
import type { NotifyPreview, NotifyResult } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { Modal, ModalIcon, OutlineButton, SolidButton } from '@/components/plan/Modal';
import { api } from '@/lib/api';

/** Figma "Modal / Notify stores": pick the stores a delay reaches, edit the message, send it in their app. */
export function NotifyModal({
  tripId,
  onClose,
  onSent,
}: {
  tripId: string;
  onClose: () => void;
  onSent: (sent: number) => void;
}) {
  const [preview, setPreview] = useState<NotifyPreview | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<NotifyPreview>(`/dispatch/trips/${tripId}/notify-preview`)
      .then((p) => {
        if (!live) return;
        setPreview(p);
        setPicked(new Set(p.recipients.map((r) => r.stopId)));
        setMessage(p.message);
      })
      .catch(() => live && onClose());
    return () => {
      live = false;
    };
  }, [tripId, onClose]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<NotifyResult>(`/dispatch/trips/${tripId}/notify`, {
        method: 'POST',
        body: { stopIds: [...picked], message },
      });
      onSent(res.sent);
    } catch {
      setBusy(false);
      setError('The message could not be sent. Try again.');
    }
  }

  const n = picked.size;
  const total = preview?.recipients.length ?? 0;

  return (
    <Modal label="Notify stores" width={540} onClose={onClose}>
      <ModalIcon tone="bg-info-tint text-slate">
        <Icon name="bell" size={22} />
      </ModalIcon>
      <h2 className="text-[24px] font-semibold leading-[30px] text-ink">
        {total === 0
          ? 'No stores are affected'
          : `Let ${total} ${total === 1 ? 'store' : 'stores'} know about the delay?`}
      </h2>
      <p className="whitespace-pre text-[13px] leading-[18px] text-muted">
        {preview?.subtitle ?? ' '}
      </p>

      {preview?.recipients.map((r) => {
        const on = picked.has(r.stopId);
        return (
          <button
            key={r.stopId}
            type="button"
            onClick={() =>
              setPicked((p) => {
                const next = new Set(p);
                if (next.has(r.stopId)) next.delete(r.stopId);
                else next.add(r.stopId);
                return next;
              })
            }
            aria-pressed={on}
            className="flex items-center gap-3 rounded-note bg-bg p-[14px] text-left"
          >
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-[6px] text-[12px] font-bold leading-[17px] ${
                on ? 'bg-primary text-on-primary' : 'border border-mist bg-surface text-transparent'
              }`}
            >
              ✓
            </span>
            <span className="flex min-w-px flex-1 flex-col gap-px whitespace-nowrap">
              <span className="text-[14px] font-semibold leading-5 text-ink">{r.storeName}</span>
              <span className="text-[12px] leading-[17px] text-muted">{r.detail}</span>
            </span>
          </button>
        );
      })}

      {total > 0 && (
        <>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[12px] font-semibold leading-[17px] text-muted">Message</span>
            <span className="flex items-start gap-[10px] rounded-note border border-border bg-surface p-[14px]">
              <Icon name="msg" size={16} className="mt-[1px] text-slate" />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={500}
                className="min-w-px flex-1 resize-none bg-transparent text-[13px] leading-[19px] text-ink outline-none"
              />
            </span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold leading-[17px] text-muted">Send via</span>
            <span className="rounded-pill bg-slate/[0.14] px-[10px] py-1 text-[12px] font-semibold leading-[15px] text-slate">
              Store app
            </span>
            <span
              title="SMS is not set up yet"
              className="rounded-pill bg-muted/[0.14] px-[10px] py-1 text-[12px] font-semibold leading-[15px] text-muted opacity-60"
            >
              SMS
            </span>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-[10px]">
        <OutlineButton onClick={onClose}>Cancel</OutlineButton>
        <SolidButton onClick={send} disabled={busy || n === 0 || message.trim() === ''}>
          {`Send to ${n} ${n === 1 ? 'store' : 'stores'}`}
        </SolidButton>
      </div>
    </Modal>
  );
}
