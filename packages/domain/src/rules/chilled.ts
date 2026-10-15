/**
 * Chilled orders need a reefer (block). Ambient cargo on a reefer is allowed
 * with a light warning.
 */
import { Reason } from '../reasons';
import type { RuleIssue, StopView, Vehicle } from '../types';
import { outletName, vehicleName } from '../names';

export function checkChilled(vehicle: Vehicle, candidate: StopView): RuleIssue[] {
  if (candidate.order.chilled && vehicle.temp !== 'reefer') {
    return [
      {
        code: Reason.CHILLED_NEEDS_REEFER,
        severity: 'block',
        message: `${outletName(candidate.outlet)}'s order is chilled; ${vehicleName(vehicle)} is not refrigerated.`,
      },
    ];
  }

  if (!candidate.order.chilled && vehicle.temp === 'reefer') {
    return [
      {
        code: Reason.AMBIENT_ON_REEFER,
        severity: 'warn',
        message: `${outletName(candidate.outlet)}'s order is not chilled; ${vehicleName(vehicle)} is a refrigerated truck.`,
      },
    ];
  }

  return [];
}
