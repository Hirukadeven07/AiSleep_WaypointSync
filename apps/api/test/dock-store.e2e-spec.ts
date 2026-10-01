import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

// Needs a seeded database (users only; the CSVs are optional). Builds and removes its own trips.
const DAY = '2026-10-01';
const MORNING = `${DAY}T09:00:00+05:30`;
const EVENING = `${DAY}T16:30:00+05:30`;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('loader dock and store (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunilStoreId: string | null = null;
  const ids = { district: '', loadTrip: '', storeTrip: '', storeStop: '' };
  const previousDemoNow = process.env.DEMO_NOW;

  async function login(body: object) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send(body).expect(200);
    return agent;
  }

  async function order(storeId: string, lines: { name: string; qty: number }[]) {
    return prisma.order.create({
      data: {
        storeId,
        brand: 'Fresh',
        deliveryDate: date(DAY),
        temp: 'chilled',
        status: 'planned',
        units: lines.reduce((s, l) => s + l.qty, 0),
        weightKg: 50,
        volumeM3: 0.2,
        lines: {
          create: lines.map((l) => ({
            ...l,
            pack: 'crate',
            chilled: true,
            unitWeightKg: 5,
            unitVolumeM3: 0.01,
          })),
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
      data: { name: `E2E District ${Date.now()}`, depotId: 'Peliyagoda' },
    });
    ids.district = district.id;
    const store = (id: string) =>
      prisma.store.create({
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
    await store('E2E-A');
    await store('E2E-B');
    await store('E2E-HOME');
    await prisma.vehicle.create({
      data: {
        id: 'E2E-REEFER',
        depotId: 'Peliyagoda',
        type: 'truck',
        temp: 'reefer',
        weightCapKg: 3000,
        volumeCapM3: 20,
      },
    });

    const sunil = await prisma.user.findUniqueOrThrow({ where: { loginId: 'sunil' } });
    sunilStoreId = sunil.storeId;
    await prisma.user.update({ where: { id: sunil.id }, data: { storeId: 'E2E-HOME' } });

    const base = {
      vehicleId: 'E2E-REEFER',
      depotId: 'Peliyagoda',
      brand: 'Fresh' as const,
      districtId: district.id,
      serviceDate: date(DAY),
    };
    const loadTrip = await prisma.trip.create({
      data: { ...base, tripNumber: 1, status: 'published' },
    });
    ids.loadTrip = loadTrip.id;
    const a = await order('E2E-A', [{ name: 'Milk', qty: 4 }]);
    const b = await order('E2E-B', [
      { name: 'Yoghurt', qty: 2 },
      { name: 'Bread', qty: 3 },
    ]);
    await prisma.tripStop.create({ data: { tripId: loadTrip.id, orderId: a.id, sequence: 1 } });
    await prisma.tripStop.create({ data: { tripId: loadTrip.id, orderId: b.id, sequence: 2 } });

    const storeTrip = await prisma.trip.create({
      data: { ...base, tripNumber: 2, status: 'on_road' },
    });
    ids.storeTrip = storeTrip.id;
    const home = await order('E2E-HOME', [
      { name: 'Milk', qty: 6 },
      { name: 'Chicken', qty: 2 },
    ]);
    const stop = await prisma.tripStop.create({
      data: {
        tripId: storeTrip.id,
        orderId: home.id,
        sequence: 1,
        status: 'arrived',
        arrivedAt: new Date(),
      },
    });
    ids.storeStop = stop.id;
  });

  afterAll(async () => {
    process.env.DEMO_NOW = previousDemoNow;
    if (prisma) {
      await prisma.trip.deleteMany({ where: { id: { in: [ids.loadTrip, ids.storeTrip] } } });
      await prisma.order.deleteMany({ where: { storeId: { in: ['E2E-A', 'E2E-B', 'E2E-HOME'] } } });
      await prisma.user.update({ where: { loginId: 'sunil' }, data: { storeId: sunilStoreId } });
      await prisma.vehicle.deleteMany({ where: { id: 'E2E-REEFER' } });
      await prisma.store.deleteMany({ where: { id: { in: ['E2E-A', 'E2E-B', 'E2E-HOME'] } } });
      await prisma.district.deleteMany({ where: { id: ids.district } });
    }
    await app?.close();
  });

  describe('loader', () => {
    it('lists the published trip and loads it last stop first', async () => {
      const loader = await login({ role: 'loader', loginId: 'sampath', depotId: 'Peliyagoda' });
      const queue = await loader.get('/api/loads').expect(200);
      expect(queue.body.map((t: { tripId: string }) => t.tripId)).toContain(ids.loadTrip);

      const started = await loader.post(`/api/loads/${ids.loadTrip}/start`).expect(200);
      expect(started.body.status).toBe('loading');
      expect(started.body.loadOrder.map((s: { sequence: number }) => s.sequence)).toEqual([2, 1]);
      expect(started.body.session.loaderNames).toContain('Sampath (Loader)');
    });

    it('flags a line, locks on a plan change, and departs after acknowledging', async () => {
      const loader = await login({ role: 'loader', loginId: 'sampath', depotId: 'Peliyagoda' });
      const sheet = (await loader.get(`/api/loads/${ids.loadTrip}`).expect(200)).body;
      const stop = sheet.loadOrder[0];
      const flagged = await loader
        .post(`/api/loads/${ids.loadTrip}/flags`)
        .send({ stopId: stop.stopId, orderLineId: stop.lines[0].id, type: 'missing', qty: 1 })
        .expect(200);
      expect(flagged.body.loadOrder[0].flags).toHaveLength(1);

      await prisma.trip.update({ where: { id: ids.loadTrip }, data: { planVersion: 2 } });
      const locked = (await loader.get(`/api/loads/${ids.loadTrip}`).expect(200)).body;
      expect(locked.lock.locked).toBe(true);

      const stale = await loader
        .post(`/api/loads/${ids.loadTrip}/depart`)
        .send({ planVersion: 1 })
        .expect(409);
      expect(stale.body.reason).toBe('PLAN_VERSION_STALE');
      const blocked = await loader
        .post(`/api/loads/${ids.loadTrip}/depart`)
        .send({ planVersion: 2 })
        .expect(409);
      expect(blocked.body.reason).toBe('PLAN_LOCKED');

      const acked = await loader.post(`/api/loads/${ids.loadTrip}/ack`).expect(200);
      expect(acked.body.lock.locked).toBe(false);

      const departed = await loader
        .post(`/api/loads/${ids.loadTrip}/depart`)
        .send({ planVersion: 2 })
        .expect(200);
      expect(departed.body.flags).toHaveLength(1);
      const trip = await prisma.trip.findUniqueOrThrow({ where: { id: ids.loadTrip } });
      expect(trip.status).toBe('on_road');
    });

    it('keeps the store out of loader routes', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      await store.get('/api/loads').expect(403);
    });
  });

  describe('store', () => {
    it('takes orders before 16:00 and refuses them after', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      const placed = await store
        .post('/api/store/orders')
        .send({ lines: [{ catalogueId: 'F-MILK', qty: 2 }] })
        .expect(201);
      expect(placed.body.deliveryDate).toBe('2026-10-02');
      expect(placed.body.status).toBe('waiting');

      process.env.DEMO_NOW = EVENING;
      try {
        const late = await store
          .post('/api/store/orders')
          .send({ lines: [{ catalogueId: 'F-MILK', qty: 2 }] })
          .expect(409);
        expect(late.body.reason).toBe('AFTER_CUTOFF');
      } finally {
        process.env.DEMO_NOW = MORNING;
      }
    });

    it('confirms receipt with a missing line, then refuses a second receipt', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      const home = (await store.get('/api/store/home').expect(200)).body;
      expect(home.delivery.stopId).toBe(ids.storeStop);

      const delivery = (await store.get(`/api/store/deliveries/${ids.storeStop}`).expect(200)).body;
      const [first, second] = delivery.lines;
      const confirmed = await store
        .post(`/api/store/deliveries/${ids.storeStop}/receipt`)
        .send({
          lines: [
            { orderLineId: first.id, receivedQty: first.qty },
            { orderLineId: second.id, receivedQty: second.qty - 1, issue: 'missing' },
          ],
          chilledWasCold: true,
        })
        .expect(200);
      expect(confirmed.body.status).toBe('confirmed');
      expect(confirmed.body.storeConfirmedAt).toBeTruthy();

      const stop = await prisma.tripStop.findUniqueOrThrow({
        where: { id: ids.storeStop },
        include: { order: true },
      });
      expect(stop.order.status).toBe('partial');

      const again = await store
        .post(`/api/store/deliveries/${ids.storeStop}/receipt`)
        .send({ lines: [] })
        .expect(409);
      expect(again.body.reason).toBe('RECEIPT_NOT_READY');
    });
  });
});
