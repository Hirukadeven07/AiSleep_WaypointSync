/**
 * Booklet trip minutes vs the brand budget (Fresh 270, Style/Tech 480).
 * Over by 1–5 minutes warns. Over by more than 5 blocks.
 */
import { TIME_BUDGET_GRACE_MIN, TIME_BUDGET_MIN } from '../constants';
import { Reason } from '../reasons';
import { computeTripMinutes } from '../time';
import type { Lookup, RuleIssue, StopView, Vehicle } from '../types';

export function checkTimeBudget(
  vehicle: Vehicle,
  currentStops: StopView[],
  candidate: StopView,
  lookup: Lookup,
): RuleIssue[] {
  const proposed = [...currentStops, candidate];
  const minutes = computeTripMinutes(proposed, lookup, vehicle.depot);
  if (minutes === null) {
    return [];
  }

  const brand = proposed[0]?.outlet.brand;
  if (!brand) {
    return [];
  }

  const budget = TIME_BUDGET_MIN[brand];
  const overBy = minutes - budget;
  if (overBy <= 0) {
    return [];
  }

  return [
    {
      code: Reason.TIME_BUDGET,
      severity: overBy <= TIME_BUDGET_GRACE_MIN ? 'warn' : 'block',
      message: `Trip would take ${minutes} min on ${vehicle.id}; ${brand} budget is ${budget} min.`,
    },
  ];
}
