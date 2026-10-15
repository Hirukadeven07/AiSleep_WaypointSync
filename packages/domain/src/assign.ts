/**
 * Greedy auto-assign. An order goes only where the dispatcher could put it without any problem
 * the publish check would raise: no warning from the drop rules (other district, ambient goods on
 * a refrigerated truck, ...), within the vehicle's weight and volume, and, when departure times
 * are given, reached inside the store's delivery window. Anything else stays unassigned and is
 * moved to a later day.
 */
import { rankVehiclesForOrder, type FitOption } from './fit';
import { measureCapacity } from './rules/capacity';
import { sortStopsByWindow } from './sequence';
import { stopEtas } from './time';
import type { Brand, Lookup, Order, Outlet, StopView, TripView, Vehicle } from './types';

export type Assignment = {
  orderId: string;
  vehicleId: string;
  tripId: string | null;
  assigned: boolean;
};

export type AssignInput = {
  orders: Order[];
  outlets: Outlet[];
  vehicles: Vehicle[];
  trips: TripView[];
  tripsTakenToday: Record<string, number>;
  lookup: Lookup;
  /** Departure minute per brand (Fresh 03:30, others 08:00). Without it windows are not checked. */
  departAtMin?: Partial<Record<Brand, number>>;
};

/** True when placing `candidate` with `option` raises nothing the publish check would flag. */
function isCleanPlacement(
  option: FitOption,
  stopsBefore: StopView[],
  candidate: StopView,
  input: AssignInput,
): boolean {
  if (option.hardBlocked || option.issues.length > 0) return false;
  const after = sortStopsByWindow([...stopsBefore, candidate]);
  const capacity = measureCapacity(
    option.vehicle,
    after.map((stop) => stop.order),
  );
  if (capacity.overWeight || capacity.overVolume) return false;
  const departAt = input.departAtMin?.[candidate.outlet.brand];
  if (departAt !== undefined) {
    const etas = stopEtas(after, input.lookup, option.vehicle.depot, departAt);
    if (etas?.some((eta) => eta.atRisk)) return false;
  }
  return true;
}

function outletOf(outlets: Outlet[], order: Order): Outlet {
  const found = outlets.find((outlet) => outlet.id === order.outletId);
  if (!found) {
    throw new Error(`assign: order ${order.id} has no outlet ${order.outletId}`);
  }
  return found;
}

function sortWaiting(orders: Order[], outlets: Outlet[]): Order[] {
  return [...orders].sort((a, b) => {
    if (a.chilled !== b.chilled) {
      return a.chilled ? -1 : 1;
    }
    const outletA = outletOf(outlets, a);
    const outletB = outletOf(outlets, b);
    if (outletA.parkingConstraint !== outletB.parkingConstraint) {
      return outletA.parkingConstraint === 'van_only' ? -1 : 1;
    }
    return outletA.windowOpenMin - outletB.windowOpenMin;
  });
}

export function proposeAssignments(input: AssignInput): Assignment[] {
  const tripsTaken = { ...input.tripsTakenToday };
  const trips: TripView[] = input.trips.map((view) => ({
    ...view,
    stops: [...view.stops],
  }));
  const assignments: Assignment[] = [];

  for (const order of sortWaiting(input.orders, input.outlets)) {
    const outlet = outletOf(input.outlets, order);
    const ranked = rankVehiclesForOrder({
      order,
      outlet,
      vehicles: input.vehicles,
      trips,
      tripsTakenToday: tripsTaken,
      lookup: input.lookup,
    });
    const candidate: StopView = { order, outlet };
    const best = ranked.find((option) =>
      isCleanPlacement(
        option,
        option.tripId ? (trips.find((view) => view.trip.id === option.tripId)?.stops ?? []) : [],
        candidate,
        input,
      ),
    );

    if (!best) {
      assignments.push({ orderId: order.id, vehicleId: '', tripId: null, assigned: false });
      continue;
    }

    const stop = candidate;
    if (best.tripId) {
      const trip = trips.find((view) => view.trip.id === best.tripId);
      trip?.stops.push(stop);
    } else {
      tripsTaken[best.vehicle.id] = (tripsTaken[best.vehicle.id] ?? 0) + 1;
      trips.push({
        trip: {
          id: `proposal-${best.vehicle.id}-${tripsTaken[best.vehicle.id]}`,
          vehicleId: best.vehicle.id,
          serviceDate: order.serviceDate,
          tripNumber: tripsTaken[best.vehicle.id] === 1 ? 1 : 2,
        },
        vehicle: best.vehicle,
        stops: [stop],
      });
    }

    assignments.push({
      orderId: order.id,
      vehicleId: best.vehicle.id,
      tripId: best.tripId,
      assigned: true,
    });
  }

  return assignments;
}
