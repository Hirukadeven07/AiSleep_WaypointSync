/**
 * Demo data for the loader dock and store screens, until the spine fixtures land.
 *  - Trip A: published Fresh trip with 3 stops, for the loader queue and LIFO checklist.
 *  - Trip B: on the road, with sunil's store stop arrived, for the store receipt.
 *  - A deferred order for sunil's store, with its notice.
 *  - Trip C: completed yesterday at a store outside trips A and B, so the team ERD seed has a
 *    delivered stop for its sample receipt, load flag and driver events.
 * Idempotent: does nothing if today's demo trips already exist.
 */
import type { Brand, PrismaClient, Store } from '@prisma/client';
import { buildLines } from '../../src/store/catalogue';
import { seedCatalogue } from './team-erd';

const DEPOT = 'depo1';

function colomboDate(offsetDays = 0): string {
  const now = process.env.DEMO_NOW ? new Date(process.env.DEMO_NOW) : new Date();
  const base = Number.isNaN(now.getTime()) ? new Date() : now;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

const PICKS: Record<Brand, { catalogueId: string; qty: number }[][]> = {
  Fresh: [
    [
      { catalogueId: 'F-MILK', qty: 6 },
      { catalogueId: 'F-BREAD', qty: 4 },
      { catalogueId: 'F-VEG', qty: 3 },
    ],
    [
      { catalogueId: 'F-YOG', qty: 5 },
      { catalogueId: 'F-RICE', qty: 4 },
    ],
    [
      { catalogueId: 'F-CHKN', qty: 2 },
      { catalogueId: 'F-MILK', qty: 4 },
      { catalogueId: 'F-BREAD', qty: 2 },
    ],
  ],
  Style: [
    [
      { catalogueId: 'S-SHIRT', qty: 4 },
      { catalogueId: 'S-DENIM', qty: 3 },
    ],
  ],
  Tech: [
    [
      { catalogueId: 'T-PHONE', qty: 3 },
      { catalogueId: 'T-ACC', qty: 2 },
    ],
  ],
};

async function createOrder(
  prisma: PrismaClient,
  store: Store,
  deliveryDate: string,
  picksIndex: number,
  extra: {
    status?: 'waiting' | 'planned' | 'deferred';
    deferReason?: string;
    movedFromDate?: string;
  } = {},
) {
  const sets = PICKS[store.brand];
  const built = buildLines(store.brand, sets[picksIndex % sets.length]!);
  return prisma.order.create({
    data: {
      storeId: store.id,
      brand: store.brand,
      deliveryDate: asDate(deliveryDate),
      temp: built.chilled ? 'chilled' : 'ambient',
      status: extra.status ?? 'planned',
      units: built.units,
      weightKg: built.weightKg,
      volumeM3: built.volumeM3,
      deferReason: extra.deferReason ?? null,
      movedFromDate: extra.movedFromDate ? asDate(extra.movedFromDate) : null,
      lines: { create: built.lines },
    },
  });
}

/** "Sun 4 Oct" for a YYYY-MM-DD day, as the store's other notices read. */
const dayName = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

export async function seedDockStoreDemo(prisma: PrismaClient) {
  // Order lines carry itemId, so the Item rows must exist before any demo order.
  await seedCatalogue(prisma);
  const today = colomboDate();
  const tomorrow = colomboDate(1);

  const sunil = await prisma.user.findUnique({
    where: { loginId: 'sunil' },
    include: { store: true },
  });
  const kasun = await prisma.user.findUnique({ where: { loginId: 'kasun' } });
  const homeStore = sunil?.store;
  if (!homeStore) {
    console.warn('[seed] dock-store demo skipped: sunil has no store (are the CSVs in data/?)');
    return;
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { depotId: DEPOT, status: 'available' },
    orderBy: [{ temp: 'desc' }, { id: 'asc' }], // reefer first
  });
  if (vehicles.length === 0) {
    console.warn('[seed] dock-store demo skipped: no Peliyagoda vehicles');
    return;
  }
  const existing = await prisma.trip.count({
    where: { depotId: DEPOT, serviceDate: asDate(today) },
  });
  if (existing > 0) {
    console.log('[seed] dock-store demo: trips for today already exist - skipping');
    return;
  }

  // Trip A: three other stores of the same brand, preferring one district (one brand, one district rule).
  const candidates = await prisma.store.findMany({
    where: { depotId: DEPOT, brand: homeStore.brand, id: { not: homeStore.id } },
    orderBy: [{ windowOpenMin: 'asc' }, { id: 'asc' }],
  });
  const byDistrict = new Map<string, Store[]>();
  for (const s of candidates)
    byDistrict.set(s.districtId, [...(byDistrict.get(s.districtId) ?? []), s]);
  const tripAStores = ([...byDistrict.values()].sort((a, b) => b.length - a.length)[0] ?? []).slice(
    0,
    3,
  );

  const vehicleA = vehicles[0]!;
  const vehicleB = vehicles[1] ?? vehicles[0]!;
  const tripNumberB = vehicleB.id === vehicleA.id ? 2 : 1;

  if (tripAStores.length > 0) {
    const tripA = await prisma.trip.create({
      data: {
        vehicleId: vehicleA.id,
        depotId: DEPOT,
        brand: homeStore.brand,
        districtId: tripAStores[0]!.districtId,
        serviceDate: asDate(today),
        tripNumber: 1,
        status: 'published',
        planVersion: 1,
        publishedAt: new Date(),
      },
    });
    for (const [i, store] of tripAStores.entries()) {
      const order = await createOrder(prisma, store, today, i);
      await prisma.tripStop.create({
        data: {
          tripId: tripA.id,
          orderId: order.id,
          sequence: i + 1,
          etaMin: store.windowOpenMin + i * 25,
        },
      });
    }
    console.log(
      `[seed] dock-store demo: published trip ${tripA.id} with ${tripAStores.length} stops`,
    );
  }

  // Trip B: on the road, the driver has arrived at sunil's store.
  if (kasun && !vehicleB.driverId) {
    await prisma.vehicle.update({ where: { id: vehicleB.id }, data: { driverId: kasun.id } });
  }
  const tripB = await prisma.trip.create({
    data: {
      vehicleId: vehicleB.id,
      depotId: DEPOT,
      brand: homeStore.brand,
      districtId: homeStore.districtId,
      serviceDate: asDate(today),
      tripNumber: tripNumberB,
      status: 'on_road',
      planVersion: 1,
      publishedAt: new Date(),
    },
  });
  const homeOrder = await createOrder(prisma, homeStore, today, 2);
  await prisma.tripStop.create({
    data: {
      tripId: tripB.id,
      orderId: homeOrder.id,
      sequence: 1,
      status: 'arrived',
      etaMin: homeStore.windowOpenMin,
      arrivedAt: new Date(),
    },
  });
  await prisma.loadSession.create({
    data: {
      tripId: tripB.id,
      loaderIds: [],
      startedAt: new Date(),
      departedAt: new Date(),
      ackedPlanVersion: 1,
    },
  });

  // Trip C: completed yesterday, one delivered stop at a store outside trips A and B.
  const doneStore = candidates.find((s) => !tripAStores.some((a) => a.id === s.id));
  if (doneStore) {
    const yesterday = colomboDate(-1);
    // Window opening yesterday, Colombo time (UTC+05:30).
    const deliveredAt = new Date(
      asDate(yesterday).getTime() + (doneStore.windowOpenMin - 330) * 60_000,
    );
    const tripC = await prisma.trip.create({
      data: {
        vehicleId: vehicleB.id,
        assignedDriverId: kasun?.id ?? null,
        depotId: DEPOT,
        brand: doneStore.brand,
        districtId: doneStore.districtId,
        serviceDate: asDate(yesterday),
        tripNumber: 1,
        status: 'completed',
        planVersion: 1,
        publishedAt: new Date(deliveredAt.getTime() - 4 * 60 * 60_000),
        startingTime: new Date(deliveredAt.getTime() - 60 * 60_000),
        endingTime: new Date(deliveredAt.getTime() + 60 * 60_000),
      },
    });
    const doneOrder = await createOrder(prisma, doneStore, yesterday, 0);
    await prisma.order.update({ where: { id: doneOrder.id }, data: { status: 'delivered' } });
    await prisma.tripStop.create({
      data: {
        tripId: tripC.id,
        orderId: doneOrder.id,
        sequence: 1,
        status: 'delivered',
        etaMin: doneStore.windowOpenMin,
        arrivedAt: deliveredAt,
        storeConfirmedAt: deliveredAt,
      },
    });
  }

  // A deferred order with its notice.
  const reason = 'Fleet over capacity at Peliyagoda today';
  await createOrder(prisma, homeStore, tomorrow, 1, {
    status: 'deferred',
    deferReason: reason,
    movedFromDate: today,
  });
  if (sunil) {
    await prisma.notification.create({
      data: {
        userId: sunil.id,
        title: 'Delivery moved to tomorrow',
        body: `One order was moved from ${dayName(today)} to ${dayName(tomorrow)}. Reason: ${reason}.`,
        link: '/store/updates',
      },
    });
  }
  console.log('[seed] dock-store demo: arrived stop and deferral ready for sunil');
}
