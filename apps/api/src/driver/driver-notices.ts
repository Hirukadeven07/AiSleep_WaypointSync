import type { Prisma } from '@prisma/client';
import { tripDriverId } from './driver-trips';

/**
 * Tells each trip's driver that dispatch changed their stops. Written in the caller's transaction,
 * next to the plan-version bump, so the notice and the change always land together. Trips still
 * being planned are skipped: the driver hears about them when they are published.
 */
export async function tellDriversPlanChanged(
  tx: Prisma.TransactionClient,
  tripIds: string[],
): Promise<void> {
  const trips = await tx.trip.findMany({
    where: { id: { in: tripIds }, status: { not: 'planning' } },
    select: {
      tripNumber: true,
      assignedDriverId: true,
      vehicle: { select: { driverId: true, numberPlate: true, id: true } },
    },
  });
  for (const trip of trips) {
    const userId = tripDriverId(trip);
    if (!userId) continue;
    await tx.notification.create({
      data: {
        userId,
        title: `Trip ${trip.tripNumber} changed`,
        body: `Dispatch changed the stops on ${trip.vehicle.numberPlate ?? trip.vehicle.id}. Accept the new list before your next stop.`,
        link: '/drive/next',
      },
    });
  }
}
