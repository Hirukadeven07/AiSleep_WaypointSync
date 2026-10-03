import type { Prisma, PrismaClient } from '@prisma/client';
import { WAIT_ALERT_MIN } from '@waypoint/contracts';
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

/**
 * Alerts the depot's dispatchers, once per stop, that a driver has waited WAIT_ALERT_MIN minutes at
 * a store that has not checked the goods. Called whenever the driver's phone or the dispatch board
 * reads the day, so the alert goes out even when nobody has the board open. Claiming the stop
 * with `waitAlertedAt` first keeps it to one alert when both ask at once.
 */
export async function alertLongWaits(
  db: PrismaClient | Prisma.TransactionClient,
  now: Date,
  tripIds: string[],
): Promise<void> {
  if (tripIds.length === 0) return;
  const since = new Date(now.getTime() - WAIT_ALERT_MIN * 60_000);
  const stops = await db.tripStop.findMany({
    where: {
      tripId: { in: tripIds },
      status: { in: ['arrived', 'waiting'] },
      storeConfirmedAt: null,
      waitAlertedAt: null,
      arrivedAt: { lte: since },
    },
    select: {
      id: true,
      arrivedAt: true,
      order: { select: { store: { select: { id: true, displayName: true } } } },
      trip: {
        select: {
          depotId: true,
          tripNumber: true,
          assignedDriver: { select: { name: true } },
          vehicle: {
            select: { id: true, numberPlate: true, driver: { select: { name: true } } },
          },
        },
      },
    },
  });
  for (const stop of stops) {
    const claimed = await db.tripStop.updateMany({
      where: { id: stop.id, waitAlertedAt: null },
      data: { waitAlertedAt: now },
    });
    if (claimed.count === 0) continue;
    const { trip } = stop;
    const driver = (trip.assignedDriver ?? trip.vehicle.driver)?.name ?? 'The driver';
    const store = stop.order.store.displayName ?? stop.order.store.id;
    const waited = Math.floor((now.getTime() - stop.arrivedAt!.getTime()) / 60_000);
    const dispatchers = await db.user.findMany({
      where: { role: 'dispatcher', depotId: trip.depotId },
      select: { id: true },
    });
    for (const d of dispatchers) {
      await db.notification.create({
        data: {
          userId: d.id,
          title: `Waiting ${waited} min at ${store}`,
          body: `${driver} (${trip.vehicle.numberPlate ?? trip.vehicle.id} · Trip ${trip.tripNumber}) is waiting and the store has not checked the goods. The driver was asked to call the store.`,
          link: '/dispatch',
        },
      });
    }
  }
}
