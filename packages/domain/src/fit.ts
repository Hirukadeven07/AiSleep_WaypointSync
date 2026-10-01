/**
 * Rank vehicles (and an open trip, if any) for one waiting order.
 * Hard-blocked options stay in the list with reason codes for the UI.
 *
 * Legal options: fill a same-brand, same-district trip first, then tightest leftover volume, then vehicle id.
 * A same-brand trip in another district stays in the list with a warning.
 */
import { measureCapacity } from './rules/capacity';
import { evaluateDrop, evaluateNewTrip } from './rules/index';
import type { Lookup, Order, Outlet, RuleIssue, StopView, TripView, Vehicle } from './types';

export type FitOption = {
  vehicle: Vehicle;
  tripId: string | null;
  issues: RuleIssue[];
  hardBlocked: boolean;
  score: number;
};

export type RankInput = {
  order: Order;
  outlet: Outlet;
  vehicles: Vehicle[];
  trips: TripView[];
  tripsTakenToday: Record<string, number>;
  lookup: Lookup;
};

function scoreLegal(vehicle: Vehicle, stopsAfter: StopView[], fillingSameDistrict: boolean): number {
  const cap = measureCapacity(
    vehicle,
    stopsAfter.map((stop) => stop.order),
  );
  const leftoverVolume = cap.volumeCapM3 - cap.usedVolumeM3;
  const existingBonus = fillingSameDistrict ? -1_000_000 : 0;
  return existingBonus + leftoverVolume;
}

export function rankVehiclesForOrder(input: RankInput): FitOption[] {
  const candidate: StopView = { order: input.order, outlet: input.outlet };
  const options: FitOption[] = [];

  for (const vehicle of input.vehicles) {
    const openTrips = input.trips.filter(
      (view) =>
        view.vehicle.id === vehicle.id &&
        (view.stops.length === 0 || view.stops[0].outlet.brand === input.outlet.brand),
    );

    const consider: Array<{ tripId: string | null; currentStops: StopView[] }> =
      openTrips.length > 0
        ? openTrips.map((view) => ({ tripId: view.trip.id, currentStops: view.stops }))
        : [{ tripId: null, currentStops: [] }];

    for (const slot of consider) {
      const newTripIssues = slot.tripId ? [] : evaluateNewTrip(vehicle, input.tripsTakenToday[vehicle.id] ?? 0);
      const dropIssues = evaluateDrop({
        vehicle,
        currentStops: slot.currentStops,
        candidate,
        lookup: input.lookup,
      });
      const issues = [...newTripIssues, ...dropIssues];
      const hardBlocked = issues.some((issue) => issue.severity === 'block');
      const stopsAfter = [...slot.currentStops, candidate];
      const fillingSameDistrict =
        slot.currentStops.length > 0 && slot.currentStops[0].outlet.district === candidate.outlet.district;
      options.push({
        vehicle,
        tripId: slot.tripId,
        issues,
        hardBlocked,
        score: hardBlocked ? Number.POSITIVE_INFINITY : scoreLegal(vehicle, stopsAfter, fillingSameDistrict),
      });
    }
  }

  return options.sort((a, b) => {
    if (a.hardBlocked !== b.hardBlocked) {
      return a.hardBlocked ? 1 : -1;
    }
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return a.vehicle.id.localeCompare(b.vehicle.id);
  });
}
