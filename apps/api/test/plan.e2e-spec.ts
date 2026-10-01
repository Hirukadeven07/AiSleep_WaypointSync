import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

// Needs a seeded database (users only; the CSVs are optional). Builds and removes its own rows,
// on a date no other test or demo data uses, so the counts below are exact.
const DAY = '2031-03-04';
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const STORES = ['PB-A', 'PB-B', 'PB-C', 'PB-D'];

describe('plan board (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let districtId = '';
  const tripIds: string[] = [];
  const previousDemoNow = process.env.DEMO_NOW;

  beforeAll(async () => {
    process.env.DEMO_NOW = `${DAY}T09:00:00+05:30`;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomainErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const district = await prisma.district.create({
      data: {
        name: `PB District ${Date.now()}`,
        depotId: 'Peliyagoda',
        depotToDistrictKm: 10,
        depotToDistrictMin: 20,
        interStopKm: 2,
        interStopMin: 6,
      },
    });
    districtId = district.id;
    for (const brand of ['Fresh', 'Style', 'Tech'] as const) {
      await prisma.serviceAllowance.upsert({
        where: { brand_dockType: { brand, dockType: 'street' } },
        update: {},
        create: { brand, dockType: 'street', minutes: 10 },
      });
    }
    for (const id of STORES) {
      await prisma.store.create({
        data: {
          id,
          displayName: `Store ${id}`,
          brand: 'Fresh',
          districtId,
          depotId: 'Peliyagoda',
          dockType: 'street',
          windowOpenMin: 300,
          windowCloseMin: 600,
        },
      });
    }
    await prisma.vehicle.createMany({
      data: [
        {
          id: 'PB-BUSY',
          depotId: 'Peliyagoda',
          type: 'van',
          temp: 'ambient',
          weightCapKg: 1000,
          volumeCapM3: 5,
          kmPerL: 8,
          weeklyFuelQuotaL: 500,
          status: 'available',
        },
        {
          id: 'PB-FREE',
          depotId: 'Peliyagoda',
          type: 'van',
          temp: 'ambient',
          weightCapKg: 1000,
          volumeCapM3: 5,
          kmPerL: 8,
          weeklyFuelQuotaL: 500,
          status: 'available',
        },
      ],
    });

    const order = (storeId: string, status: 'waiting' | 'planned' | 'deferred', extra = {}) =>
      prisma.order.create({
        data: {
          storeId,
          brand: 'Fresh',
          deliveryDate: date(DAY),
          temp: 'ambient',
          status,
          units: 10,
          weightKg: 700,
          volumeM3: 3.5,
          ...extra,
        },
      });
    // Two planned orders that together are over weight (1400 kg on a 1000 kg van).
    const planned = [await order('PB-A', 'planned'), await order('PB-B', 'planned')];
    await order('PB-C', 'waiting', { movedFromDate: date('2031-03-03') });
    await order('PB-D', 'deferred', {
      deliveryDate: date('2031-03-05'),
      movedFromDate: date(DAY),
      deferReason: 'No van left',
    });

    const trip = await prisma.trip.create({
      data: {
        vehicleId: 'PB-BUSY',
        depotId: 'Peliyagoda',
        brand: 'Fresh',
        districtId,
        serviceDate: date(DAY),
        tripNumber: 1,
        status: 'planning',
      },
    });
    tripIds.push(trip.id);
    for (const [i, o] of planned.entries()) {
      await prisma.tripStop.create({ data: { tripId: trip.id, orderId: o.id, sequence: i + 1 } });
    }
  });

  afterAll(async () => {
    process.env.DEMO_NOW = previousDemoNow;
    if (prisma) {
      await prisma.trip.deleteMany({ where: { id: { in: tripIds } } });
      await prisma.order.deleteMany({ where: { storeId: { in: STORES } } });
      await prisma.vehicle.deleteMany({ where: { id: { in: ['PB-BUSY', 'PB-FREE'] } } });
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

  it('is closed to other roles and to anonymous callers', async () => {
    await request(app.getHttpServer()).get('/api/plan').expect(401);
    const loader = request.agent(app.getHttpServer());
    await loader
      .post('/api/auth/login')
      .send({ role: 'loader', loginId: 'sampath', depotId: 'Peliyagoda' })
      .expect(200);
    await loader.get(`/api/plan?date=${DAY}`).expect(403);
  });

  it('rejects a malformed date', async () => {
    const agent = await dispatcher();
    await agent.get('/api/plan?date=tomorrow').expect(400);
  });

  it('defaults to tomorrow in Colombo time', async () => {
    const agent = await dispatcher();
    const res = await agent.get('/api/plan').expect(200);
    expect(res.body.date).toBe('2031-03-05');
  });

  it("returns the day's orders, trips and summary", async () => {
    const agent = await dispatcher();
    const { body } = await agent.get(`/api/plan?date=${DAY}`).expect(200);

    expect(body.depotId).toBe('Peliyagoda');
    expect(body.orders.map((o: { storeId: string }) => o.storeId)).toEqual(['PB-C']);
    expect(body.orders[0]).toMatchObject({
      movedCount: 1,
      status: 'waiting',
      chilled: false,
      weightKg: 700,
    });
    expect(body.movedToLater).toHaveLength(1);
    expect(body.movedToLater[0]).toMatchObject({
      storeId: 'PB-D',
      status: 'deferred',
      deferredTo: '2031-03-05',
      deferReason: 'No van left',
    });

    const mine = body.trips.filter((t: { id: string }) => tripIds.includes(t.id));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      plate: null,
      vehicleType: 'van',
      state: 'over',
      overWeight: true,
      overVolume: true,
      weightKg: 1400,
      weightCapKg: 1000,
      volumeM3: 7,
      volumeCapM3: 5,
      budgetMin: 270,
    });
    expect(mine[0].stops.map((s: { sequence: number }) => s.sequence)).toEqual([1, 2]);
    expect(mine[0].minutes).toEqual(expect.any(Number));

    expect(body.summary.overCount).toBeGreaterThanOrEqual(1);
    expect(['volume', 'weight', 'both']).toContain(body.summary.overWhat);
    expect(body.summary.movedToLaterCount).toBe(1);
    expect(body.summary.waitingCount).toBe(1);
    expect(body.summary.vehiclesFree).toBeGreaterThanOrEqual(1);
  });
});
