/**
 * Fuel estimate from the booklet.
 *
 * trip km     = 2 × depot-to-district km + inter-stop km × (stops − 1)
 * trip litres = trip km ÷ km per litre
 *
 * The ×2 is the return to depot. time.ts does not include that return.
 */
import { isoWeekKey } from './clock';
import { findTravel } from './lookups';
import { Reason } from './reasons';
import type { Lookup, RuleIssue, StopView, Vehicle } from './types';

export function tripKm(stopCount: number, depotToDistrictKm: number, interStopKm: number): number {
  if (stopCount === 0) {
    return 0;
  }
  return 2 * depotToDistrictKm + interStopKm * (stopCount - 1);
}

export function tripLitres(km: number, kmPerLitre: number): number {
  if (kmPerLitre <= 0) {
    return 0;
  }
  return km / kmPerLitre;
}

export function estimateTripLitres(stops: StopView[], lookup: Lookup, vehicle: Vehicle): number | null {
  if (stops.length === 0) {
    return 0;
  }
  const travel = findTravel(lookup, vehicle.depot, stops[0].outlet.district);
  if (!travel) {
    return null;
  }
  return tripLitres(tripKm(stops.length, travel.depotToDistrictKm, travel.interStopKm), vehicle.kmPerLitre);
}

export type FuelWeekStatus = {
  weekKey: string;
  plannedLitres: number;
  quotaLitres: number;
  overQuota: boolean;
};

export function fuelWeekStatus(
  serviceDate: string,
  plannedLitres: number,
  vehicle: Vehicle,
): FuelWeekStatus {
  return {
    weekKey: isoWeekKey(serviceDate),
    plannedLitres,
    quotaLitres: vehicle.weeklyFuelQuotaL,
    overQuota: plannedLitres > vehicle.weeklyFuelQuotaL,
  };
}

export function checkFuelQuota(
  serviceDate: string,
  plannedLitresThisWeek: number,
  vehicle: Vehicle,
): RuleIssue[] {
  const status = fuelWeekStatus(serviceDate, plannedLitresThisWeek, vehicle);
  if (!status.overQuota) {
    return [];
  }
  return [
    {
      code: Reason.FUEL_QUOTA,
      severity: 'warn',
      message: `Vehicle ${vehicle.id} planned ${status.plannedLitres.toFixed(1)} L in ${status.weekKey}; quota is ${status.quotaLitres} L.`,
    },
  ];
}
