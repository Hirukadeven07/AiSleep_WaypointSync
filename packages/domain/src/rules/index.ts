/**
 * Hard-rule gate for drag-and-drop (Methuli) and Nest trips.service.
 * Capacity is not in here — overload is a warning on the board and a publish block.
 */
import { findAllowance, findTravel, missingAllowanceIssue, missingTravelIssue } from '../lookups';
import type { Lookup, RuleIssue, StopView, Vehicle } from '../types';
import { checkBrandDistrict } from './brand-district';
import { checkChilled } from './chilled';
import { checkHomeDepot } from './depot';
import { checkTimeBudget } from './time-budget';
import { checkTripLimit } from './trip-limit';
import { checkVanOnly } from './van-only';

export type DropInput = {
  vehicle: Vehicle;
  currentStops: StopView[];
  candidate: StopView;
  lookup: Lookup;
};

function lookupIssues(input: DropInput): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const district = input.currentStops[0]?.outlet.district ?? input.candidate.outlet.district;
  if (!findTravel(input.lookup, input.vehicle.depot, district)) {
    issues.push(missingTravelIssue(input.vehicle.depot, district));
  }
  for (const stop of [...input.currentStops, input.candidate]) {
    if (!findAllowance(input.lookup, stop.outlet.brand, stop.outlet.dockType)) {
      issues.push(missingAllowanceIssue(stop.outlet.brand, stop.outlet.dockType));
    }
  }
  return issues;
}

export function evaluateDrop(input: DropInput): RuleIssue[] {
  return [
    ...lookupIssues(input),
    ...checkHomeDepot(input.vehicle, input.candidate),
    ...checkVanOnly(input.vehicle, input.candidate),
    ...checkChilled(input.vehicle, input.candidate),
    ...checkBrandDistrict(input.currentStops, input.candidate),
    ...checkTimeBudget(input.vehicle, input.currentStops, input.candidate, input.lookup),
  ];
}

export function canAddStop(input: DropInput): boolean {
  return evaluateDrop(input).every((issue) => issue.severity !== 'block');
}

export function evaluateNewTrip(vehicle: Vehicle, tripsAlreadyToday: number): RuleIssue[] {
  return checkTripLimit(vehicle, tripsAlreadyToday);
}

export { checkBrandDistrict } from './brand-district';
export { checkChilled } from './chilled';
export { checkHomeDepot } from './depot';
export { checkVanOnly } from './van-only';
export { checkTripLimit } from './trip-limit';
export { checkTimeBudget } from './time-budget';
export { capacityIssues, measureCapacity } from './capacity';
