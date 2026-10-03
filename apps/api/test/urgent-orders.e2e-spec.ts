import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

// Needs a seeded database (users only). Builds and removes its own stores and orders.
const DAY = '2026-10-01';
const MORNING = `${DAY}T09:00:00+05:30`;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
// The urgent store opens latest, so window order alone would put it last.
const STORES = [
  { id: 'E2E-URG-EARLY', open: 300 },
  { id: 'E2E-URG-MID', open: 400 },
  { id: 'E2E-URG-LATE', open: 900 },
];

describe('urgent orders from the store (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunilStoreId: string | null = null;
  let districtId = '';
  const previousDemoNow = process.env.DEMO_NOW;

  async function login(body: object) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send(body).expect(200);
    return agent;
  }

  beforeAll(async () => {
    process.env.DEMO_NOW = MORNING;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomainErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.item.upsert({
      where: { id: 'F-MILK' },
      update: {},
      create: { id: 'F-MILK', itemName: 'Fresh milk' },
    });
    const district = await prisma.district.create({
      data: { name: `E2E Urgent ${Date.now()}`, depotId: 'depo1' },
    });
    districtId = district.name;
    for (const s of STORES) {
      await prisma.store.create({
        data: {
          id: s.id,
          displayName: s.id,
          brand: 'Fresh',
          districtId,
          depotId: 'depo1',
          dockType: 'street',
          windowOpenMin: s.open,
          windowCloseMin: s.open + 120,
        },
      });
    }
    const sunil = await prisma.user.findUniqueOrThrow({ where: { loginId: 'sunil' } });
    sunilStoreId = sunil.storeId;
    await prisma.user.update({ where: { id: sunil.id }, data: { storeId: 'E2E-URG-LATE' } });
  });

  afterAll(async () => {
    process.env.DEMO_NOW = previousDemoNow;
    if (prisma) {
      const ids = STORES.map((s) => s.id);
      await prisma.order.deleteMany({ where: { storeId: { in: ids } } });
      await prisma.user.update({ where: { loginId: 'sunil' }, data: { storeId: sunilStoreId } });
      await prisma.store.deleteMany({ where: { id: { in: ids } } });
      await prisma.district.deleteMany({ where: { name: districtId } });
    }
    await app?.close();
  });

  it('refuses an urgent order without a stock level', async () => {
    const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
    await store
      .post('/api/store/orders')
      .send({ lines: [{ catalogueId: 'F-MILK', qty: 1 }], urgent: true })
      .expect(400);
    await store
      .post('/api/store/orders')
      .send({ lines: [{ catalogueId: 'F-MILK', qty: 1 }], urgent: true, stockLevel: 'empty' })
      .expect(400);
  });

  it('ignores stock level and note on a non-urgent order', async () => {
    const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
    const placed = await store
      .post('/api/store/orders')
      .send({
        lines: [{ catalogueId: 'F-MILK', qty: 1 }],
        stockLevel: 'running_low',
        urgentNote: 'ignored',
      })
      .expect(201);
    expect(placed.body).toMatchObject({ urgent: false, stockLevel: null, urgentNote: null });
    await prisma.order.delete({ where: { id: placed.body.id } });
  });

  it('puts the urgent order at the top of the plan, ahead of earlier windows', async () => {
    const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
    const placed = await store
      .post('/api/store/orders')
      .send({
        lines: [{ catalogueId: 'F-MILK', qty: 3 }],
        urgent: true,
        stockLevel: 'out_of_stock',
        urgentNote: '  Milk shelf empty since noon  ',
      })
      .expect(201);
    expect(placed.body).toMatchObject({
      urgent: true,
      stockLevel: 'out_of_stock',
      urgentNote: 'Milk shelf empty since noon',
    });
    const mine = (await store.get('/api/store/orders').expect(200)).body;
    expect(mine.find((o: { id: string }) => o.id === placed.body.id)).toMatchObject({
      urgent: true,
      stockLevel: 'out_of_stock',
    });

    // Two plain orders for the same day whose windows open earlier.
    const deliveryDate: string = placed.body.deliveryDate;
    const plain = async (storeId: string) =>
      (
        await prisma.order.create({
          data: {
            storeId,
            brand: 'Fresh',
            deliveryDate: date(deliveryDate),
            temp: 'ambient',
            status: 'waiting',
            units: 1,
            weightKg: 5,
            volumeM3: 0.05,
          },
        })
      ).id;
    const mid = await plain('E2E-URG-MID');
    const early = await plain('E2E-URG-EARLY');

    const dispatcher = await login({ role: 'dispatcher', loginId: 'nimal', secret: 'waypoint' });
    const plan = (await dispatcher.get(`/api/plan?date=${deliveryDate}`).expect(200)).body;
    const orders: { id: string; urgent: boolean; windowOpenMin: number }[] = plan.orders;
    const at = (id: string) => orders.findIndex((o) => o.id === id);

    expect(orders[0]!.urgent).toBe(true);
    expect(at(placed.body.id)).toBeGreaterThanOrEqual(0);
    expect(at(placed.body.id)).toBeLessThan(at(early));
    expect(orders[at(placed.body.id)]).toMatchObject({
      urgent: true,
      stockLevel: 'out_of_stock',
      urgentNote: 'Milk shelf empty since noon',
    });
    // Every urgent order comes before every other one; the rest keep window order.
    const firstPlain = orders.findIndex((o) => !o.urgent);
    expect(orders.slice(firstPlain).every((o) => !o.urgent)).toBe(true);
    expect(at(early)).toBeLessThan(at(mid));
    const rest = orders.slice(firstPlain).map((o) => o.windowOpenMin);
    expect(rest).toEqual([...rest].sort((a, b) => a - b));
  });
});
