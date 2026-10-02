'use client';

import { useState } from 'react';
import type { PlanTrip, RemoveTripResult } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { Modal, ModalIcon, OutlineButton, SolidButton } from './Modal';
import type { PlanEdit } from './usePlanEdit';

/** Confirm taking a trip off the plan; its orders go back to the queue. */
export function RemoveTripModal({ trip, edit }: { trip: PlanTrip; edit: PlanEdit }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = `${trip.plate ?? trip.vehicleId} · Trip ${trip.tripNumber}`;
  const stops = trip.stops.length;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<RemoveTripResult>(`/plan/trips/${trip.id}`, { method: 'DELETE' });
      await edit.reload();
      edit.closeModal();
      edit.showToast({
        kind: 'ok',
        title: `Trip removed: ${name}`,
        sub:
          result.ordersReturned > 0
            ? `${result.ordersReturned} ${result.ordersReturned === 1 ? 'order is' : 'orders are'} back in the queue`
            : 'It had no orders',
      });
    } catch (e) {
      setBusy(false);
      const body = (e as { body?: { message?: string } }).body;
      setError(body?.message ?? 'The trip could not be removed. Try again.');
    }
  }

  return (
    <Modal label="Remove trip" width={520} onClose={edit.closeModal}>
      <ModalIcon tone="bg-danger-tint text-danger">
        <Icon name="x" size={22} />
      </ModalIcon>
      <h2 className="text-[24px] font-semibold leading-[30px] text-ink">Remove {name}?</h2>
      <p className="text-[14px] leading-5 text-muted">
        {stops > 0
          ? `Its ${stops} ${stops === 1 ? 'order goes' : 'orders go'} back to the order queue so you can plan ${stops === 1 ? 'it' : 'them'} on another trip.`
          : 'It has no orders yet.'}{' '}
        {trip.plate ?? trip.vehicleId} becomes free for this run again.
      </p>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-[10px]">
        <OutlineButton onClick={edit.closeModal}>Cancel</OutlineButton>
        <SolidButton onClick={remove} disabled={busy} className="bg-danger text-white">
          Remove trip
        </SolidButton>
      </div>
    </Modal>
  );
}
