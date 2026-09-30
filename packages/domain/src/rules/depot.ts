/**
 * HARD: a vehicle only serves outlets of its home depot.
 */
import { Reason } from '../reasons';
import type { RuleIssue, StopView, Vehicle } from '../types';

export function checkHomeDepot(vehicle: Vehicle, candidate: StopView): RuleIssue[] {
  if (candidate.outlet.depot === vehicle.depot) {
    return [];
  }

  return [
    {
      code: Reason.WRONG_DEPOT,
      severity: 'block',
      message: `Vehicle ${vehicle.id} is based at ${vehicle.depot}; outlet ${candidate.outlet.id} belongs to ${candidate.outlet.depot}.`,
    },
  ];
}
