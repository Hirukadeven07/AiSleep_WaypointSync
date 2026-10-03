'use client';

import { useState } from 'react';
import type { AutoAssignProposal, PublishCheck } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { AutoAssignModal } from './AutoAssignModal';
import { DeferModal } from './DeferModal';
import { NewTripModal } from './NewTripModal';
import { OrderDrawer } from './OrderDrawer';
import { OrderQueue } from './OrderQueue';
import { PlanHeader, SummaryStrip } from './PlanHeader';
import { PlanToast } from './PlanToast';
import { PublishModal, publishPlan } from './PublishModal';
import { RemoveTripModal } from './RemoveTripModal';
import { TripList } from './TripList';
import { PlanMap } from '@/components/map/PlanMap';
import { usePlan } from './usePlan';
import { usePlanEdit } from './usePlanEdit';

/** The dispatcher's plan board (Figma "Plan v2"). */
export function PlanBoard() {
  const { plan, error, reload } = usePlan();
  const edit = usePlanEdit(plan, reload);
  const [view, setView] = useState<'list' | 'map'>('list');

  if (!plan) {
    return (
      <p className="px-2 pt-4 text-body text-muted" role="status">
        {error ? 'The plan could not be loaded.' : 'Loading the plan…'}
      </p>
    );
  }

  const firstOver = plan.trips.find((t) => t.state === 'over');
  const modal = edit.modal;

  /** Publishing with nothing open goes straight through; otherwise the check explains what is open. */
  async function publish(tripId?: string) {
    try {
      const check = await api<PublishCheck>('/plan/publish/check', {
        method: 'POST',
        body: tripId ? { tripId } : {},
      });
      if (check.problems.length === 0) await publishPlan(edit, false, tripId);
      else edit.openModal({ kind: 'publish', check, tripId });
    } catch {
      edit.showToast({ kind: 'error', title: 'The plan could not be checked', sub: 'Try again.' });
    }
  }

  async function autoAssign() {
    try {
      const proposal = await api<AutoAssignProposal>('/plan/auto-assign', {
        method: 'POST',
        body: {},
      });
      edit.openModal({ kind: 'auto', proposal });
    } catch {
      edit.showToast({ kind: 'error', title: 'Auto-assign is not available', sub: 'Try again.' });
    }
  }

  return (
    <div className="flex flex-col gap-[14px] pt-4 lg:-mb-2">
      <PlanHeader
        plan={plan}
        view={view}
        onView={setView}
        onAutoAssign={autoAssign}
        onNewTrip={() => edit.openModal({ kind: 'newTrip' })}
        onPublish={publish}
      />
      <SummaryStrip
        summary={plan.summary}
        published={plan.published}
        onView={() => firstOver && edit.focusTrip(firstOver.id)}
      />
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-214px)] lg:min-h-[520px] lg:flex-row">
        <OrderQueue
          orders={plan.orders}
          moved={plan.movedToLater}
          districts={plan.districts}
          edit={edit}
          className="lg:w-[340px] lg:shrink-0"
        />
        {view === 'list' ? (
          <TripList
            trips={plan.trips}
            edit={edit}
            onPublish={(tripId) => void publish(tripId)}
            className="min-w-0 lg:flex-1"
          />
        ) : (
          <PlanMap
            date={plan.date}
            refreshKey={`${plan.orders.length}:${plan.trips.map((t) => t.stops.length).join(',')}`}
            onOpenOrder={(id) => edit.openDrawer(id)}
          />
        )}
      </div>

      {edit.drawerId && (
        <OrderDrawer
          orderId={edit.drawerId}
          onClose={edit.closeDrawer}
          onMoveLater={() => edit.openModal({ kind: 'defer', orderId: edit.drawerId! })}
          onAdd={(detail, tripId) => {
            edit.closeDrawer();
            void edit.place(detail.order.id, detail.order.storeName, tripId);
          }}
        />
      )}
      {modal?.kind === 'defer' && <DeferModal orderId={modal.orderId} edit={edit} />}
      {modal?.kind === 'newTrip' && <NewTripModal edit={edit} />}
      {modal?.kind === 'publish' && (
        <PublishModal check={modal.check} tripId={modal.tripId} edit={edit} />
      )}
      {modal?.kind === 'auto' && <AutoAssignModal proposal={modal.proposal} edit={edit} />}
      {modal?.kind === 'removeTrip' && <RemoveTripModal trip={modal.trip} edit={edit} />}
      {edit.toast && <PlanToast toast={edit.toast} />}
    </div>
  );
}
