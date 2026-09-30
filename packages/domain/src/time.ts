/**
 * Booklet page 20 — trip time and per-stop ETAs.
 *
 * Primitive `tripMinutes` (already on main):
 *   outbound + inter-stop × (stops − 1) + sum(allowances)
 *
 * Tests on main already pin Gampaha 101 and Colombo 112 against that primitive.
 * `computeTripMinutes` looks up CSV rows and then calls it.
 *
 * Fuel uses a ROUND trip (×2 depot km). Time does NOT add the return to depot.
 */
import { formatMinutes } from './clock';
import { findAllowance, findTravel } from './lookups';
import { Reason } from './reasons';
import type { Depot, Lookup, Outlet, RuleIssue, StopView } from './types';

export function tripMinutes({
  outboundMin,
  interStopMin,
  allowancesMin,
}: {
  outboundMin: number;
  interStopMin: number;
  allowancesMin: number[];
}): number {
  const service = allowancesMin.reduce((sum, m) => sum + m, 0);
  return outboundMin + interStopMin * Math.max(allowancesMin.length - 1, 0) + service;
}

/** Total minutes from joined stops, or null if travel/allowance rows are missing. */
export function computeTripMinutes(stops: StopView[], lookup: Lookup, depot: Depot): number | null {
  if (stops.length === 0) {
    return 0;
  }

  const district = stops[0].outlet.district;
  const travel = findTravel(lookup, depot, district);
  if (!travel) {
    return null;
  }

  const allowancesMin: number[] = [];
  for (const stop of stops) {
    const row = findAllowance(lookup, stop.outlet.brand, stop.outlet.dockType);
    if (!row) {
      return null;
    }
    allowancesMin.push(row.minutes);
  }

  return tripMinutes({
    outboundMin: travel.depotToDistrictFreeflowMin,
    interStopMin: travel.interStopFreeflowMin,
    allowancesMin,
  });
}

export type StopEta = {
  orderId: string;
  outletId: string;
  arriveMin: number;
  arriveClock: string;
  serviceStartMin: number;
  leaveMin: number;
  atRisk: boolean;
};

function allowanceMin(lookup: Lookup, outlet: Outlet): number | null {
  return findAllowance(lookup, outlet.brand, outlet.dockType)?.minutes ?? null;
}

/**
 * Sequential ETAs from a depot departure time (minutes since midnight).
 * Waiting until window-open is modelled here so "late" is honest.
 * Time-budget still uses computeTripMinutes (no waiting).
 */
export function stopEtas(
  stops: StopView[],
  lookup: Lookup,
  depot: Depot,
  departAtMin: number,
): StopEta[] | null {
  if (stops.length === 0) {
    return [];
  }

  const district = stops[0].outlet.district;
  const travel = findTravel(lookup, depot, district);
  if (!travel) {
    return null;
  }

  const result: StopEta[] = [];
  let previousLeave: number | null = null;

  for (const [index, stop] of stops.entries()) {
    const service = allowanceMin(lookup, stop.outlet);
    if (service === null) {
      return null;
    }

    const travelMin = index === 0 ? travel.depotToDistrictFreeflowMin : travel.interStopFreeflowMin;
    const arriveMin = (previousLeave ?? departAtMin) + travelMin;
    const serviceStartMin = Math.max(arriveMin, stop.outlet.windowOpenMin);
    const leaveMin = serviceStartMin + service;

    result.push({
      orderId: stop.order.id,
      outletId: stop.outlet.id,
      arriveMin,
      arriveClock: formatMinutes(arriveMin),
      serviceStartMin,
      leaveMin,
      atRisk: arriveMin > stop.outlet.windowCloseMin,
    });

    previousLeave = leaveMin;
  }

  return result;
}

export function windowRiskIssues(etas: StopEta[]): RuleIssue[] {
  return etas
    .filter((eta) => eta.atRisk)
    .map((eta) => ({
      code: Reason.WINDOW_AT_RISK,
      severity: 'warn',
      message: `Stop ${eta.outletId} ETA ${eta.arriveClock} is after the delivery window.`,
    }));
}
