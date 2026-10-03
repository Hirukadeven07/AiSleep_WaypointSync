/**
 * HARD: maximum two trips per vehicle per service date.
 * Used when creating a trip, not when adding a stop to an existing one.
 */
import { MAX_TRIPS_PER_VEHICLE_PER_DAY } from '../constants';
import { Reason } from '../reasons';
import type { RuleIssue, Vehicle } from '../types';
import { vehicleName } from '../names';

export function checkTripLimit(vehicle: Vehicle, tripsAlreadyToday: number): RuleIssue[] {
  if (tripsAlreadyToday < MAX_TRIPS_PER_VEHICLE_PER_DAY) {
    return [];
  }

  return [
    {
      code: Reason.MAX_TRIPS,
      severity: 'block',
      message: `${vehicleName(vehicle)} already has ${tripsAlreadyToday} trips that day (at most ${MAX_TRIPS_PER_VEHICLE_PER_DAY}).`,
    },
  ];
}
