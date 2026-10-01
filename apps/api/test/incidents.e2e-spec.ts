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
const DAY = '2031-08-12';
const NEXT = '2031-08-13';
const NOW = `${DAY}T10:00:00+05:30`;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const STORES = ['IC-A', 'IC-B', 'IC-C', 'IC-D', 'IC-E', 'IC-F'];
const VEHICLES = ['IC-V1', 'IC-V2', 'IC-V3', 'IC-V4', 'IC-V5', 'IC-V6'];

describe('incidents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let districtId = '';
  let driverId = '';
  let storeUserId = '';
  let createdAllowance = false;
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
        data: {
          name: `IC District ${Date.now()}`,
          depotId: 'Peliyagoda',
          depotToDistrictKm: 20,
          depotToDistrictMin: 30,
          interStopKm: 3,
          interStopMin: 10,
        },
      })
    ).id;
    if (
      !(await prisma.serviceAllowance.findUnique({
        where: { brand_dockType: { brand: 'Fresh', dockType: 'street' } },
      }))
    ) {
      await prisma.serviceAllowance.create({
        data: { brand: 'Fresh', dockType: 'street', minutes: 15 },
      });
      createdAllowance = true;
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
          windowOpenMin: 540,
          windowCloseMin: 900,
        },
      });
    }
    driverId = (
      await prisma.user.create({
        data: {
          loginId: `ic-driver-${Date.now()}`,
          role: 'driver',
          name: 'Ruwan Silva (Driver)',
          depotId: 'Peliyagoda',
          phone: '0771234567',
        },
      })
    ).id;
    storeUserId = (
      await prisma.user.create({
        data: {
          loginId: `ic-store-${Date.now()}`,
          role: 'store',
          name: 'Store B manager',
          storeId: 'IC-B',
        },
      })
    ).id;
    const vehicle = (id: string, extra = {}) =>
      prisma.vehicle.create({
        data: {
          id,
          plate: id,
          depotId: 'Peliyagoda',
          type: 'van',
          temp: 'ambient',
          weightCapKg: 1500,
          volumeCapM3: 8,
          status: 'available',
          ...extra,
        },
      });
    await vehicle('IC-V1', { driverId });
    await vehicle('IC-V2');
    await vehicle('IC-V3', { status: 'out_of_service', returnDate: date('2031-08-15') });
    await vehicle('IC-V4', { weightCapKg: 50 });
    await vehicle('IC-V5');
    await vehicle('IC-V6');

    const trip = async (
      key: string,
      vehicleId: string,
      status: 'published' | 'breakdown',
      stores: string[],
      firstDelivered = false,
    ) => {
      const t = await prisma.trip.create({
        data: {
          vehicleId,
          depotId: 'Peliyagoda',
          brand: 'Fresh',
          districtId,
          serviceDate: date(DAY),
          tripNumber: 1,
          status,
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
        const stop = await prisma.tripStop.create({
          data: {
            tripId: t.id,
            orderId: o.id,
            sequence: ++seq,
            status: firstDelivered && seq === 1 ? 'delivered' : 'upcoming',
            etaMin: 600,
            arrivedAt: firstDelivered && seq === 1 ? new Date(`${DAY}T09:40:00+05:30`) : null,
          },
        });
        ids[`${key}-order${seq}`] = o.id;
        ids[`${key}-stop${seq}`] = stop.id;
      }
    };
    await trip('bd', 'IC-V1', 'breakdown', ['IC-A', 'IC-B', 'IC-C'], true);
    await trip('bd2', 'IC-V5', 'breakdown', ['IC-D', 'IC-E']);
    await trip('load', 'IC-V6', 'published', ['IC-F']);

    for (const [key, tripKey] of [
      ['inc', 'bd'],
      ['inc2', 'bd2'],
    ]) {
      ids[key] = (
        await prisma.incident.create({
          data: {
            type: 'breakdown',
            tripId: ids[tripKey],
            status: 'open',
            timeline: [],
            createdAt: new Date(`${DAY}T09:30:00+05:30`),
          },
        })
      ).id;
    }
    await prisma.loadFlag.create({
      data: {
        stopId: ids['load-stop1'],
        type: 'missing',
        qty: 2,
        note: 'Two cartons not on the dock',
      },
    });
  });

  afterAll(async () => {
    process.env.DEMO_NOW = previousDemoNow;
    if (prisma) {
      await prisma.incident.deleteMany({ where: { trip: { vehicleId: { in: VEHICLES } } } });
      await prisma.trip.deleteMany({ where: { vehicleId: { in: VEHICLES } } });
      await prisma.order.deleteMany({ where: { storeId: { in: STORES } } });
      await prisma.vehicle.deleteMany({ where: { id: { in: VEHICLES } } });
      await prisma.user.deleteMany({ where: { id: { in: [driverId, storeUserId] } } });
      await prisma.store.deleteMany({ where: { id: { in: STORES } } });
      await prisma.district.deleteMany({ where: { id: districtId } });
      if (createdAllowance) {
        await prisma.serviceAllowance.deleteMany({ where: { brand: 'Fresh', dockType: 'street' } });
      }
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

  it('is closed to other roles', async () => {
    await request(app.getHttpServer()).get('/api/incidents').expect(401);
    const loader = request.agent(app.getHttpServer());
    await loader
      .post('/api/auth/login')
      .send({ role: 'loader', loginId: 'sampath', depotId: 'Peliyagoda' })
      .expect(200);
    await loader.get('/api/incidents').expect(403);
  });

  it("lists a breakdown and the loader's missing items as active", async () => {
    const agent = await dispatcher();
    const { body } = await agent.get('/api/incidents').expect(200);
    const bd = body.active.find((i: { id: string }) => i.id === ids.inc);
    expect(bd).toMatchObject({
      kind: 'breakdown',
      title: 'IC-V1 broke down',
      state: 'open',
      stopsAffected: 2,
      brand: 'Fresh',
    });
    expect(bd.line).toContain('Ruwan S. (driver)');
    const missing = body.active.find((i: { id: string }) => i.id === `missing:${ids.load}`);
    expect(missing).toMatchObject({ kind: 'missing_items', title: '2 items short on IC-V6' });
  });

  it('opens the detail with the stops and ranked replacements', async () => {
    const agent = await dispatcher();
    const { body } = await agent.get(`/api/incidents/${ids.inc}`).expect(200);
    expect(body.recoverable).toBe(true);
    expect(body.stops.map((s: { chip: string }) => s.chip)).toEqual(['Done', 'At risk', 'At risk']);
    expect(body.stops[0].note).toBe('Delivered 9:40');
    expect(body.details.driver).toEqual({ name: 'Ruwan Silva', phone: '0771234567' });

    const byId = Object.fromEntries(
      body.replacements.map((r: { vehicleId: string }) => [r.vehicleId, r]),
    );
    expect(byId['IC-V2']).toMatchObject({ available: true, tone: 'good' });
    expect(byId['IC-V3']).toMatchObject({ available: false, verdict: 'Unavailable' });
    expect(byId['IC-V4']).toMatchObject({ available: false });
    expect(byId['IC-V4'].verdict).toContain('Over capacity');
    expect(byId['IC-V1']).toBeUndefined();
    expect(body.replacements[0].available).toBe(true);

    const missing = await agent.get(`/api/incidents/missing:${ids.load}`).expect(200);
    expect(missing.body.recoverable).toBe(false);
    expect(missing.body.stops[0]).toMatchObject({
      chip: '2 short',
      note: 'Two cartons not on the dock',
    });
  });

  it('acknowledges and tells the waiting stores', async () => {
    const agent = await dispatcher();
    const ack = await agent.post(`/api/incidents/${ids.inc}/acknowledge`).expect(200);
    expect(ack.body.state).toBe('acknowledged');
    expect(ack.body.timeline.map((t: { text: string }) => t.text)).toContain(
      'You opened the incident',
    );

    const told = await agent.post(`/api/incidents/${ids.inc}/notify`).expect(200);
    expect(told.body.timeline.at(-1).text).toBe('2 store managers told to expect a delay');
    expect(
      await prisma.notification.count({
        where: { userId: storeUserId, title: 'Delivery delayed' },
      }),
    ).toBe(1);
  });

  it('refuses a replacement that cannot take the stops', async () => {
    const agent = await dispatcher();
    await agent
      .post(`/api/incidents/${ids.inc}/resolve`)
      .send({ action: 'replacement' })
      .expect(400);
    await agent
      .post(`/api/incidents/${ids.inc}/resolve`)
      .send({ action: 'replacement', vehicleId: 'IC-V3' })
      .expect(400);
    await agent
      .post(`/api/incidents/${ids.inc}/resolve`)
      .send({ action: 'replacement', vehicleId: 'IC-V4' })
      .expect(400);
    await agent.post(`/api/incidents/${ids.inc}/resolve`).send({ action: 'bogus' }).expect(400);
  });

  it('sends a replacement and resolves the incident', async () => {
    const agent = await dispatcher();
    const res = await agent
      .post(`/api/incidents/${ids.inc}/resolve`)
      .send({ action: 'replacement', vehicleId: 'IC-V2' })
      .expect(200);
    expect(res.body).toMatchObject({ state: 'resolved', outcome: 'Replaced', recoverable: false });
    expect(res.body.resolution.tripId).toBeTruthy();
    expect(res.body.stops.map((s: { chip: string }) => s.chip)[0]).toBe('Done');
    expect(
      res.body.stops.slice(1).every((s: { chip: string }) => s.chip.startsWith('Now on IC-V2')),
    ).toBe(true);

    const replacement = await prisma.trip.findUniqueOrThrow({
      where: { id: res.body.resolution.tripId },
      include: { stops: { orderBy: { sequence: 'asc' } } },
    });
    expect(replacement).toMatchObject({ vehicleId: 'IC-V2', status: 'published', tripNumber: 1 });
    expect(replacement.stops.map((s) => s.orderId)).toEqual([ids['bd-order2'], ids['bd-order3']]);
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: ids.bd } })).toMatchObject({
      status: 'completed',
    });
    expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: 'IC-V1' } })).toMatchObject({
      status: 'out_of_service',
    });
    expect(
      await prisma.notification.count({
        where: { userId: storeUserId, title: 'Delivery rescheduled' },
      }),
    ).toBe(1);

    const { body } = await agent.get('/api/incidents').expect(200);
    expect(body.resolved.find((i: { id: string }) => i.id === ids.inc)).toMatchObject({
      outcome: 'Replaced',
    });
    expect(body.active.find((i: { id: string }) => i.id === ids.inc)).toBeUndefined();

    await agent.post(`/api/incidents/${ids.inc}/resolve`).send({ action: 'tomorrow' }).expect(400);
    const reopened = await agent.post(`/api/incidents/${ids.inc}/reopen`).expect(200);
    expect(reopened.body.state).toBe('open');
  });

  it('moves the stops to the next day when nothing can take them', async () => {
    const agent = await dispatcher();
    const res = await agent
      .post(`/api/incidents/${ids.inc2}/resolve`)
      .send({ action: 'tomorrow' })
      .expect(200);
    expect(res.body).toMatchObject({ state: 'resolved', outcome: 'Moved' });
    expect(res.body.resolution.tripId).toBeNull();
    expect(res.body.stops.map((s: { chip: string }) => s.chip)).toEqual([
      'Moved to tomorrow',
      'Moved to tomorrow',
    ]);

    const orders = await prisma.order.findMany({
      where: { id: { in: [ids['bd2-order1'], ids['bd2-order2']] } },
    });
    for (const o of orders) {
      expect(o.status).toBe('deferred');
      expect(o.deliveryDate.toISOString().slice(0, 10)).toBe(NEXT);
      expect(o.deferReason).toBe('IC-V5 broke down');
    }
    expect(await prisma.tripStop.count({ where: { tripId: ids.bd2 } })).toBe(0);
  });
});
