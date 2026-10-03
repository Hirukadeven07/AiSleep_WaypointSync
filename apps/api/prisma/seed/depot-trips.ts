/**
 * One extra trip per depot for each trip status, plus a refresh of
 * Store.daysSinceLastServed from the latest served trip.
 */
import type { PrismaClient, TripStatus } from '@prisma/client';
import { buildLines } from '../../src/store/catalogue';

const STATUSES: TripStatus[] = [
  'planning',
  'published',
  'loading',
  'ready',
  'on_road',
  'completed',
  'breakdown',
];

const ACTIVE: TripStatus[] = ['loading', 'ready', 'on_road', 'breakdown'];

const PICKS = {
  Fresh: [
    { catalogueId: 'F-RICE', qty: 1 },
    { catalogueId: 'F-BREAD', qty: 1 },
  ],
  Style: [{ catalogueId: 'S-SHIRT', qty: 1 }],
  Tech: [{ catalogueId: 'T-ACC', qty: 1 }],
} as const;

function colomboDay(offsetDays: number): Date {
  const now = process.env.DEMO_NOW ? new Date(process.env.DEMO_NOW) : new Date();
  const base = Number.isNaN(now.getTime()) ? new Date() : now;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day;
}

async function slotFor(
  prisma: PrismaClient,
  depotId: string,
  serviceDate: Date,
  active: boolean,
) {
  const vehicles = await prisma.vehicle.findMany({
    where: { depotId, ...(active ? { status: { not: 'out_of_service' } } : {}) },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  for (const vehicle of vehicles) {
    if (active) {
      const busy = await prisma.trip.count({
        where: { vehicleId: vehicle.id, status: { in: ACTIVE } },
      });
      if (busy > 0) continue;
    }
    const taken = await prisma.trip.findMany({
      where: { vehicleId: vehicle.id, serviceDate },
      select: { tripNumber: true },
    });
    const nums = new Set(taken.map((t) => t.tripNumber));
    if (!nums.has(1)) return { vehicleId: vehicle.id, tripNumber: 1 as const };
    if (!nums.has(2)) return { vehicleId: vehicle.id, tripNumber: 2 as const };
  }
  return null;
}

/** Recompute each outlet from the latest trip that actually served it. */
export async function refreshDaysSinceLastServed(prisma: PrismaClient) {
  const updated = await prisma.$executeRaw`
    UPDATE "Store" AS s
    SET "daysSinceLastServed" = src.days
    FROM (
      SELECT o."storeId" AS id,
             ((timezone('Asia/Colombo', now()))::date - MAX(t."serviceDate"))::int AS days
      FROM "TripStop" ts
      JOIN "Trip" t ON t.id = ts."tripId"
      JOIN "Order" o ON o.id = ts."orderId"
      WHERE t.status = 'completed'
         OR ts.status IN ('delivered', 'confirmed', 'partial')
      GROUP BY o."storeId"
    ) AS src
    WHERE s.id = src.id
      AND src.days >= 0
  `;
  console.log(`[seed] days since last served set on ${updated} outlets from their trips`);
}

export async function seedDepotTrips(prisma: PrismaClient) {
  const today = colomboDay(0);
  const yesterday = colomboDay(-1);
  const depots = await prisma.depot.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  let added = 0;

  for (const depot of depots) {
    const stores = await prisma.store.findMany({
      where: { depotId: depot.id },
      orderBy: { id: 'asc' },
    });
    if (stores.length === 0) {
      console.warn(`[seed] ${depot.id}: no stores, skipping status trips`);
      continue;
    }
    let cursor = 0;
    for (const status of STATUSES) {
      const tag = `DEMO-STATUS-${depot.id}-${status}`;
      if (await prisma.trip.findFirst({ where: { csvRouteId: tag }, select: { id: true } })) continue;

      const serviceDate = status === 'completed' ? yesterday : today;
      const slot = await slotFor(prisma, depot.id, serviceDate, ACTIVE.includes(status));
      if (!slot) {
        console.warn(`[seed] ${depot.id}: no free vehicle for a ${status} trip`);
        continue;
      }
      const store = stores[cursor % stores.length]!;
      cursor += 1;
      const built = buildLines(store.brand, [...PICKS[store.brand]]);
      const done = status === 'completed';
      const when = done ? new Date(yesterday.getTime() + 2 * 60 * 60_000) : new Date();
      const order = await prisma.order.create({
        select: { id: true },
        data: {
          storeId: store.id,
          brand: store.brand,
          deliveryDate: serviceDate,
          temp: built.chilled ? 'chilled' : 'ambient',
          status: done ? 'delivered' : 'planned',
          units: built.units,
          weightKg: built.weightKg,
          volumeM3: built.volumeM3,
          lines: { create: built.lines },
        },
      });
      const trip = await prisma.trip.create({
        select: { id: true },
        data: {
          vehicleId: slot.vehicleId,
          depotId: depot.id,
          brand: store.brand,
          districtId: store.districtId,
          serviceDate,
          tripNumber: slot.tripNumber,
          csvRouteId: tag,
          status,
          planVersion: 1,
          publishedAt: status === 'planning' ? null : when,
          startingTime: done || status === 'on_road' || status === 'breakdown' ? when : null,
          endingTime: done ? new Date(when.getTime() + 3 * 60 * 60_000) : null,
        },
      });
      await prisma.tripStop.create({
        data: {
          tripId: trip.id,
          orderId: order.id,
          sequence: 1,
          status: done ? 'delivered' : status === 'breakdown' ? 'at_risk' : 'upcoming',
          etaMin: store.windowOpenMin,
          arrivedAt: done ? when : null,
          storeConfirmedAt: done ? when : null,
        },
      });
      added += 1;
    }
  }

  console.log(`[seed] ${added} status trips added`);
  await refreshDaysSinceLastServed(prisma);
}
