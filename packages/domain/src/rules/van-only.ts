/**
 * HARD: van-only outlets need a van. A van may still serve a normal dock.
 */
import { Reason } from '../reasons';
import type { RuleIssue, StopView, Vehicle } from '../types';

export function checkVanOnly(vehicle: Vehicle, candidate: StopView): RuleIssue[] {
  if (candidate.outlet.parkingConstraint !== 'van_only' || vehicle.type === 'van') {
    return [];
  }

  return [
    {
      code: Reason.VAN_ONLY,
      severity: 'block',
      message: `Outlet ${candidate.outlet.id} is van-only; vehicle ${vehicle.id} is a ${vehicle.type}.`,
    },
  ];
}
