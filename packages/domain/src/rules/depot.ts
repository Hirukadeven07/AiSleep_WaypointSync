/**
 * HARD: a vehicle only serves outlets of its home depot.
 */
import { Reason } from '../reasons';
import type { RuleIssue, StopView, Vehicle } from '../types';
import { depotName, outletName, vehicleName } from '../names';

export function checkHomeDepot(vehicle: Vehicle, candidate: StopView): RuleIssue[] {
  if (candidate.outlet.depot === vehicle.depot) {
    return [];
  }

  return [
    {
      code: Reason.WRONG_DEPOT,
      severity: 'block',
      message: `${vehicleName(vehicle)} is based at ${depotName(vehicle.depot)}; ${outletName(candidate.outlet)} belongs to ${depotName(candidate.outlet.depot)}.`,
    },
  ];
}
