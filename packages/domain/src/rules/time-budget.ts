/**
 * HARD: booklet trip minutes must fit the brand budget (Fresh 270, Style/Tech 480).
 */
import { TIME_BUDGET_MIN } from '../constants';
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
  if (minutes <= budget) {
    return [];
  }

  return [
    {
      code: Reason.TIME_BUDGET,
      severity: 'block',
      message: `Trip would take ${minutes} min on ${vehicle.id}; ${brand} budget is ${budget} min.`,
    },
  ];
}
