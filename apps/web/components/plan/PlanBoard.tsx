'use client';

import { OrderDrawer } from './OrderDrawer';
import { OrderQueue } from './OrderQueue';
import { PlanHeader, SummaryStrip } from './PlanHeader';
import { PlanToast } from './PlanToast';
import { TripList } from './TripList';
import { usePlan } from './usePlan';
import { usePlanEdit } from './usePlanEdit';

/** The dispatcher's plan board (Figma "Plan v2"). */
export function PlanBoard() {
  const { plan, error, reload } = usePlan();
  const edit = usePlanEdit(plan, reload);

  if (!plan) {
    return (
      <p className="px-2 pt-4 text-body text-muted" role="status">
        {error ? 'The plan could not be loaded.' : 'Loading the plan…'}
      </p>
    );
  }

  const firstOver = plan.trips.find((t) => t.state === 'over');

  return (
    <div className="flex flex-col gap-[14px] pt-4 lg:-mb-2">
      <PlanHeader plan={plan} />
      <SummaryStrip
        summary={plan.summary}
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
        <TripList trips={plan.trips} edit={edit} className="min-w-0 lg:flex-1" />
      </div>

      {edit.drawerId && (
        <OrderDrawer
          orderId={edit.drawerId}
          onClose={edit.closeDrawer}
          onAdd={(detail, tripId) => {
            edit.closeDrawer();
            void edit.place(detail.order.id, detail.order.storeName, tripId);
          }}
        />
      )}
      {edit.toast && <PlanToast toast={edit.toast} />}
    </div>
  );
}
