/**
 * Read district_travel / service_allowance tables the API passes in.
 * Missing rows are a seed bug, not a planning choice.
 */
import { Reason } from './reasons';
import type { Brand, DockType, Depot, Lookup, RuleIssue, ServiceAllowance, TravelLeg } from './types';

export function findTravel(lookup: Lookup, depot: Depot, district: string): TravelLeg | undefined {
  return lookup.travel.find((row) => row.depot === depot && row.district === district);
}

export function findAllowance(
  lookup: Lookup,
  brand: Brand,
  dockType: DockType,
): ServiceAllowance | undefined {
  return lookup.allowances.find((row) => row.brand === brand && row.dockType === dockType);
}

export function missingTravelIssue(depot: Depot, district: string): RuleIssue {
  return {
    code: Reason.MISSING_TRAVEL_LEG,
    severity: 'block',
    message: `No district_travel row for ${depot} → ${district}.`,
  };
}

export function missingAllowanceIssue(brand: Brand, dockType: DockType): RuleIssue {
  return {
    code: Reason.MISSING_SERVICE_ALLOWANCE,
    severity: 'block',
    message: `No service_allowance row for ${brand} / ${dockType}.`,
  };
}
