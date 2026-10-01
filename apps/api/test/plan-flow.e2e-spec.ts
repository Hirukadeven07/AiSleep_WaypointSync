import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

// Needs a seeded database (users only). Builds and removes its own rows on dates nothing else uses.
jest.setTimeout(60_000);

const DAY = '2031-05-15';
const NEXT = '2031-05-16';
const AUTO_DAY = '2031-05-20';
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const STORES = ['BR-F1', 'BR-F2', 'BR-S1', 'BR-B1', 'BR-B2', 'BR-A1', 'BR-A2', 'BR-A3'];
const VEHICLES = ['BR-REEFER', 'BR-VAN', 'BR-OOS'];

describe('plan flow: defer, new trip, publish, auto-assign (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let districtId = '';
  let storeUserId = '';
  const o: Record<string, string> = {};
  const t: Record<string, string> = {};
  const previousDemoNow = process.env.DEMO_NOW;

  beforeAll(async () => {
    process.env.DEMO_NOW = `${date('2031-05-14').toISOString().slice(0, 10)}T09:00:00+05:30`;
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
          name: `BR District ${Date.now()}`,
          depotId: 'Peliyagoda',
          depotToDistrictKm: 10,
          depotToDistrictMin: 20,
          interStopKm: 2,
          interStopMin: 6,
        },
      })
    ).id;
    for (const brand of ['Fresh', 'Style', 'Tech'] as const) {
      await prisma.serviceAllowance.upsert({
        where: { brand_dockType: { brand, dockType: 'street' } },
        update: {},
        create: { brand, dockType: 'street', minutes: 10 },
      });
    }
    const store = (id: string, brand: 'Fresh' | 'Style', open: number, close: number) =>
      prisma.store.create({
        data: {
          id,
          displayName: `Store ${id}`,
          brand,
          districtId,
          depotId: 'Peliyagoda',
          dockType: 'street',
          windowOpenMin: open,
          windowCloseMin: close,
        },
      });
    await store('BR-F1', 'Fresh', 300, 480);
    await store('BR-F2', 'Fresh', 360, 540);
    await store('BR-S1', 'Style', 600, 840);
    await store('BR-B1', 'Style', 600, 840);
    await store('BR-B2', 'Style', 620, 860);
    for (const id of ['BR-A1', 'BR-A2', 'BR-A3']) await store(id, 'Fresh', 300, 600);

    const vehicle = (
      id: string,
      type: 'truck' | 'van',
      temp: 'reefer' | 'ambient',
      w: number,
      v: number,
      extra = {},
    ) =>
      prisma.vehicle.create({
        data: {
          id,
          plate: id,
          depotId: 'Peliyagoda',
          type,
          temp,
          weightCapKg: w,
          volumeCapM3: v,
          kmPerL: 6,
          weeklyFuelQuotaL: 500,
          status: 'available',
          ...extra,
        },
      });
    await vehicle('BR-REEFER', 'truck', 'reefer', 3000, 15);
    await vehicle('BR-VAN', 'van', 'ambient', 1500, 8);
    await vehicle('BR-OOS', 'truck', 'ambient', 3000, 15, {
      status: 'out_of_service',
      returnDate: date('2031-05-19'),
    });

    const order = async (
      key: string,
      storeId: string,
      brand: 'Fresh' | 'Style',
      chilled: boolean,
      kg: number,
      day = DAY,
    ) => {
      o[key] = (
        await prisma.order.create({
          data: {
            storeId,
            brand,
            deliveryDate: date(day),
            temp: chilled ? 'chilled' : 'ambient',
            status: 'waiting',
            units: 10,
            weightKg: kg,
            volumeM3: 1,
          },
        })
      ).id;
    };
    await order('f1', 'BR-F1', 'Fresh', true, 400);
    await order('f2', 'BR-F2', 'Fresh', true, 300);
    await order('s1', 'BR-S1', 'Style', false, 100);
    await order('b1', 'BR-B1', 'Style', false, 900);
    await order('b2', 'BR-B2', 'Style', false, 900);
    for (const id of ['A1', 'A2', 'A3']) await order(id, `BR-${id}`, 'Fresh', true, 200, AUTO_DAY);

    storeUserId = (
      await prisma.user.create({
        data: {
          loginId: `br-store-${Date.now()}`,
          role: 'store',
          name: 'BR store',
          storeId: 'BR-F1',
        },
      })
    ).id;
  });

  afterAll(async () => {
    process.env.DEMO_NOW = previousDemoNow;
    if (prisma) {
      await prisma.trip.deleteMany({
        where: {
          OR: [
            { vehicleId: { in: VEHICLES } },
            { serviceDate: { in: [date(DAY), date(AUTO_DAY)] } },
          ],
        },
      });
      await prisma.order.deleteMany({ where: { storeId: { in: STORES } } });
      await prisma.user.deleteMany({ where: { id: storeUserId } });
      await prisma.vehicle.deleteMany({ where: { id: { in: VEHICLES } } });
      await prisma.store.deleteMany({ where: { id: { in: STORES } } });
      await prisma.district.deleteMany({ where: { id: districtId } });
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
  const notices = (title: string) =>
    prisma.notification.count({ where: { userId: storeUserId, title: { startsWith: title } } });

  it('moves an order to a later day, tells the store, and brings it back', async () => {
    const agent = await dispatcher();
    const preview = await agent
      .post('/api/plan/defer/preview')
      .send({ orderId: o.f2, reason: 'No chilled space left on any trip' })
      .expect(200);
    expect(preview.body).toMatchObject({ times: 1, newDate: NEXT, repeatSkip: false });
    expect(preview.body.storeMessage).toMatch(
      /^Your order ORD-[A-Z0-9]{5} now arrives .*first in line that day\.$/,
    );

    const done = await agent
      .post('/api/plan/defer')
      .send({ orderId: o.f2, reason: 'No chilled space left on any trip' })
      .expect(200);
    expect(done.body.order).toMatchObject({
      status: 'deferred',
      deferredTo: NEXT,
      deferReason: 'No chilled space left on any trip',
    });
    const row = await prisma.order.findUniqueOrThrow({ where: { id: o.f2 } });
    expect(row.status).toBe('deferred');
    expect(row.movedFromDate?.toISOString().slice(0, 10)).toBe(DAY);

    const plan = await agent.get(`/api/plan?date=${DAY}`).expect(200);
    expect(plan.body.movedToLater.map((x: { storeId: string }) => x.storeId)).toContain('BR-F2');

    const back = await agent.post('/api/plan/bring-back').send({ orderId: o.f2 }).expect(200);
    expect(back.body.order.status).toBe('waiting');
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: o.f2 } })).deliveryDate
        .toISOString()
        .slice(0, 10),
    ).toBe(DAY);
    await agent.post('/api/plan/bring-back').send({ orderId: o.f2 }).expect(409);
  });

  it('lists vehicles per run, creates trips and refuses a vehicle that cannot take one', async () => {
    const agent = await dispatcher();
    const opts = await agent.get(`/api/plan/trips/options?date=${DAY}`).expect(200);
    expect(opts.body.runs.map((r: { label: string }) => r.label)).toEqual([
      'Trip 1 · morning',
      'Trip 2 · afternoon',
    ]);
    const run1 = opts.body.vehicles['1'] as {
      id: string;
      tag: string | null;
      available: boolean;
      unavailable: string | null;
    }[];
    expect(run1.find((v) => v.id === 'BR-REEFER')).toMatchObject({
      available: true,
      tag: 'Best for Fresh',
    });
    expect(run1.find((v) => v.id === 'BR-OOS')).toMatchObject({
      available: false,
      tag: 'Unavailable',
    });
    expect(run1.find((v) => v.id === 'BR-OOS')?.unavailable).toMatch(/^Out of service until /);

    const reefer = await agent
      .post('/api/plan/trips')
      .send({ vehicleId: 'BR-REEFER', tripNumber: 1, brand: 'Fresh', districtId, date: DAY })
      .expect(200);
    t.reefer = reefer.body.id;
    expect(reefer.body).toMatchObject({ plate: 'BR-REEFER', state: 'draft', stops: [] });
    const van = await agent
      .post('/api/plan/trips')
      .send({ vehicleId: 'BR-VAN', tripNumber: 1, brand: 'Style', districtId, date: DAY })
      .expect(200);
    t.van = van.body.id;

    const again = await agent
      .post('/api/plan/trips')
      .send({ vehicleId: 'BR-VAN', tripNumber: 1, brand: 'Style', districtId, date: DAY })
      .expect(409);
    expect(again.body.reason).toBe('VEHICLE_UNAVAILABLE');
    const oos = await agent
      .post('/api/plan/trips')
      .send({ vehicleId: 'BR-OOS', tripNumber: 1, brand: 'Fresh', districtId, date: DAY })
      .expect(409);
    expect(oos.body.reason).toBe('VEHICLE_UNAVAILABLE');
    await agent
      .post('/api/plan/trips')
      .send({ vehicleId: 'BR-VAN', tripNumber: 3, brand: 'Style', districtId })
      .expect(400);
  });

  it('suggests only the orders the rules let onto an empty trip', async () => {
    const agent = await dispatcher();
    const { body } = await agent.get(`/api/plan/trips/${t.reefer}/suggestions`).expect(200);
    expect(body.map((s: { orderId: string }) => s.orderId).sort()).toEqual([o.f1, o.f2].sort());
  });

  it('blocks publishing a capacity problem, then publishes once it is fixed', async () => {
    const agent = await dispatcher();
    for (const id of [o.f1, o.f2])
      await agent.post('/api/plan/assign').send({ orderId: id, tripId: t.reefer }).expect(200);
    for (const id of [o.s1, o.b1, o.b2])
      await agent.post('/api/plan/assign').send({ orderId: id, tripId: t.van }).expect(200);

    const check = await agent.post('/api/plan/publish/check').send({ date: DAY }).expect(200);
    expect(check.body.canPublish).toBe(false);
    expect(check.body.problems).toEqual([
      expect.objectContaining({
        tripId: t.van,
        code: 'OVER_WEIGHT',
        severity: 'block',
        trip: 'BR-VAN · Trip 1',
      }),
    ]);
    expect(check.body.problems[0].message).toMatch(/BR-VAN is over weight \(1900 \/ 1500 kg\)/);
    const refused = await agent
      .post('/api/plan/publish')
      .send({ date: DAY, anyway: true })
      .expect(409);
    expect(refused.body.reason).toBe('OVER_WEIGHT');
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: t.van } })).status).toBe('planning');

    // Moving the second heavy order to a later day clears the problem.
    await agent
      .post('/api/plan/defer')
      .send({ orderId: o.b2, reason: 'No van left for a van-only store' })
      .expect(200);
    expect(await prisma.tripStop.count({ where: { tripId: t.van } })).toBe(2);
    const ok = await agent.post('/api/plan/publish/check').send({ date: DAY }).expect(200);
    expect(ok.body).toMatchObject({ canPublish: true, tripCount: 2, storeCount: 4 });

    const before = await notices('Delivery confirmed');
    const res = await agent.post('/api/plan/publish').send({ date: DAY, anyway: true }).expect(200);
    expect(res.body).toMatchObject({ ok: true, tripCount: 2, storeCount: 4 });
    expect(await notices('Delivery confirmed')).toBe(before + 1);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: t.reefer } })).status).toBe(
      'published',
    );

    // Published stops carry ETAs: a Fresh trip leaves at 03:30 (210) and the district is 20 minutes out.
    const etas = (
      await prisma.tripStop.findMany({ where: { tripId: t.reefer }, orderBy: { sequence: 'asc' } })
    ).map((s) => s.etaMin);
    expect(etas[0]).toBe(230);
    expect(etas[1]).toBeGreaterThan(230);

    const plan = await agent.get(`/api/plan?date=${DAY}`).expect(200);
    expect(plan.body.published).toMatchObject({ tripCount: 2, storeCount: 4 });
    expect(plan.body.trips.every((x: { state: string }) => x.state === 'sent')).toBe(true);
    // A published trip still at the depot can change; each change raises its plan version for the dock.
    const version = async () =>
      (await prisma.trip.findUniqueOrThrow({ where: { id: t.reefer } })).planVersion;
    const v1 = await version();
    await agent.post('/api/plan/unassign').send({ orderId: o.f2 }).expect(200);
    expect(await version()).toBe(v1 + 1);
    await agent.post('/api/plan/assign').send({ orderId: o.f2, tripId: t.reefer }).expect(200);
    expect(await version()).toBe(v1 + 2);
  });

  it('proposes auto-assign without saving, then applies it', async () => {
    const agent = await dispatcher();
    const proposal = await agent.post('/api/plan/auto-assign').send({ date: AUTO_DAY }).expect(200);
    expect(proposal.body.ordersPlaced).toBe(3);
    expect(proposal.body.movedToLater).toBe(0);
    expect(
      await prisma.tripStop.count({
        where: { order: { storeId: { in: ['BR-A1', 'BR-A2', 'BR-A3'] } } },
      }),
    ).toBe(0);

    const applied = await agent
      .post('/api/plan/auto-assign/apply')
      .send({ date: AUTO_DAY })
      .expect(200);
    expect(applied.body.ordersPlaced).toBe(3);
    const placed = await prisma.order.findMany({
      where: { storeId: { in: ['BR-A1', 'BR-A2', 'BR-A3'] } },
    });
    expect(placed.every((x) => x.status === 'planned')).toBe(true);
    expect(
      await prisma.tripStop.count({ where: { orderId: { in: placed.map((x) => x.id) } } }),
    ).toBe(3);

    const again = await agent.post('/api/plan/auto-assign').send({ date: AUTO_DAY }).expect(200);
    expect(again.body.ordersPlaced).toBe(0);
  });

  it('only lets dispatchers use them', async () => {
    await request(app.getHttpServer()).post('/api/plan/publish').send({}).expect(401);
    await request(app.getHttpServer()).post('/api/plan/defer').send({}).expect(401);
    const agent = await dispatcher();
    await agent.post('/api/plan/defer').send({ orderId: o.s1 }).expect(400);
  });
});
