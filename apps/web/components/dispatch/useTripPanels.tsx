'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LiveDay } from '@waypoint/contracts';
import { PlanToast } from '@/components/plan/PlanToast';
import type { ToastState } from '@/components/plan/usePlanEdit';
import { NotifyModal } from './NotifyModal';
import { TripDrawer } from './TripDrawer';
import { VehicleActions } from './VehicleActions';

type Panel = { kind: 'trip' | 'actions' | 'notify'; id: string };

/** The trip detail drawer, the vehicle actions panel and the notify dialog, shared by the live day and the dispatch board. */
export function useTripPanels(day: LiveDay | undefined) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const close = useCallback(() => setPanel(null), []);
  const openTrip = useCallback((id: string) => setPanel({ kind: 'trip', id }), []);
  const openActions = useCallback((id: string) => setPanel({ kind: 'actions', id }), []);

  // Today's and tomorrow's rows can both open the drawer.
  const all = [...(day?.trips ?? []), ...(day?.tomorrowTrips ?? [])];
  const trip = all.find((t) => t.id === panel?.id);
  const sibling = trip
    ? all.find(
        (t) => t.vehicleId === trip.vehicleId && t.tripNumber === (trip.nextTrip?.tripNumber ?? -1),
      )
    : undefined;

  const element = (
    <>
      {panel?.kind === 'trip' && trip && (
        <TripDrawer
          trip={trip}
          onClose={close}
          onNotify={() => setPanel({ kind: 'notify', id: trip.id })}
          onOpenTrip={openTrip}
          nextTripId={sibling?.id ?? null}
        />
      )}
      {panel?.kind === 'actions' && trip && (
        <VehicleActions
          trip={trip}
          onClose={close}
          onNotify={() => setPanel({ kind: 'notify', id: trip.id })}
        />
      )}
      {panel?.kind === 'notify' && trip && (
        <NotifyModal
          tripId={trip.id}
          onClose={close}
          onSent={(sent) => {
            close();
            setToast({
              kind: 'ok',
              title: `${sent} ${sent === 1 ? 'store' : 'stores'} notified`,
              sub: 'They can see the new ETA in their app',
            });
          }}
        />
      )}
      {toast && <PlanToast toast={toast} />}
    </>
  );

  return { openTrip, openActions, element };
}
