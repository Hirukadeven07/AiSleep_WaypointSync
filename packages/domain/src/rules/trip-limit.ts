/**
 * HARD: maximum two trips per vehicle per service date.
 * Used when creating a trip, not when adding a stop to an existing one.
 */
import { MAX_TRIPS_PER_VEHICLE_PER_DAY } from '../constants';
import { Reason } from '../reasons';
import type { RuleIssue, Vehicle } from '../types';

export function checkTripLimit(vehicle: Vehicle, tripsAlreadyToday: number): RuleIssue[] {
  if (tripsAlreadyToday < MAX_TRIPS_PER_VEHICLE_PER_DAY) {
    return [];
  }

  return [
    {
      code: Reason.MAX_TRIPS,
      severity: 'block',
      message: `Vehicle ${vehicle.id} already has ${tripsAlreadyToday} trips today (max ${MAX_TRIPS_PER_VEHICLE_PER_DAY}).`,
    },
  ];
}
