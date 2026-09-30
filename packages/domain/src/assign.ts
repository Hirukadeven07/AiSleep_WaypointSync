/**
 * STRETCH (Day 3) — greedy auto-assign. Spine does not depend on this.
 */
import { rankVehiclesForOrder } from './fit';
import type { Lookup, Order, Outlet, StopView, TripView, Vehicle } from './types';

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
};

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
    const best = ranked.find((option) => !option.hardBlocked);

    if (!best) {
      assignments.push({ orderId: order.id, vehicleId: '', tripId: null, assigned: false });
      continue;
    }

    const stop: StopView = { order, outlet };
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
