import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

// Needs a seeded database (users only). Builds and removes its own rows on a date nothing else uses.
const DAY = '2031-05-20';
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const STORES = [
  { id: 'E2E-TO-A', open: 300 },
  { id: 'E2E-TO-B', open: 360 },
  { id: 'E2E-TO-C', open: 420 },
];

describe('plan change at the dock: taken-off goods (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ids = { district: '', trip: '', a: '', b: '', c: '' };

  async function login(body: object) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send(body).expect(200);
    return agent;
  }
  const loader = () => login({ role: 'loader', loginId: 'sampath', depotId: 'Peliyagoda' });
  const dispatcher = () => login({ role: 'dispatcher', loginId: 'nimal', secret: 'waypoint' });
  const session = () => prisma.loadSession.findUniqueOrThrow({ where: { tripId: ids.trip } });

  async function order(storeId: string, status: 'planned' | 'waiting') {
    return prisma.order.create({
      data: {
        storeId,
        brand: 'Fresh',
        deliveryDate: date(DAY),
        temp: 'chilled',
        status,
        units: 4,
        weightKg: 20,
        volumeM3: 0.1,
        lines: {
          create: [
            {
              name: 'Yoghurt',
              qty: 3,
              pack: 'crate',
              chilled: true,
              unitWeightKg: 4,
              unitVolumeM3: 0.02,
            },
            {
              name: 'Milk',
              qty: 1,
              pack: 'crate',
              chilled: true,
              unitWeightKg: 8,
              unitVolumeM3: 0.04,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomainErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);

    // Travel and allowance rows so the dispatcher's assign passes the plan rules.
    ids.district = (
      await prisma.district.create({
        data: {
          name: `E2E Takeoff ${Date.now()}`,
          depotId: 'Peliyagoda',
          depotToDistrictKm: 10,
          depotToDistrictMin: 20,
          interStopKm: 2,
          interStopMin: 6,
        },
      })
    ).id;
    await prisma.serviceAllowance.upsert({
      where: { brand_dockType: { brand: 'Fresh', dockType: 'street' } },
      update: {},
      create: { brand: 'Fresh', dockType: 'street', minutes: 12 },
    });
    for (const s of STORES) {
      await prisma.store.create({
        data: {
          id: s.id,
          displayName: s.id,
          brand: 'Fresh',
          districtId: ids.district,
          depotId: 'Peliyagoda',
          dockType: 'street',
          windowOpenMin: s.open,
          windowCloseMin: 720,
        },
      });
    }
    await prisma.vehicle.create({
      data: {
        id: 'E2E-TO-REEFER',
        depotId: 'Peliyagoda',
        type: 'truck',
        temp: 'reefer',
        weightCapKg: 3000,
        volumeCapM3: 15,
        kmPerL: 6,
        weeklyFuelQuotaL: 500,
      },
    });
    const trip = await prisma.trip.create({
      data: {
        vehicleId: 'E2E-TO-REEFER',
        depotId: 'Peliyagoda',
        brand: 'Fresh',
        districtId: ids.district,
        serviceDate: date(DAY),
        tripNumber: 1,
        status: 'published',
      },
    });
    ids.trip = trip.id;
    ids.a = (await order('E2E-TO-A', 'planned')).id;
    ids.b = (await order('E2E-TO-B', 'planned')).id;
    ids.c = (await order('E2E-TO-C', 'waiting')).id;
    await prisma.tripStop.create({ data: { tripId: trip.id, orderId: ids.a, sequence: 1 } });
    await prisma.tripStop.create({ data: { tripId: trip.id, orderId: ids.b, sequence: 2 } });
  });

  afterAll(async () => {
    if (prisma) {
      const storeIds = STORES.map((s) => s.id);
      await prisma.deliveryNote.deleteMany({ where: { order: { storeId: { in: storeIds } } } });
      await prisma.trip.deleteMany({ where: { id: ids.trip } });
      await prisma.order.deleteMany({ where: { storeId: { in: storeIds } } });
      await prisma.vehicle.deleteMany({ where: { id: 'E2E-TO-REEFER' } });
      await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
      await prisma.district.deleteMany({ where: { id: ids.district } });
    }
    await app?.close();
  });

  it('shows the goods to take off and the before/after load order', async () => {
    const dock = await loader();
    const started = (await dock.post(`/api/loads/${ids.trip}/start`).expect(200)).body;
    expect(started.lock).toMatchObject({ locked: false, before: [], after: [] });
    expect(started.loadOrder.every((s: { isNew: boolean }) => s.isNew === false)).toBe(true);

    const desk = await dispatcher();
    await desk.post('/api/plan/unassign').send({ orderId: ids.a }).expect(200);
    await desk.post('/api/plan/assign').send({ orderId: ids.c, tripId: ids.trip }).expect(200);

    const sheet = (await dock.get(`/api/loads/${ids.trip}`).expect(200)).body;
    const stopC = sheet.loadOrder.find((s: { storeName: string }) => s.storeName === 'E2E-TO-C');
    expect(sheet.lock.locked).toBe(true);
    expect(sheet.lock.added).toEqual([stopC.stopId]);
    expect(sheet.lock.removed).toEqual([
      {
        orderId: ids.a,
        storeName: 'E2E-TO-A',
        takenOff: false,
        lines: [
          expect.objectContaining({ name: 'Milk', qty: 1 }),
          expect.objectContaining({ name: 'Yoghurt', qty: 3 }),
        ],
      },
    ]);
    // Load order: index 0 is the back of the truck, the last stop delivered.
    expect(sheet.lock.before).toEqual([
      { orderId: ids.b, storeName: 'E2E-TO-B', change: 'kept' },
      { orderId: ids.a, storeName: 'E2E-TO-A', change: 'removed' },
    ]);
    expect(sheet.lock.after).toEqual([
      { orderId: ids.c, storeName: 'E2E-TO-C', change: 'added' },
      { orderId: ids.b, storeName: 'E2E-TO-B', change: 'kept' },
    ]);
  });

  it('refuses to acknowledge until the removed goods are off the truck', async () => {
    const dock = await loader();
    const refused = await dock.post(`/api/loads/${ids.trip}/ack`).expect(409);
    expect(refused.body.reason).toBe('REMOVED_GOODS_NOT_TAKEN_OFF');

    const notRemoved = await dock
      .post(`/api/loads/${ids.trip}/taken-off`)
      .send({ orderId: ids.b })
      .expect(409);
    expect(notRemoved.body.reason).toBe('ORDER_NOT_REMOVED');
    await dock.post(`/api/loads/${ids.trip}/taken-off`).send({}).expect(400);

    for (let i = 0; i < 2; i++) {
      const res = await dock
        .post(`/api/loads/${ids.trip}/taken-off`)
        .send({ orderId: ids.a })
        .expect(200);
      expect(res.body.lock.removed[0].takenOff).toBe(true);
    }
    expect((await session()).takenOffOrderIds).toEqual([ids.a]);
  });

  it('acknowledges, marks the added stop NEW and resets the take-off list', async () => {
    const dock = await loader();
    const acked = (await dock.post(`/api/loads/${ids.trip}/ack`).expect(200)).body;
    expect(acked.lock).toMatchObject({ locked: false, removed: [], before: [], after: [] });
    const isNew = Object.fromEntries(
      acked.loadOrder.map((s: { storeName: string; isNew: boolean }) => [s.storeName, s.isNew]),
    );
    expect(isNew).toEqual({ 'E2E-TO-C': true, 'E2E-TO-B': false });
    const saved = await session();
    expect(saved.takenOffOrderIds).toEqual([]);
    expect(saved.newOrderIds).toEqual([ids.c]);

    const late = await dock
      .post(`/api/loads/${ids.trip}/taken-off`)
      .send({ orderId: ids.a })
      .expect(409);
    expect(late.body.reason).toBe('PLAN_NOT_CHANGED');
  });

  it('clears the NEW markers on departure', async () => {
    const dock = await loader();
    const { planVersion } = (await dock.get(`/api/loads/${ids.trip}`).expect(200)).body;
    await dock.post(`/api/loads/${ids.trip}/depart`).send({ planVersion }).expect(200);
    expect((await session()).newOrderIds).toEqual([]);
  });
});
