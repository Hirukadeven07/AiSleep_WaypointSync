'use client';

import { useState } from 'react';
import { OrderQueue } from './OrderQueue';
import { PlanHeader, SummaryStrip } from './PlanHeader';
import { TripList } from './TripList';
import { usePlan } from './usePlan';

/** The dispatcher's plan board (Figma "Plan v2 / Default"). */
export function PlanBoard() {
  const { plan, error } = usePlan();
  const [focusTripId, setFocusTripId] = useState<string | null>(null);

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
        onView={() => firstOver && setFocusTripId(firstOver.id)}
      />
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-214px)] lg:min-h-[520px] lg:flex-row">
        <OrderQueue
          orders={plan.orders}
          moved={plan.movedToLater}
          districts={plan.districts}
          className="lg:w-[340px] lg:shrink-0"
        />
        <TripList trips={plan.trips} focusTripId={focusTripId} className="min-w-0 lg:flex-1" />
      </div>
    </div>
  );
}
