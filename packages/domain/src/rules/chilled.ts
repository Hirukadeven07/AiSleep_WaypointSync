/**
 * Chilled orders need a reefer (block). Ambient cargo on a reefer is allowed
 * with a light warning.
 */
import { Reason } from '../reasons';
import type { RuleIssue, StopView, Vehicle } from '../types';

export function checkChilled(vehicle: Vehicle, candidate: StopView): RuleIssue[] {
  if (candidate.order.chilled && vehicle.temp !== 'reefer') {
    return [
      {
        code: Reason.CHILLED_NEEDS_REEFER,
        severity: 'block',
        message: `Order ${candidate.order.id} is chilled; vehicle ${vehicle.id} is ambient.`,
      },
    ];
  }

  if (!candidate.order.chilled && vehicle.temp === 'reefer') {
    return [
      {
        code: Reason.AMBIENT_ON_REEFER,
        severity: 'warn',
        message: `Order ${candidate.order.id} is ambient; vehicle ${vehicle.id} is a reefer.`,
      },
    ];
  }

  return [];
}
