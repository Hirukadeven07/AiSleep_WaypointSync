import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

jest.setTimeout(60_000);

/**
 * Sehara's part of the live day: not synced since departure, completed trips, driver SOS,
 * logging a breakdown and deferring one chosen store. Needs a seeded database (users only).
 * Builds and removes its own rows on a date nothing else uses.
 */
const DAY = '2031-07-15';
const NOW = `${DAY}T09:30:00+05:30`;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+05:30`);
const STORES = ['SH-A', 'SH-B', 'SH-C', 'SH-D', 'SH-E', 'SH-F', 'SH-G', 'SH-H', 'SH-I', 'SH-J'];
const VEHICLES = ['SH-V1', 'SH-V2', 'SH-V3', 'SH-V4', 'SH-V5', 'SH-V6'];
const STORE_LOGIN = 'sh-store-b';

describe("Sehara's dispatch work (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let districtId = '';
  let addedAllowance = false;
  const previousDemoNow = process.env.DEMO_NOW;
  const trip: Record<string, string> = {};
  let sosId = '';

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
          name: `SH District ${Date.now()}`,
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
        data: { brand: 'Fresh', dockType: 'street', minutes: 20 },
      });
      addedAllowance = true;
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
    await prisma.user.create({
      data: { loginId: STORE_LOGIN, role: 'store', name: 'SH Store B', storeId: 'SH-B' },
    });
    for (const id of VEHICLES) {
      await prisma.vehicle.create({
        data: {
          id,
          plate: id,
          depotId: 'Peliyagoda',
          type: 'truck',
          temp: 'ambient',
          weightCapKg: 3000,
          volumeCapM3: 18,
          status: 'available',
        },
      });
    }

    let store = 0;
    const makeTrip = async (
      key: string,
      vehicleId: string,
      status: 'published' | 'on_road',
      stops: { status: 'upcoming' | 'confirmed'; etaMin?: number }[],
      extra: Record<string, unknown> = {},
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
          ...extra,
        },
      });
      trip[key] = t.id;
      let seq = 0;
      for (const s of stops) {
        const storeId = STORES[store++];
        const order = await prisma.order.create({
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
            orderId: order.id,
            sequence: ++seq,
            status: s.status,
            etaMin: s.etaMin ?? 600,
            arrivedAt: s.status === 'confirmed' ? at('09:00') : null,
            storeConfirmedAt: s.status === 'confirmed' ? at('09:05') : null,
          },
        });
        trip[`${key}-stop${seq}`] = stop.id;
        trip[`${key}-order${seq}`] = order.id;
      }
    };

    // SH-A, SH-B, SH-C: on the road, left 40 min ago, never synced. Gets the breakdown.
    await makeTrip(
      'quiet',
      'SH-V1',
      'on_road',
      [{ status: 'upcoming' }, { status: 'upcoming' }, { status: 'upcoming' }],
      { startingTime: at('08:50') },
    );
    // SH-D: every stop signed for, trip not closed yet.
    await makeTrip('alldone', 'SH-V3', 'on_road', [{ status: 'confirmed' }], {
      startingTime: at('08:30'),
    });
    // SH-E: has not left yet; cannot break down.
    await makeTrip('waiting', 'SH-V4', 'published', [{ status: 'upcoming' }]);
    // SH-F: on the road, synced a minute ago, with an SOS from its driver.
    await makeTrip('sos', 'SH-V5', 'on_road', [{ status: 'upcoming' }], {
      startingTime: at('09:00'),
    });

    // SH-G, SH-H: on the road; one of its stops moves to the trip still at the depot (SH-E).
    await makeTrip('mover', 'SH-V6', 'on_road', [{ status: 'upcoming' }, { status: 'upcoming' }], {
      startingTime: at('09:25'),
    });

    const kasun = await prisma.user.findUniqueOrThrow({ where: { loginId: 'kasun' } });
    await prisma.driverEvent.create({
      data: {
        clientId: `sh-${Date.now()}`,
        driverId: kasun.id,
        tripId: trip.sos,
        type: 'ROAD_ISSUE',
        payload: {},
        createdOnPhoneAt: at('09:29'),
        appliedAt: at('09:29'),
      },
    });
    const driver = await prisma.driver.upsert({
      where: { userId: kasun.id },
      create: { userId: kasun.id },
      update: {},
    });
    sosId = (
      await prisma.driverIncident.create({
        data: {
          driverId: driver.id,
          tripId: trip.sos,
          vehicleId: 'SH-V5',
          incidentType: 'sos',
          severity: 'high',
          message: 'Flat tyre',
          raisedAt: at('09:20'),
        },
      })
    ).id;
  });

  afterAll(async () => {
    process.env.DEMO_NOW = previousDemoNow;
    if (prisma) {
      await prisma.driverIncident.deleteMany({ where: { vehicleId: { in: VEHICLES } } });
      await prisma.driverEvent.deleteMany({ where: { clientId: { startsWith: 'sh-' } } });
      await prisma.incident.deleteMany({ where: { trip: { vehicleId: { in: VEHICLES } } } });
      await prisma.trip.deleteMany({ where: { vehicleId: { in: VEHICLES } } });
      await prisma.order.deleteMany({ where: { storeId: { in: STORES } } });
      await prisma.notification.deleteMany({ where: { user: { loginId: STORE_LOGIN } } });
      await prisma.user.deleteMany({ where: { loginId: STORE_LOGIN } });
      await prisma.vehicle.deleteMany({ where: { id: { in: VEHICLES } } });
      await prisma.store.deleteMany({ where: { id: { in: STORES } } });
      await prisma.district.deleteMany({ where: { id: districtId } });
      if (addedAllowance) {
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

  async function live() {
    const agent = await dispatcher();
    const { body } = await agent.get('/api/dispatch/live').expect(200);
    const byId = (key: string) => body.trips.find((t: { id: string }) => t.id === trip[key]);
    return { body, byId };
  }

  it('shows a trip that never synced since departure as not synced, with no guessed place', async () => {
    const { byId } = await live();
    expect(byId('quiet')).toMatchObject({
      live: 'not_synced',
      notSyncedMin: 40,
      lastSyncAt: null,
      lastPlace: null,
      departedAt: at('08:50').toISOString(),
    });
  });

  it('shows a trip whose stops are all done as completed', async () => {
    const { byId } = await live();
    expect(byId('alldone').live).toBe('completed');
  });

  it("puts a driver's SOS in Needs attention and the open-incidents count, until dispatch handles it", async () => {
    const before = await live();
    const sos = before.body.attention.find(
      (a: { kind: string; incidentId?: string }) => a.kind === 'sos' && a.incidentId === sosId,
    );
    expect(sos).toMatchObject({ tripId: trip.sos, incidentId: sosId });
    expect(sos.text).toContain('Flat tyre');
    expect(before.byId('sos')).toMatchObject({ openSos: 1, hasIssue: true, live: 'on_time' });
    const openBefore = before.body.kpis.openIncidents;

    const agent = await dispatcher();
    await agent.post(`/api/dispatch/sos/${sosId}/resolve`).send({}).expect(200);
    const row = await prisma.driverIncident.findUniqueOrThrow({ where: { id: sosId } });
    expect(row.resolvedAt).not.toBeNull();

    const after = await live();
    expect(after.body.attention.some((a: { incidentId?: string }) => a.incidentId === sosId)).toBe(
      false,
    );
    expect(after.body.kpis.openIncidents).toBe(openBefore - 1);
  });

  it('moves a stop the driver has not reached to a trip still at the depot', async () => {
    const agent = await dispatcher();
    const opts = await agent.get(`/api/dispatch/trips/${trip.mover}/move-options`).expect(200);
    expect(opts.body.stops.map((s: { id: string }) => s.id)).toEqual([
      trip['mover-stop1'],
      trip['mover-stop2'],
    ]);
    const target = opts.body.targets.find((t: { tripId: string }) => t.tripId === trip.waiting);
    expect(target.fits[trip['mover-stop2']]).toEqual({ ok: true, reason: null });
    // A trip on the road cannot take stops.
    expect(opts.body.targets.some((t: { tripId: string }) => t.tripId === trip.sos)).toBe(false);

    const res = await agent
      .post(`/api/dispatch/trips/${trip.mover}/move-stop`)
      .send({ stopId: trip['mover-stop2'], toTripId: trip.waiting })
      .expect(200);
    expect(res.body).toMatchObject({ toTripId: trip.waiting, toLabel: 'SH-V4 · Trip 1' });

    const moved = await prisma.tripStop.findUniqueOrThrow({ where: { id: trip['mover-stop2'] } });
    expect(moved.tripId).toBe(trip.waiting);
    const [from, to] = await Promise.all([
      prisma.trip.findUniqueOrThrow({ where: { id: trip.mover } }),
      prisma.trip.findUniqueOrThrow({ where: { id: trip.waiting } }),
    ]);
    expect(from.planVersion).toBe(2);
    expect(to.planVersion).toBe(2);

    // Not to a trip on the road.
    await agent
      .post(`/api/dispatch/trips/${trip.mover}/move-stop`)
      .send({ stopId: trip['mover-stop1'], toTripId: trip.sos })
      .expect(400);
  });

  it('refuses a breakdown on a trip that has not left', async () => {
    const agent = await dispatcher();
    await agent.post('/api/incidents/breakdown').send({ tripId: trip.waiting }).expect(400);
  });

  it('logs a breakdown, defers the chosen store with a dated notice, and moves the rest', async () => {
    const agent = await dispatcher();
    const logged = await agent
      .post('/api/incidents/breakdown')
      .send({ tripId: trip.quiet, note: 'Engine overheating' })
      .expect(200);
    expect(logged.body).toMatchObject({ kind: 'breakdown', recoverable: true });
    expect(logged.body.subtitle).toContain('by dispatch');
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.quiet } })).status).toBe(
      'breakdown',
    );
    // Logging it again returns the same incident.
    const again = await agent
      .post('/api/incidents/breakdown')
      .send({ tripId: trip.quiet })
      .expect(200);
    expect(again.body.id).toBe(logged.body.id);

    const { byId } = await live();
    expect(byId('quiet').live).toBe('breakdown');

    const res = await agent
      .post(`/api/incidents/${logged.body.id}/resolve`)
      .send({
        action: 'defer_one',
        vehicleId: 'SH-V2',
        deferStopId: trip['quiet-stop2'],
        reason: 'The truck broke down on the road',
      })
      .expect(200);
    expect(res.body).toMatchObject({ state: 'resolved', outcome: 'Split' });

    const deferred = await prisma.order.findUniqueOrThrow({ where: { id: trip['quiet-order2'] } });
    expect(deferred).toMatchObject({
      status: 'deferred',
      deferReason: 'The truck broke down on the road',
    });
    expect(deferred.deliveryDate.toISOString().slice(0, 10)).toBe('2031-07-16');
    expect(deferred.movedFromDate?.toISOString().slice(0, 10)).toBe(DAY);

    const moved = await prisma.tripStop.findMany({
      where: { id: { in: [trip['quiet-stop1'], trip['quiet-stop3']] } },
      include: { trip: true },
    });
    expect(moved.map((s) => s.trip.vehicleId)).toEqual(['SH-V2', 'SH-V2']);

    const notices = await prisma.notification.findMany({
      where: { user: { loginId: STORE_LOGIN } },
    });
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe('Delivery moved to Wed 16 Jul');
    expect(notices[0].body).toContain('Reason: The truck broke down on the road.');
    expect(notices[0].body).toContain('Wed 16 Jul');
  });

  it('needs a store to defer for defer_one', async () => {
    const agent = await dispatcher();
    // A fresh breakdown on the SOS trip (one stop): defer_one needs at least two stops.
    const logged = await agent
      .post('/api/incidents/breakdown')
      .send({ tripId: trip.sos })
      .expect(200);
    await agent
      .post(`/api/incidents/${logged.body.id}/resolve`)
      .send({ action: 'defer_one', vehicleId: 'SH-V4' })
      .expect(400);
  });
});
