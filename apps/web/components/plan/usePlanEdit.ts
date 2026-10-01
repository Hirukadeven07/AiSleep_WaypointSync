'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AssignResult,
  AutoAssignProposal,
  DropCheck,
  PlanDay,
  PlanTrip,
  PublishCheck,
  UnassignResult,
} from '@waypoint/contracts';
import { ApiError, api } from '@/lib/api';
import { kgText, m3Text } from './format';

export type DragState = { orderId: string; storeName: string; fromTripId: string | null };
export type Hover = { tripId: string; check: DropCheck | null };
export type ToastState = {
  kind: 'ok' | 'error';
  title: string;
  sub: string;
  undo?: () => void;
  /** A button on the toast that goes to another page. */
  action?: { label: string; href: string };
};

export type PlanModal =
  | { kind: 'defer'; orderId: string }
  | { kind: 'newTrip' }
  | { kind: 'publish'; check: PublishCheck }
  | { kind: 'auto'; proposal: AutoAssignProposal };

const tripName = (t: PlanTrip) => t.plate ?? t.vehicleId;

/** How much room a trip that was over capacity has now, e.g. "WP-3310 is back under volume (7.6 of 8.0 m³)". */
function backUnder(before: PlanTrip | undefined, after: PlanTrip): string | null {
  if (!before || before.state !== 'over' || after.state === 'over') return null;
  if (before.overVolume) {
    return `${tripName(after)} is back under volume (${m3Text(after.volumeM3)} of ${m3Text(after.volumeCapM3)} m³)`;
  }
  return `${tripName(after)} is back under weight (${kgText(after.weightKg)} of ${kgText(after.weightCapKg)} kg)`;
}

function reason(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body as { message?: string } | undefined;
    if (body?.message) return body.message;
  }
  return 'The plan could not be changed.';
}

/** Drag, drop, undo and the order drawer for the plan board. All rules are decided by the API. */
export function usePlanEdit(plan: PlanDay | null, reload: () => Promise<void>) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [modal, setModal] = useState<PlanModal | null>(null);

  const hoverId = useRef<string | null>(null);
  const checks = useRef(new Map<string, DropCheck>());
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const closeDrawer = useCallback(() => setDrawerId(null), []);
  const closeModal = useCallback(() => setModal(null), []);
  const showToast = useCallback((t: ToastState) => setToast(t), []);
  const dismissToast = useCallback(() => setToast(null), []);
  const focusTrip = useCallback((id: string) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 })), []);

  /** A moved order comes back to the waiting queue. */
  const bringBack = useCallback(
    (orderId: string, storeName: string) => {
      void api('/plan/bring-back', { method: 'POST', body: { orderId } })
        .then(reload)
        .then(() => setToast({ kind: 'ok', title: `${storeName} is back in the queue`, sub: '' }))
        .catch((e) =>
          setToast({
            kind: 'error',
            title: `${storeName} could not be brought back`,
            sub: reason(e),
          }),
        );
    },
    [reload],
  );

  const startDrag = useCallback((d: DragState) => setDrag(d), []);

  const endDrag = useCallback(() => {
    setDrag(null);
    setHover(null);
    hoverId.current = null;
    checks.current.clear();
  }, []);

  const enter = useCallback(
    (tripId: string) => {
      if (!drag || hoverId.current === tripId) return;
      hoverId.current = tripId;
      const key = `${drag.orderId}:${tripId}`;
      const cached = checks.current.get(key);
      setHover({ tripId, check: cached ?? null });
      if (cached) return;
      api<DropCheck>('/plan/check', { method: 'POST', body: { orderId: drag.orderId, tripId } })
        .then((check) => {
          checks.current.set(key, check);
          if (hoverId.current === tripId) setHover({ tripId, check });
        })
        .catch(() => undefined);
    },
    [drag],
  );

  const leave = useCallback((tripId: string) => {
    if (hoverId.current !== tripId) return;
    hoverId.current = null;
    setHover(null);
  }, []);

  /** Put an order on a trip. Returns true when it was saved. */
  const place = useCallback(
    async (orderId: string, storeName: string, tripId: string) => {
      const before = planRef.current?.trips.find((t) => t.id === tripId);
      const fromBefore = planRef.current?.trips.find((t) =>
        t.stops.some((s) => s.orderId === orderId),
      );
      try {
        const res = await api<AssignResult>('/plan/assign', {
          method: 'POST',
          body: { orderId, tripId },
        });
        await reload();
        const moved = res.fromTrip !== null;
        const stop = res.placedSequence;
        const sub = [
          res.fromTrip ? backUnder(fromBefore, res.fromTrip) : null,
          !res.fromTrip || !backUnder(fromBefore, res.fromTrip)
            ? res.resorted
              ? 'Stops re-sorted by delivery window'
              : null
            : null,
        ].filter(Boolean)[0];
        setJustAdded(orderId);
        setFocus((f) => ({ id: tripId, n: (f?.n ?? 0) + 1 }));
        setToast({
          kind: 'ok',
          title: moved
            ? `${storeName} moved to ${tripName(res.trip)}`
            : `${storeName} added to ${tripName(res.trip)} as stop ${stop}${stop === 1 ? ' (earliest window)' : ''}`,
          sub: sub ?? '',
          undo: () => {
            const back = res.fromTrip
              ? api<AssignResult>('/plan/assign', {
                  method: 'POST',
                  body: { orderId, tripId: res.fromTrip.id },
                })
              : api<UnassignResult>('/plan/unassign', { method: 'POST', body: { orderId } });
            void back.then(reload).finally(() => {
              setToast(null);
              setJustAdded(null);
            });
          },
        });
        return true;
      } catch (e) {
        setToast({
          kind: 'error',
          title: `${storeName} can't go on ${before ? tripName(before) : 'this trip'}`,
          sub: reason(e),
        });
        return false;
      }
    },
    [reload],
  );

  const drop = useCallback(
    (tripId: string) => {
      if (!drag) return;
      const d = drag;
      endDrag();
      void place(d.orderId, d.storeName, tripId);
    },
    [drag, endDrag, place],
  );

  /** Drop an order that is on a trip back onto the queue. */
  const dropOnQueue = useCallback(() => {
    if (!drag?.fromTripId) return;
    const d = drag;
    endDrag();
    void api<UnassignResult>('/plan/unassign', { method: 'POST', body: { orderId: d.orderId } })
      .then(reload)
      .then(() => {
        setJustAdded(null);
        setToast({
          kind: 'ok',
          title: `${d.storeName} is waiting again`,
          sub: '',
          undo: () => {
            void place(d.orderId, d.storeName, d.fromTripId!).then(() => undefined);
          },
        });
      })
      .catch((e) =>
        setToast({ kind: 'error', title: `${d.storeName} could not be moved`, sub: reason(e) }),
      );
  }, [drag, endDrag, place, reload]);

  return {
    drag,
    hover,
    toast,
    justAdded,
    focus,
    drawerId,
    modal,
    startDrag,
    endDrag,
    enter,
    leave,
    drop,
    dropOnQueue,
    place,
    dismissToast,
    bringBack,
    openDrawer: setDrawerId,
    closeDrawer,
    openModal: setModal,
    closeModal,
    showToast,
    reload,
    focusTrip,
  };
}

export type PlanEdit = ReturnType<typeof usePlanEdit>;
