/**
 * Rank vehicles (and an open trip, if any) for one waiting order.
 * Hard-blocked options stay in the list with reason codes for the UI.
 *
 * Legal options: fill same brand+district trip first, then tightest leftover volume, then vehicle id.
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

function scoreLegal(vehicle: Vehicle, stopsAfter: StopView[], fillingExisting: boolean): number {
  const cap = measureCapacity(
    vehicle,
    stopsAfter.map((stop) => stop.order),
  );
  const leftoverVolume = cap.volumeCapM3 - cap.usedVolumeM3;
  const existingBonus = fillingExisting ? -1_000_000 : 0;
  return existingBonus + leftoverVolume;
}

export function rankVehiclesForOrder(input: RankInput): FitOption[] {
  const candidate: StopView = { order: input.order, outlet: input.outlet };
  const options: FitOption[] = [];

  for (const vehicle of input.vehicles) {
    const openTrips = input.trips.filter(
      (view) =>
        view.vehicle.id === vehicle.id &&
        (view.stops.length === 0 ||
          (view.stops[0].outlet.brand === input.outlet.brand &&
            view.stops[0].outlet.district === input.outlet.district)),
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
      options.push({
        vehicle,
        tripId: slot.tripId,
        issues,
        hardBlocked,
        score: hardBlocked ? Number.POSITIVE_INFINITY : scoreLegal(vehicle, stopsAfter, slot.tripId !== null),
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
