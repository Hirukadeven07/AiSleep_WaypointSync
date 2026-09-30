/**
 * HARD: chilled orders need a reefer. Reefer may still carry ambient.
 */
import { Reason } from '../reasons';
import type { RuleIssue, StopView, Vehicle } from '../types';

export function checkChilled(vehicle: Vehicle, candidate: StopView): RuleIssue[] {
  if (!candidate.order.chilled || vehicle.temp === 'reefer') {
    return [];
  }

  return [
    {
      code: Reason.CHILLED_NEEDS_REEFER,
      severity: 'block',
      message: `Order ${candidate.order.id} is chilled; vehicle ${vehicle.id} is ambient.`,
    },
  ];
}
