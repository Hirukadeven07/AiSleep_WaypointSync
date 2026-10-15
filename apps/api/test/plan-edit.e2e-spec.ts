import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

// Needs a seeded database (users only). Builds and removes its own rows on a date nothing else uses.
const DAY = '2031-04-10';
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const STORES = ['PE-F1', 'PE-F2', 'PE-F3', 'PE-S1'];
const VEHICLES = ['PE-REEFER', 'PE-AMB'];

describe('plan edits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let districtId = '';
  const ids = { reeferTrip: '', ambTrip: '', lockedTrip: '', f1: '', f2: '', f3: '', s1: '' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomainErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);

    districtId = (
      await prisma.district.create({
        data: {
          name: `PE District ${Date.now()}`,
          depotId: 'depo1',
          depotToDistrictKm: 10,
          depotToDistrictMin: 20,
          interStopKm: 2,
          interStopMin: 6,
        },
      })
    ).name;
    for (const brand of ['Fresh', 'Style', 'Tech'] as const) {
      await prisma.serviceAllowance.upsert({
        where: { brand_dockType: { brand, dockType: 'street' } },
        update: {},
        create: { brand, dockType: 'street', minutes: 12 },
      });
    }
    const store = (id: string, brand: 'Fresh' | 'Style', open: number, close: number) =>
      prisma.store.create({
        data: {
          id,
          displayName: `Store ${id}`,
          brand,
          districtId,
          depotId: 'depo1',
          dockType: 'street',
          windowOpenMin: open,
          windowCloseMin: close,
        },
      });
    await store('PE-F1', 'Fresh', 360, 480);
    await store('PE-F2', 'Fresh', 300, 420);
    await store('PE-F3', 'Fresh', 400, 500);
    await store('PE-S1', 'Style', 600, 840);

    for (const [id, temp] of [
      ['PE-REEFER', 'reefer'],
      ['PE-AMB', 'ambient'],
    ] as const) {
      await prisma.vehicle.create({
        data: {
          id,
          depotId: 'depo1',
          type: 'truck',
          temp,
          weightCapKg: 3000,
          volumeCapM3: 15,
          kmPerL: 6,
          weeklyFuelQuotaL: 500,
          status: 'available',
        },
      });
    }

    const order = (
      storeId: string,
      brand: 'Fresh' | 'Style',
      chilled: boolean,
      weightKg: number,
      status: 'waiting' | 'planned',
    ) =>
      prisma.order.create({
        data: {
          storeId,
          brand,
          deliveryDate: date(DAY),
          temp: chilled ? 'chilled' : 'ambient',
          status,
          units: 10,
          weightKg,
          volumeM3: 1,
          lines: {
            create: [
              {
                name: 'Fresh milk 1 L',
                qty: 48,
                pack: 'units',
                chilled,
                unitWeightKg: 1,
                unitVolumeM3: 0.001,
              },
            ],
          },
        },
      });
    const f1 = await order('PE-F1', 'Fresh', true, 400, 'planned');
    ids.f1 = f1.id;
    ids.f2 = (await order('PE-F2', 'Fresh', true, 300, 'waiting')).id;
    ids.f3 = (await order('PE-F3', 'Fresh', true, 3000, 'waiting')).id;
    ids.s1 = (await order('PE-S1', 'Style', false, 100, 'waiting')).id;

    const trip = (
      vehicleId: string,
      tripNumber: number,
      status: 'planning' | 'published' | 'on_road',
    ) =>
      prisma.trip.create({
        data: {
          vehicleId,
          depotId: 'depo1',
          brand: 'Fresh',
          districtId,
          serviceDate: date(DAY),
          tripNumber,
          status,
        },
      });
    ids.reeferTrip = (await trip('PE-REEFER', 1, 'planning')).id;
    ids.ambTrip = (await trip('PE-AMB', 1, 'planning')).id;
    ids.lockedTrip = (await trip('PE-REEFER', 2, 'on_road')).id;
    await prisma.tripStop.create({
      data: { tripId: ids.reeferTrip, orderId: ids.f1, sequence: 1 },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.trip.deleteMany({ where: { vehicleId: { in: VEHICLES } } });
      await prisma.order.deleteMany({ where: { storeId: { in: STORES } } });
      await prisma.vehicle.deleteMany({ where: { id: { in: VEHICLES } } });
      await prisma.store.deleteMany({ where: { id: { in: STORES } } });
      await prisma.district.deleteMany({ where: { name: districtId } });
    }
    await app?.close();
  });

  async function dispatcher() {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ role: 'dispatcher', loginId: 'nimal', secret: 'waypoint' })
      .expect(200);
    return agent;
  }
  const stopOrder = async (tripId: string) =>
    (
      await prisma.tripStop.findMany({
        where: { tripId },
        orderBy: { sequence: 'asc' },
        include: { order: true },
      })
    ).map((s) => s.order.storeId);

  it('checks a legal drop and says where the stop slots in', async () => {
    const agent = await dispatcher();
    const { body } = await agent
      .post('/api/plan/check')
      .send({ orderId: ids.f2, tripId: ids.reeferTrip })
      .expect(200);
    expect(body).toMatchObject({ canDrop: true, blocks: [], placedSequence: 1 });
    expect(body.after).toMatchObject({ stopCount: 2, weightKg: 700 });
    expect(await stopOrder(ids.reeferTrip)).toEqual(['PE-F1']); // nothing saved
  });

  it('refuses a drop that breaks a hard rule, with the reason code', async () => {
    const agent = await dispatcher();
    const brand = await agent
      .post('/api/plan/check')
      .send({ orderId: ids.s1, tripId: ids.reeferTrip })
      .expect(200);
    expect(brand.body.canDrop).toBe(false);
    expect(brand.body.blocks.map((b: { code: string }) => b.code)).toContain('BRAND_MISMATCH');

    const chilled = await agent
      .post('/api/plan/check')
      .send({ orderId: ids.f2, tripId: ids.ambTrip })
      .expect(200);
    expect(chilled.body.blocks.map((b: { code: string }) => b.code)).toContain(
      'CHILLED_NEEDS_REEFER',
    );

    const res = await agent
      .post('/api/plan/assign')
      .send({ orderId: ids.s1, tripId: ids.reeferTrip })
      .expect(409);
    expect(res.body.reason).toBe('BRAND_MISMATCH');
    expect(await stopOrder(ids.reeferTrip)).toEqual(['PE-F1']);
  });

  it('treats over-capacity as a warning, not a refusal', async () => {
    const agent = await dispatcher();
    const { body } = await agent
      .post('/api/plan/check')
      .send({ orderId: ids.f3, tripId: ids.reeferTrip })
      .expect(200);
    expect(body.canDrop).toBe(true);
    expect(body.warnings.map((w: { code: string }) => w.code)).toContain('OVER_WEIGHT');
  });

  it('places an order, keeps stops sorted by window, and undoes it', async () => {
    const agent = await dispatcher();
    const { body } = await agent
      .post('/api/plan/assign')
      .send({ orderId: ids.f2, tripId: ids.reeferTrip })
      .expect(200);
    expect(body).toMatchObject({ placedSequence: 1, resorted: true, fromTrip: null });
    expect(body.trip.stops.map((s: { storeName: string }) => s.storeName)).toEqual([
      'Store PE-F2',
      'Store PE-F1',
    ]);
    expect(await stopOrder(ids.reeferTrip)).toEqual(['PE-F2', 'PE-F1']);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ids.f2 } })).status).toBe(
      'planned',
    );

    const undone = await agent.post('/api/plan/unassign').send({ orderId: ids.f2 }).expect(200);
    expect(undone.body.fromTrip.stops).toHaveLength(1);
    expect(await stopOrder(ids.reeferTrip)).toEqual(['PE-F1']);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ids.f2 } })).status).toBe(
      'waiting',
    );
  });

  it('will not change a trip that has left the depot', async () => {
    const agent = await dispatcher();
    const res = await agent
      .post('/api/plan/assign')
      .send({ orderId: ids.f2, tripId: ids.lockedTrip })
      .expect(409);
    expect(res.body.reason).toBe('PLAN_LOCKED');
  });

  it('reads one order for the drawer, with a suggested trip', async () => {
    const agent = await dispatcher();
    const { body } = await agent.get(`/api/plan/orders/${ids.f2}`).expect(200);
    expect(body.code).toMatch(/^ORD-[A-Z0-9]{5}$/);
    expect(body.lines).toEqual([
      expect.objectContaining({ name: 'Fresh milk 1 L', qty: 48, chilled: true }),
    ]);
    const allowance = await prisma.serviceAllowance.findUniqueOrThrow({
      where: { brand_dockType: { brand: 'Fresh', dockType: 'street' } },
    });
    expect(body).toMatchObject({
      dockType: 'street',
      unloadMin: allowance.minutes,
      assignedTripId: null,
      warning: null,
    });
    expect(body.suggestion).toMatchObject({ tripId: ids.reeferTrip });
    expect(body.suggestion.fit).toMatch(/^fits as stop 1, window (met|at risk)$/);
  });

  it('only lets dispatchers edit', async () => {
    await request(app.getHttpServer())
      .post('/api/plan/check')
      .send({ orderId: ids.f2, tripId: ids.reeferTrip })
      .expect(401);
    await request(app.getHttpServer()).post('/api/plan/check').send({}).expect(401);
    const agent = await dispatcher();
    await agent.post('/api/plan/check').send({}).expect(400);
  });
});
