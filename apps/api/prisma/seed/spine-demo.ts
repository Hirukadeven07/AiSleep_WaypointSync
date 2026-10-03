/**
 * Tomorrow's demo day at depo1 (Peliyagoda) for spine steps 1 to 5. The plan board shows tomorrow,
 * so every row here is dated tomorrow (Asia/Colombo, DEMO_NOW aware):
 * - chilled orders past the refrigerated trucks' space, so the day is overbooked on chilled and
 *   auto-assign moves some to a later day;
 * - a draft trip over volume on a reefer, with a free reefer to move a stop to;
 * - ambient Style / Tech orders an ambient truck can take, and a van-only store's order;
 * - a store already moved once, so deferring it again is a repeat skip.
 * Every run refreshes it: the previous demo day's unsent rows are removed and made again for the
 * new tomorrow. Orders use the `spine-` id prefix; the draft trip uses csvRouteId SPINE-DRAFT.
 * The real peak-day CSV (task2b_peak_day_scenarios.csv) can replace this once its columns are known.
 */
import type { Brand, PrismaClient, Store } from '@prisma/client';
import { buildLines } from '../../src/store/catalogue';

const DEPOT = 'depo1';
const PREFIX = 'spine-';
const DRAFT_TAG = 'SPINE-DRAFT';

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

const AMBIENT_PICKS: Record<Exclude<Brand, 'Fresh'>, { catalogueId: string; qty: number }[]> = {
  Style: [
    { catalogueId: 'S-SHIRT', qty: 6 },
    { catalogueId: 'S-SHOE', qty: 3 },
  ],
  Tech: [{ catalogueId: 'T-ACC', qty: 6 }],
};
const CHILLED_PICKS = [
  { catalogueId: 'F-MILK', qty: 4 },
  { catalogueId: 'F-YOG', qty: 6 },
];

export async function seedSpineDemo(prisma: PrismaClient) {
  const tomorrow = colomboDay(1);
  const today = colomboDay(0);

  // Clear the last demo day's unsent rows. A draft that was published belongs to its day: keep it.
  await prisma.trip.deleteMany({ where: { csvRouteId: DRAFT_TAG, status: 'planning' } });
  await prisma.order.deleteMany({
    where: {
      id: { startsWith: PREFIX },
      stop: null,
      status: { in: ['waiting', 'planned', 'deferred'] },
      deliveryNotes: { none: {} },
      fieldFlags: { none: {} },
    },
  });
  if (await prisma.order.count({ where: { id: { startsWith: PREFIX }, deliveryDate: tomorrow } })) {
    console.log('[seed] spine demo: tomorrow already published, left as it is');
    return;
  }

  const stores = await prisma.store.findMany({
    where: { depotId: DEPOT },
    orderBy: [{ districtId: 'asc' }, { windowOpenMin: 'asc' }, { id: 'asc' }],
  });
  const vehicles = await prisma.vehicle.findMany({
    where: { depotId: DEPOT, status: 'available' },
    orderBy: { id: 'asc' },
  });
  const reefers = vehicles.filter((v) => v.temp === 'reefer' && v.type === 'truck');
  if (stores.length === 0 || reefers.length < 2) {
    console.warn('[seed] spine demo: needs depo1 stores and two refrigerated trucks, skipped');
    return;
  }

  let n = 0;
  const used = new Set<string>();
  const order = async (
    store: Store,
    picks: { catalogueId: string; qty: number }[],
    extra: { status?: 'waiting' | 'planned'; movedFromDate?: Date; deferReason?: string } = {},
  ) => {
    used.add(store.id);
    const built = buildLines(store.brand, picks);
    n += 1;
    return prisma.order.create({
      data: {
        id: `${PREFIX}${String(n).padStart(3, '0')}`,
        storeId: store.id,
        brand: store.brand,
        deliveryDate: tomorrow,
        temp: built.chilled ? 'chilled' : 'ambient',
        status: extra.status ?? 'waiting',
        units: built.units,
        weightKg: built.weightKg,
        volumeM3: built.volumeM3,
        movedFromDate: extra.movedFromDate ?? null,
        deferReason: extra.deferReason ?? null,
        deferredYesterday: Boolean(extra.movedFromDate),
        lines: { create: built.lines },
      },
    });
  };

  // 1. The draft trip: three Fresh stores of one district on a reefer, over its volume.
  const fresh = stores.filter((s) => s.brand === 'Fresh' && s.parkingConstraint !== 'van_only');
  const byDistrict = new Map<string, Store[]>();
  for (const s of fresh) byDistrict.set(s.districtId, [...(byDistrict.get(s.districtId) ?? []), s]);
  const [districtId, district] =
    [...byDistrict.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  const tripBusy = new Set(
    (
      await prisma.trip.findMany({ where: { serviceDate: tomorrow }, select: { vehicleId: true } })
    ).map((t) => t.vehicleId),
  );
  const truck = reefers.find((v) => !tripBusy.has(v.id));
  const kasun = await prisma.user.findUnique({ where: { loginId: 'kasun' } });
  if (districtId && district && district.length >= 3 && truck) {
    // Bread is bulky for its weight: about 1.25x the truck's volume, well inside its weight.
    const perStopM3 = (truck.volumeCapM3 * 1.25) / 3;
    const breadQty = Math.max(1, Math.ceil(perStopM3 / 0.06));
    const trip = await prisma.trip.create({
      data: {
        vehicleId: truck.id,
        depotId: DEPOT,
        brand: 'Fresh',
        districtId,
        serviceDate: tomorrow,
        tripNumber: 1,
        status: 'planning',
        csvRouteId: DRAFT_TAG,
        assignedDriverId: kasun?.id ?? null,
      },
    });
    for (const [i, store] of district.slice(0, 3).entries()) {
      const o = await order(
        store,
        [
          { catalogueId: 'F-BREAD', qty: breadQty },
          { catalogueId: 'F-MILK', qty: 2 },
        ],
        { status: 'planned' },
      );
      await prisma.tripStop.create({ data: { tripId: trip.id, orderId: o.id, sequence: i + 1 } });
    }
  }

  // 2. Chilled demand past the refrigerated space (about 115% with the draft trip): the day is
  //    overbooked, limited by chilled. Each order still fits one truck, so auto-assign places some.
  const chilledStores = fresh.filter((s) => !used.has(s.id));
  const chilledCount = Math.min(Math.max(reefers.length + 2, 4), chilledStores.length, 16);
  const reeferM3 = vehicles
    .filter((v) => v.temp === 'reefer')
    .reduce((sum, v) => sum + v.volumeCapM3, 0);
  const draftM3 = truck ? truck.volumeCapM3 * 1.25 : 0;
  const perOrderM3 = chilledCount > 0 ? Math.max(0, reeferM3 * 1.15 - draftM3) / chilledCount : 0;
  const breadQty = Math.floor(perOrderM3 / 0.06);
  const chilledPicks =
    breadQty > 0 ? [...CHILLED_PICKS, { catalogueId: 'F-BREAD', qty: breadQty }] : CHILLED_PICKS;
  for (const store of chilledStores.slice(0, chilledCount)) await order(store, chilledPicks);

  // 3. Ambient orders for Style and Tech stores.
  const ambient = stores.filter(
    (s) => s.brand !== 'Fresh' && s.parkingConstraint !== 'van_only' && !used.has(s.id),
  );
  for (const store of ambient.slice(0, 6)) {
    await order(store, AMBIENT_PICKS[store.brand as Exclude<Brand, 'Fresh'>]);
  }

  // 4. A van-only store: a truck is refused, a van is not.
  const vanOnly = stores.find((s) => s.parkingConstraint === 'van_only' && !used.has(s.id));
  if (vanOnly) {
    await order(
      vanOnly,
      vanOnly.brand === 'Fresh' ? CHILLED_PICKS : AMBIENT_PICKS[vanOnly.brand as 'Style' | 'Tech'],
    );
  }

  // 5. A store moved off today's run: deferring it again is a repeat skip.
  const repeat = fresh.find((s) => !used.has(s.id));
  if (repeat) {
    await order(repeat, CHILLED_PICKS, {
      movedFromDate: today,
      deferReason: 'No chilled space left on any trip',
    });
  }

  console.log(
    `[seed] spine demo for ${tomorrow.toISOString().slice(0, 10)}: ${n} orders, draft trip ${truck ? 'on ' + (truck.numberPlate ?? truck.id) : 'skipped'}, ${chilledCount} chilled orders over ${Math.round(reeferM3)} m³ of refrigerated space${vanOnly ? ', van-only store' : ''}${repeat ? ', repeat-skip store' : ''}`,
  );
}

/**
 * Gives the demo driver (kasun) today's work: the depo1 demo trips that are on the road or
 * published, when nobody else is assigned. A trip is a driver's through Trip.assignedDriverId,
 * so this holds on every seed, also when kasun has no vehicle of his own.
 */
export async function linkDemoDriver(prisma: PrismaClient) {
  const kasun = await prisma.user.findUnique({ where: { loginId: 'kasun' } });
  if (!kasun) return;
  const today = colomboDay(0);
  const linked = await prisma.trip.updateMany({
    where: {
      depotId: DEPOT,
      serviceDate: today,
      status: { in: ['published', 'on_road'] },
      assignedDriverId: null,
      csvRouteId: { in: [`DEMO-STATUS-${DEPOT}-on_road`, `DEMO-STATUS-${DEPOT}-published`] },
    },
    data: { assignedDriverId: kasun.id },
  });
  console.log(`[seed] demo driver kasun: ${linked.count} of today's trips assigned`);
}

/** Licence expiry for every driver without one: kasun's is close, so the profile shows the warning. */
export async function seedLicenceExpiry(prisma: PrismaClient) {
  const drivers = await prisma.driver.findMany({
    where: { licenseExpiry: null },
    include: { user: { select: { loginId: true } } },
    orderBy: { userId: 'asc' },
  });
  for (const [i, d] of drivers.entries()) {
    const expiry = colomboDay(d.user.loginId === 'kasun' ? 20 : 120 + ((i * 37) % 900));
    await prisma.driver.update({ where: { id: d.id }, data: { licenseExpiry: expiry } });
  }
  if (drivers.length > 0) console.log(`[seed] licence expiry set for ${drivers.length} drivers`);
}
