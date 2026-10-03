/**
 * At least 20 orders at each depot, with every order status represented.
 * Four of each status: waiting, planned, deferred, delivered, partial.
 * Existing orders count, so a second seed only fills what is missing.
 */
import type { Brand, OrderStatus, PrismaClient } from '@prisma/client';
import { buildLines } from '../../src/store/catalogue';

const PER_STATUS = 4;
const STATUSES: OrderStatus[] = ['waiting', 'planned', 'deferred', 'delivered', 'partial'];

const PICKS: Record<Brand, { catalogueId: string; qty: number }[]> = {
  Fresh: [
    { catalogueId: 'F-MILK', qty: 2 },
    { catalogueId: 'F-BREAD', qty: 2 },
  ],
  Style: [{ catalogueId: 'S-SHIRT', qty: 2 }],
  Tech: [{ catalogueId: 'T-ACC', qty: 2 }],
};

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

function deliveryDay(status: OrderStatus): Date {
  if (status === 'deferred') return colomboDay(1);
  if (status === 'delivered' || status === 'partial') return colomboDay(-1);
  return colomboDay(0);
}

export async function seedDepotOrders(prisma: PrismaClient) {
  const depots = await prisma.depot.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  for (const depot of depots) {
    const stores = await prisma.store.findMany({
      where: { depotId: depot.id },
      orderBy: { id: 'asc' },
    });
    if (stores.length === 0) {
      console.warn(`[seed] ${depot.id}: no stores, skipping depot orders`);
      continue;
    }
    const grouped = await prisma.order.groupBy({
      by: ['status'],
      where: { store: { depotId: depot.id } },
      _count: { _all: true },
    });
    const have = new Map(grouped.map((row) => [row.status, row._count._all]));
    let added = 0;
    let cursor = 0;
    for (const status of STATUSES) {
      const missing = Math.max(0, PER_STATUS - (have.get(status) ?? 0));
      for (let n = 0; n < missing; n++) {
        const store = stores[cursor % stores.length]!;
        cursor += 1;
        const built = buildLines(store.brand, PICKS[store.brand]);
        await prisma.order.create({
          data: {
            storeId: store.id,
            brand: store.brand,
            deliveryDate: deliveryDay(status),
            temp: built.chilled ? 'chilled' : 'ambient',
            status,
            units: built.units,
            weightKg: built.weightKg,
            volumeM3: built.volumeM3,
            deferReason: status === 'deferred' ? 'Shop asked to move this delivery' : null,
            movedFromDate: status === 'deferred' ? colomboDay(-1) : null,
            deferredYesterday: status === 'deferred',
            lines: { create: built.lines },
          },
        });
        added += 1;
      }
    }
    const total = [...have.values()].reduce((sum, n) => sum + n, 0) + added;
    console.log(
      `[seed] ${depot.id}: ${total} orders (${added} added; at least ${PER_STATUS} of each status)`,
    );
  }
}
