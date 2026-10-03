import type { Prisma } from '@prisma/client';

/**
 * Who drives a trip: the driver the dispatcher assigned (`Trip.assignedDriverId`), else the driver
 * registered to the trip's vehicle (`Vehicle.driverId`). The driver screen, sync and notices all
 * use this one rule, so a trip assigned to someone else's vehicle still reaches its driver.
 */
export function ownTripWhere(driverId: string): Prisma.TripWhereInput {
  return {
    OR: [{ assignedDriverId: driverId }, { assignedDriverId: null, vehicle: { driverId } }],
  };
}

/** The user id of the trip's driver, by the same rule as `ownTripWhere`. */
export function tripDriverId(trip: {
  assignedDriverId: string | null;
  vehicle: { driverId: string | null };
}): string | null {
  return trip.assignedDriverId ?? trip.vehicle.driverId;
}
