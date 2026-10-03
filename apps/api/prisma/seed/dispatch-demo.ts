/**
 * Demo data for the live day's breakdown recovery (Sehara).
 * One truck on the road with four stops (the first one delivered): the dispatcher marks it
 * "Truck broke down", defers one store and sends the rest on a free truck. Every store has an
 * outlet-manager login (login = outlet id, password waypoint), so the deferred store can show its notice.
 * Kasun's trip from the dock/store demo stays as it is, for the "not synced" moment.
 * Idempotent: does nothing if today's demo trip already exists.
 */
import type { Brand, PrismaClient, Store } from '@prisma/client';
import { buildLines } from '../../src/store/catalogue';

const DEPOT = 'depo1';
const TAG = 'DEMO-DISPATCH-BREAKDOWN';

function clockNow(): Date {
  const demo = process.env.DEMO_NOW ? new Date(process.env.DEMO_NOW) : new Date();
  return Number.isNaN(demo.getTime()) ? new Date() : demo;
}

function colombo(now: Date) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { date, minutes: h * 60 + m };
}

const PICKS: Record<Brand, { catalogueId: string; qty: number }[]> = {
  Fresh: [
    { catalogueId: 'F-MILK', qty: 4 },
    { catalogueId: 'F-BREAD', qty: 3 },
  ],
  Style: [{ catalogueId: 'S-SHIRT', qty: 3 }],
  Tech: [{ catalogueId: 'T-ACC', qty: 2 }],
};

export async function seedDispatchDemo(prisma: PrismaClient) {
  const now = clockNow();
  const { date, minutes } = colombo(now);
  const day = new Date(`${date}T00:00:00Z`);
  if (await prisma.trip.count({ where: { csvRouteId: TAG, serviceDate: day } })) {
    console.log('[seed] dispatch demo: already there for today - skipping');
    return;
  }

  // Trucks with no trip today, refrigerated first (Fresh goods are chilled).
  const vehicles = await prisma.vehicle.findMany({
    where: { depotId: DEPOT, status: 'available', trips: { none: { serviceDate: day } } },
    orderBy: { id: 'asc' },
  });
  const sorted = [
    ...vehicles.filter((v) => v.temp === 'reefer'),
    ...vehicles.filter((v) => v.temp !== 'reefer'),
  ];
  if (sorted.length < 2) {
    console.warn(
      '[seed] dispatch demo skipped: needs 2 free trucks (one to break down, one to rescue)',
    );
    return;
  }

  // Four stores of one brand and district with no order today (one brand, one district per trip).
  const busy = await prisma.order.findMany({
    where: { deliveryDate: day },
    select: { storeId: true },
  });
  const stores = await prisma.store.findMany({
    where: { depotId: DEPOT, id: { notIn: busy.map((o) => o.storeId) } },
    orderBy: [{ windowOpenMin: 'asc' }, { id: 'asc' }],
  });
  const groups = new Map<string, Store[]>();
  for (const s of stores) {
    const key = `${s.brand}|${s.districtId}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const pick = ([...groups.values()].sort((a, b) => b.length - a.length)[0] ?? []).slice(0, 4);
  if (pick.length < 3) {
    console.warn('[seed] dispatch demo skipped: no brand and district with 3 free stores');
    return;
  }

  const truck = sorted[0]!;
  const departed = new Date(now.getTime() - 25 * 60_000);
  const trip = await prisma.trip.create({
    data: {
      vehicleId: truck.id,
      depotId: DEPOT,
      brand: pick[0]!.brand,
      districtId: pick[0]!.districtId,
      serviceDate: day,
      tripNumber: 1,
      csvRouteId: TAG,
      status: 'on_road',
      planVersion: 1,
      publishedAt: departed,
      startingTime: departed,
    },
  });

  for (const [i, store] of pick.entries()) {
    const built = buildLines(store.brand, PICKS[store.brand]);
    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        brand: store.brand,
        deliveryDate: day,
        temp: built.chilled ? 'chilled' : 'ambient',
        status: i === 0 ? 'delivered' : 'planned',
        units: built.units,
        weightKg: built.weightKg,
        volumeM3: built.volumeM3,
        lines: { create: built.lines },
      },
    });
    const done = i === 0;
    await prisma.tripStop.create({
      data: {
        tripId: trip.id,
        orderId: order.id,
        sequence: i + 1,
        status: done ? 'confirmed' : 'upcoming',
        // On plan: the first stop was done a few minutes ago, the rest follow every 25 min.
        etaMin: done ? minutes - 8 : minutes + 15 + (i - 1) * 25,
        arrivedAt: done ? new Date(now.getTime() - 8 * 60_000) : null,
        storeConfirmedAt: done ? new Date(now.getTime() - 4 * 60_000) : null,
      },
    });
  }

  console.log(
    `[seed] dispatch demo: ${truck.numberPlate ?? truck.id} on the road with ${pick.length} stops ` +
      `(store logins: ${pick
        .slice(1)
        .map((s) => s.id)
        .join(', ')}; password waypoint), ${sorted.length - 1} truck(s) free to rescue`,
  );
}
