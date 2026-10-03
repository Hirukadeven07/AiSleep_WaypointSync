import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

// Needs a seeded database (users only). Builds and removes its own stores, vehicle and trip.
const DAY = '2026-10-01';
const MORNING = `${DAY}T09:00:00+05:30`;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const STORES = ['E2E-PRG-1', 'E2E-PRG-2', 'E2E-PRG-HOME'];

describe('store stops-away tracking (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunilStoreId: string | null = null;
  const ids = { district: '', trip: '', first: '', second: '', home: '' };
  const previousDemoNow = process.env.DEMO_NOW;

  async function login(body: object) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send(body).expect(200);
    return agent;
  }

  async function order(storeId: string) {
    return prisma.order.create({
      data: {
        storeId,
        brand: 'Fresh',
        deliveryDate: date(DAY),
        temp: 'ambient',
        status: 'planned',
        units: 2,
        weightKg: 10,
        volumeM3: 0.1,
        lines: {
          create: [{ name: 'Bread', qty: 2, pack: 'crate', unitWeightKg: 5, unitVolumeM3: 0.05 }],
        },
      },
    });
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

    const district = await prisma.district.create({
      data: { name: `E2E Progress ${Date.now()}`, depotId: 'Peliyagoda' },
    });
    ids.district = district.id;
    for (const id of STORES) {
      await prisma.store.create({
        data: {
          id,
          displayName: id,
          brand: 'Fresh',
          districtId: district.id,
          depotId: 'Peliyagoda',
          dockType: 'street',
          windowOpenMin: 300,
          windowCloseMin: 480,
        },
      });
    }
    await prisma.vehicle.create({
      data: {
        id: 'E2E-PRG-VAN',
        depotId: 'Peliyagoda',
        type: 'van',
        temp: 'ambient',
        weightCapKg: 1000,
        volumeCapM3: 8,
      },
    });
    const sunil = await prisma.user.findUniqueOrThrow({ where: { loginId: 'sunil' } });
    sunilStoreId = sunil.storeId;
    await prisma.user.update({ where: { id: sunil.id }, data: { storeId: 'E2E-PRG-HOME' } });

    const trip = await prisma.trip.create({
      data: {
        vehicleId: 'E2E-PRG-VAN',
        depotId: 'Peliyagoda',
        brand: 'Fresh',
        districtId: district.id,
        serviceDate: date(DAY),
        tripNumber: 1,
        status: 'on_road',
      },
    });
    ids.trip = trip.id;
    const [a, b, home] = [
      await order('E2E-PRG-1'),
      await order('E2E-PRG-2'),
      await order('E2E-PRG-HOME'),
    ];
    ids.first = (
      await prisma.tripStop.create({
        data: { tripId: trip.id, orderId: a.id, sequence: 1, status: 'delivered' },
      })
    ).id;
    ids.second = (
      await prisma.tripStop.create({
        data: { tripId: trip.id, orderId: b.id, sequence: 2, status: 'upcoming' },
      })
    ).id;
    ids.home = (
      await prisma.tripStop.create({
        data: { tripId: trip.id, orderId: home.id, sequence: 3, status: 'upcoming' },
      })
    ).id;
  });

  afterAll(async () => {
    process.env.DEMO_NOW = previousDemoNow;
    if (prisma) {
      await prisma.trip.deleteMany({ where: { id: ids.trip } });
      await prisma.order.deleteMany({ where: { storeId: { in: STORES } } });
      await prisma.user.update({ where: { loginId: 'sunil' }, data: { storeId: sunilStoreId } });
      await prisma.vehicle.deleteMany({ where: { id: 'E2E-PRG-VAN' } });
      await prisma.store.deleteMany({ where: { id: { in: STORES } } });
      await prisma.district.deleteMany({ where: { id: ids.district } });
    }
    await app?.close();
  });

  it('counts the stops still ahead of this store and hides the other stores', async () => {
    const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
    const delivery = (await store.get(`/api/store/deliveries/${ids.home}`).expect(200)).body;
    expect(delivery.stopsAway).toBe(1);
    expect(delivery.track).toEqual([
      { sequence: 1, status: 'delivered', isYou: false },
      { sequence: 2, status: 'upcoming', isYou: false },
      { sequence: 3, status: 'upcoming', isYou: true },
    ]);
    // Only sequence, status and isYou: no other store's name or id.
    for (const t of delivery.track)
      expect(Object.keys(t).sort()).toEqual(['isYou', 'sequence', 'status']);
    expect(JSON.stringify(delivery.track)).not.toMatch(/E2E-PRG-[12]/);

    // The list and the home card carry the same fields.
    const list = (await store.get('/api/store/deliveries').expect(200)).body;
    expect(list.find((d: { stopId: string }) => d.stopId === ids.home).stopsAway).toBe(1);
  });

  it('reaches 0 once the stop before is delivered', async () => {
    await prisma.tripStop.update({ where: { id: ids.second }, data: { status: 'delivered' } });
    const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
    const delivery = (await store.get(`/api/store/deliveries/${ids.home}`).expect(200)).body;
    expect(delivery.stopsAway).toBe(0);
    expect(delivery.track.filter((t: { isYou: boolean }) => t.isYou)).toHaveLength(1);
  });

  it('is null while the trip is not on the road', async () => {
    await prisma.trip.update({ where: { id: ids.trip }, data: { status: 'loading' } });
    const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
    const delivery = (await store.get(`/api/store/deliveries/${ids.home}`).expect(200)).body;
    expect(delivery.stopsAway).toBeNull();
    expect(delivery.track).toHaveLength(3);
  });
});
