import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

jest.setTimeout(60_000);

// Needs a seeded database (users only). Builds and removes its own rows on a date nothing else uses.
const DAY = '2031-07-08';
const NOW = `${DAY}T10:00:00+05:30`;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const STORES = ['FL-A', 'FL-B', 'FL-C', 'FL-D'];
const VEHICLES = ['FL-V1', 'FL-V2', 'FL-V3', 'FL-V4'];
// Added through POST /api/fleet; kept out of VEHICLES so the listing checks stay as they are.
const ADDED = 'FL NEW-01';

describe('fleet (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let districtId = '';
  let driverId = '';
  const previousDemoNow = process.env.DEMO_NOW;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DEMO_NOW = NOW;
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
        data: { name: `FL District ${Date.now()}`, depotId: 'depo1' },
      })
    ).name;
    for (const id of STORES) {
      await prisma.store.create({
        data: {
          id,
          displayName: `Store ${id}`,
          brand: 'Fresh',
          districtId,
          depotId: 'depo1',
          dockType: 'street',
          windowOpenMin: 540,
          windowCloseMin: 900,
        },
      });
    }
    const driver = await prisma.user.create({
      data: {
        loginId: `fl-driver-${Date.now()}`,
        role: 'driver',
        name: 'Kasun Rathnayake (Driver)',
        depotId: 'depo1',
      },
    });
    driverId = driver.id;
    const profile = await prisma.driver.create({ data: { userId: driver.id } });
    await prisma.driverPhone.create({
      data: { driverId: profile.id, phoneNumber: '0771112233' },
    });
    const vehicle = (id: string, extra = {}) =>
      prisma.vehicle.create({
        data: {
          id,
          numberPlate: id,
          depotId: 'depo1',
          type: 'van',
          temp: 'ambient',
          weightCapKg: 1500,
          volumeCapM3: 8,
          weeklyFuelQuotaL: 50,
          kmPerL: 8,
          status: 'available',
          ...extra,
        },
      });
    await vehicle('FL-V1');
    await vehicle('FL-V2');
    await vehicle('FL-V3');
    await vehicle('FL-V4', {
      status: 'out_of_service',
      outOfServiceReason: 'Brake service — rear pads',
      returnDate: new Date('2031-07-10T14:30:00+05:30'),
    });

    const trip = async (
      key: string,
      vehicleId: string,
      status: 'planning' | 'published' | 'on_road',
      stores: string[],
      extra = {},
    ) => {
      const t = await prisma.trip.create({
        data: {
          vehicleId,
          depotId: 'depo1',
          brand: 'Fresh',
          districtId,
          serviceDate: date(DAY),
          tripNumber: 1,
          status,
          ...extra,
        },
      });
      ids[key] = t.id;
      let seq = 0;
      for (const storeId of stores) {
        const o = await prisma.order.create({
          data: {
            storeId,
            brand: 'Fresh',
            deliveryDate: date(DAY),
            temp: 'ambient',
            status: 'planned',
            units: 1,
            weightKg: 100,
            volumeM3: 0.5,
          },
        });
        ids[`${key}-order${seq}`] = o.id;
        await prisma.tripStop.create({
          data: {
            tripId: t.id,
            orderId: o.id,
            sequence: ++seq,
            status: key === 'road' && seq === 1 ? 'delivered' : 'upcoming',
            etaMin: 600,
          },
        });
      }
    };
    await trip('road', 'FL-V1', 'on_road', ['FL-A', 'FL-B'], { assignedDriverId: driverId });
    await trip('planned', 'FL-V3', 'published', ['FL-C', 'FL-D']);
  });

  afterAll(async () => {
    process.env.DEMO_NOW = previousDemoNow;
    if (prisma) {
      await prisma.trip.deleteMany({ where: { vehicleId: { in: VEHICLES } } });
      await prisma.order.deleteMany({ where: { storeId: { in: STORES } } });
      await prisma.vehicle.deleteMany({ where: { id: { in: [...VEHICLES, ADDED] } } });
      await prisma.user.deleteMany({ where: { id: driverId } });
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
  // The response is checked field by field below, so rows are left loosely typed here.
  const mine = (body: { vehicles: Record<string, any>[] }) =>
    body.vehicles.filter((v) => VEHICLES.includes(v.id));

  it('is closed to other roles', async () => {
    await request(app.getHttpServer()).get('/api/fleet').expect(401);
    const loader = request.agent(app.getHttpServer());
    await loader
      .post('/api/auth/login')
      .send({ role: 'loader', secret: '123456', depotId: 'depo1' })
      .expect(200);
    await loader.get('/api/fleet').expect(403);
  });

  it('lists each vehicle with what it is doing today', async () => {
    const agent = await dispatcher();
    const { body } = await agent.get('/api/fleet').expect(200);
    const v = Object.fromEntries(mine(body).map((x) => [x.id, x]));

    expect(v['FL-V1']).toMatchObject({
      status: 'on_road',
      driverName: 'Kasun Rathnayake',
      driverPhone: '0771112233',
      type: 'van',
      weightCapKg: 1500,
      today: 'Trip 1 · 1/2 delivered',
    });
    expect(v['FL-V1'].trips).toEqual([
      expect.objectContaining({ tripNumber: 1, stopsDone: 1, stopsTotal: 2 }),
    ]);
    expect(v['FL-V2']).toMatchObject({ status: 'at_depot', today: 'No trips today', trips: [] });
    expect(v['FL-V3']).toMatchObject({ status: 'at_depot', today: 'Trip 1 waiting to load' });
    expect(v['FL-V3'].plannedTrips).toEqual([{ tripNumber: 1, stops: 2 }]);
    expect(v['FL-V4']).toMatchObject({
      status: 'out_of_service',
      today: 'Brake service · back Thu 14:30',
      outOfServiceReason: 'Brake service — rear pads',
      returnDate: '2031-07-10T09:00:00.000Z',
    });
    expect(body.counts.all).toBe(body.vehicles.length);
    expect(body.counts.outOfService).toBeGreaterThanOrEqual(1);
    expect(v['FL-V1'].fuel).toMatchObject({ quotaL: 50 });
  });

  it('takes a vehicle out of service and sends its planned orders back to Planning', async () => {
    const agent = await dispatcher();
    const res = await agent
      .post('/api/fleet/FL-V3/out-of-service')
      .send({ reason: 'Brake service', returnDate: '2031-07-11T14:30:00+05:30', note: 'Front pads' })
      .expect(200);
    expect(res.body).toMatchObject({ tripsReturned: 1, ordersReturned: 2 });
    expect(res.body.vehicle).toMatchObject({
      status: 'out_of_service',
      outOfServiceReason: 'Brake service — Front pads',
      returnDate: '2031-07-11T09:00:00.000Z',
      today: 'Brake service · back Fri 14:30',
    });

    expect(await prisma.trip.count({ where: { id: ids.planned } })).toBe(0);
    const orders = await prisma.order.findMany({
      where: { id: { in: [ids['planned-order0'], ids['planned-order1']] } },
    });
    expect(orders.map((o) => o.status)).toEqual(['waiting', 'waiting']);

    await agent
      .post('/api/fleet/FL-V3/out-of-service')
      .send({ reason: 'Brake service', returnDate: '2031-07-11T14:30:00+05:30' })
      .expect(400);
    await agent.post('/api/fleet/FL-V3/out-of-service').send({ reason: 'x' }).expect(400);
    await agent
      .post('/api/fleet/NOPE/out-of-service')
      .send({ reason: 'x', returnDate: '2031-07-11T14:30:00+05:30' })
      .expect(404);
  });

  it('puts a vehicle back in service', async () => {
    const agent = await dispatcher();
    const res = await agent.post('/api/fleet/FL-V4/back-in-service').expect(200);
    expect(res.body).toMatchObject({
      status: 'at_depot',
      outOfServiceReason: null,
      returnDate: null,
    });
  });

  it('accepts a reason with no return time and rejects a date that has no time', async () => {
    const agent = await dispatcher();
    await agent
      .post('/api/fleet/FL-V2/out-of-service')
      .send({ reason: 'Tyre replacement', returnDate: '2031-07-11' })
      .expect(400);
    const res = await agent
      .post('/api/fleet/FL-V2/out-of-service')
      .send({ reason: 'Tyre replacement' })
      .expect(200);
    expect(res.body.vehicle).toMatchObject({
      status: 'out_of_service',
      outOfServiceReason: 'Tyre replacement',
      returnDate: null,
      today: 'Tyre replacement',
    });
  });

  it('leaves a trip that is already on the road alone when its vehicle is marked out', async () => {
    const agent = await dispatcher();
    const res = await agent
      .post('/api/fleet/FL-V1/out-of-service')
      .send({ reason: 'Engine repair', returnDate: '2031-07-12T08:00:00+05:30' })
      .expect(200);
    expect(res.body).toMatchObject({ tripsReturned: 0, ordersReturned: 0 });
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: ids.road } })).toMatchObject({
      status: 'on_road',
    });
  });

  it('adds a vehicle and refuses a plate already in use or a bad form', async () => {
    const agent = await dispatcher();
    const added = await agent
      .post('/api/fleet')
      .send({
        plate: '  fl   new-01 ',
        type: 'van',
        temp: 'ambient',
        weightCapKg: 1200,
        volumeCapM3: 8,
        kmPerL: 11,
      })
      .expect(200);
    expect(added.body).toMatchObject({
      id: ADDED,
      plate: ADDED,
      type: 'van',
      temp: 'ambient',
      weightCapKg: 1200,
      volumeCapM3: 8,
      status: 'at_depot',
      homeDepot: 'depo1',
    });
    const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: ADDED } });
    expect(row).toMatchObject({ depotId: 'depo1', kmPerL: 11, weeklyFuelQuotaL: null });
    const list = await agent.get('/api/fleet').expect(200);
    expect(list.body.vehicles.map((v: { id: string }) => v.id)).toContain(ADDED);

    const again = await agent
      .post('/api/fleet')
      .send({
        plate: 'FL NEW-01',
        type: 'truck',
        temp: 'reefer',
        weightCapKg: 3000,
        volumeCapM3: 15,
      })
      .expect(409);
    expect(again.body.message).toMatch(/already exists/);
    await agent
      .post('/api/fleet')
      .send({ plate: 'FL-X', type: 'bus', temp: 'ambient', weightCapKg: 0, volumeCapM3: 15 })
      .expect(400);
    await agent.post('/api/fleet').send({ type: 'truck', temp: 'reefer' }).expect(400);
  });
});
