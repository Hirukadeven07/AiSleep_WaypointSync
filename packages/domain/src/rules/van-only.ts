/**
 * HARD: van-only outlets need a van. A van may still serve a normal dock.
 */
import { Reason } from '../reasons';
import type { RuleIssue, StopView, Vehicle } from '../types';
import { outletName, vehicleName } from '../names';

export function checkVanOnly(vehicle: Vehicle, candidate: StopView): RuleIssue[] {
  if (candidate.outlet.parkingConstraint !== 'van_only' || vehicle.type === 'van') {
    return [];
  }

  return [
    {
      code: Reason.VAN_ONLY,
      severity: 'block',
      message: `${outletName(candidate.outlet)} takes vans only; ${vehicleName(vehicle)} is a ${vehicle.type}.`,
    },
  ];
}
