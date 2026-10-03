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
const DAY = '2031-06-10';
const NOW = `${DAY}T10:45:00+05:30`;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const STORES = ['DL-A', 'DL-B', 'DL-C', 'DL-D', 'DL-E', 'DL-F', 'DL-G', 'DL-H', 'DL-I', 'DL-J'];
const VEHICLES = ['DL-V1', 'DL-V2', 'DL-V3', 'DL-V4', 'DL-V5', 'DL-V6', 'DL-V7'];

describe('live day (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let districtId = '';
  const previousDemoNow = process.env.DEMO_NOW;
  const trip: Record<string, string> = {};

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
        data: { name: `DL District ${Date.now()}`, depotId: 'depo1' },
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
          windowCloseMin: 600,
        },
      });
    }
    for (const id of VEHICLES) {
      await prisma.vehicle.create({
        data: {
          id,
          numberPlate: id,
          depotId: 'depo1',
          type: 'van',
          temp: 'ambient',
          weightCapKg: 1500,
          volumeCapM3: 8,
          status: 'available',
        },
      });
    }

    let store = 0;
    const makeTrip = async (
      key: string,
      vehicleId: string,
      status: 'published' | 'loading' | 'on_road' | 'breakdown' | 'completed',
      stops: { status: 'upcoming' | 'delivered'; etaMin?: number; arrivedAt?: Date }[],
      extra: Record<string, unknown> = {},
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
            status: s.status === 'delivered' ? 'delivered' : 'planned',
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
            etaMin: s.etaMin ?? null,
            arrivedAt: s.arrivedAt ?? null,
          },
        });
        trip[`${key}-stop${seq}`] = stop.id;
      }
    };

    const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+05:30`);
    // On time: one delivered, the next ETA inside its window.
    await makeTrip('ontime', 'DL-V1', 'on_road', [
      { status: 'delivered', arrivedAt: at('09:42') },
      { status: 'upcoming', etaMin: 560 },
    ]);
    // Late: the ETA is 25 minutes past the end of the window.
    await makeTrip('late', 'DL-V2', 'on_road', [{ status: 'upcoming', etaMin: 625 }]);
    await makeTrip('broke', 'DL-V3', 'breakdown', [
      { status: 'delivered', arrivedAt: at('09:05') },
      { status: 'upcoming' },
    ]);
    // Not synced: last event from the phone was 47 minutes ago.
    await makeTrip('sync', 'DL-V4', 'on_road', [{ status: 'upcoming', etaMin: 580 }]);
    await makeTrip(
      'done',
      'DL-V5',
      'completed',
      [{ status: 'delivered', arrivedAt: at('08:00') }],
      {
        endingTime: at('10:20'),
      },
    );
    await makeTrip('loading', 'DL-V6', 'loading', [{ status: 'upcoming' }]);
    await makeTrip('assigned', 'DL-V7', 'published', [{ status: 'upcoming' }]);
    // The same van's second trip, waiting for its turn.
    await makeTrip('next', 'DL-V5', 'published', [{ status: 'upcoming' }], { tripNumber: 2 });

    const kasun = await prisma.user.findUniqueOrThrow({ where: { loginId: 'kasun' } });
    await prisma.driverEvent.create({
      data: {
        clientId: `dl-${Date.now()}`,
        driverId: kasun.id,
        tripId: trip.sync,
        type: 'STOP_ARRIVED',
        payload: {},
        createdOnPhoneAt: at('09:58'),
        appliedAt: at('09:58'),
      },
    });
    await prisma.loadFlag.create({
      data: { stopId: trip['loading-stop1'], type: 'missing', qty: 2 },
    });
    await prisma.storeReceipt.create({
      data: {
        stopId: trip['ontime-stop1'],
        lineResults: [{ name: 'Yoghurt cups', orderedQty: 12, receivedQty: 11, issue: 'damaged' }],
      },
    });
    await prisma.tripStop.update({
      where: { id: trip['ontime-stop1'] },
      data: { storeConfirmedAt: at('09:45') },
    });
  });

  afterAll(async () => {
    process.env.DEMO_NOW = previousDemoNow;
    if (prisma) {
      await prisma.driverEvent.deleteMany({ where: { clientId: { startsWith: 'dl-' } } });
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

  it('is closed to other roles and anonymous callers', async () => {
    await request(app.getHttpServer()).get('/api/dispatch/live').expect(401);
    const loader = request.agent(app.getHttpServer());
    await loader
      .post('/api/auth/login')
      .send({ role: 'loader', loginId: 'sampath', depotId: 'depo1' })
      .expect(200);
    await loader.get('/api/dispatch/live').expect(403);
  });

  it("shows each trip's live status", async () => {
    const agent = await dispatcher();
    const { body } = await agent.get('/api/dispatch/live').expect(200);
    expect(body.date).toBe(DAY);
    const byId = (id: string) => body.trips.find((t: { id: string }) => t.id === trip[id]);

    expect(byId('ontime')).toMatchObject({
      live: 'on_time',
      stopsDone: 1,
      stopsTotal: 2,
      lateMin: null,
      lastPlace: 'Store DL-A',
    });
    expect(byId('late')).toMatchObject({ live: 'late', lateMin: 25 });
    expect(byId('broke')).toMatchObject({ live: 'breakdown', hasIssue: true });
    expect(byId('sync')).toMatchObject({ live: 'not_synced', notSyncedMin: 47, hasIssue: true });
    expect(byId('done')).toMatchObject({ live: 'completed', stopsDone: 1 });
    expect(byId('done').backAt).toBeTruthy();
    expect(byId('loading')).toMatchObject({ live: 'loading', missingCount: 2, hasIssue: true });
    expect(byId('assigned')).toMatchObject({ live: 'assigned' });
    expect(byId('ontime').stops[0]).toMatchObject({ confirmed: true, issueNote: '1 item damaged' });
    expect(byId('late').stops[0]).toMatchObject({ missBy: 25 });
    expect(byId('done').nextTrip).toEqual({ tripNumber: 2, stops: 1 });
    expect(byId('next').previousTrip).toMatchObject({ tripNumber: 1, delivered: 1, total: 1 });
    expect(byId('next').previousTrip.backAt).toBeTruthy();
    expect(byId('ontime').previousTrip).toBeNull();
  });

  it('counts the day and lists what needs attention', async () => {
    const agent = await dispatcher();
    const { body } = await agent.get('/api/dispatch/live').expect(200);
    const mine = body.trips.filter((t: { vehicleId: string }) => VEHICLES.includes(t.vehicleId));
    expect(mine).toHaveLength(8);

    const kinds = body.attention
      .filter((a: { tripId: string }) => Object.values(trip).includes(a.tripId))
      .map((a: { kind: string }) => a.kind)
      .sort();
    expect(kinds).toEqual(['breakdown', 'damaged', 'missing', 'not_synced']);
    const missing = body.attention.find(
      (a: { kind: string; tripId: string }) => a.kind === 'missing' && a.tripId === trip.loading,
    );
    expect(missing.title).toBe('2 cartons short on DL-V6 · Trip 1');
    const sync = body.attention.find(
      (a: { kind: string; tripId: string }) => a.kind === 'not_synced' && a.tripId === trip.sync,
    );
    expect(sync.title).toBe("DL-V4 hasn't synced for 47 min");

    expect(body.kpis.tripsOnRoad).toBeGreaterThanOrEqual(4);
    expect(body.kpis.late).toBeGreaterThanOrEqual(1);
    expect(body.kpis.incidentsText).toMatch(/breakdown/);
    expect(body.counts.all).toBe(body.trips.length);
    expect(body.tomorrow).toMatchObject({ cutoffMin: 960, minutesToCutoff: 960 - 645 });
  });

  it('previews and sends a delay notice to the stores that are affected', async () => {
    const agent = await dispatcher();
    const preview = await agent.get(`/api/dispatch/trips/${trip.late}/notify-preview`).expect(200);
    expect(preview.body.subtitle).toBe('DL-V2 · Trip 1  ·  running about 25 min late');
    expect(preview.body.recipients).toEqual([
      {
        stopId: trip['late-stop1'],
        storeName: expect.stringMatching(/^Store DL-/),
        detail: 'New ETA 10:25 · window was 9:00-10:00',
      },
    ]);
    expect(preview.body.message).toBe(
      'Hi, your Fresh delivery on DL-V2 is running about 25 min late. New ETA is shown in your app. Sorry for the wait.',
    );
    // Nothing is affected on a trip that is on time.
    const none = await agent.get(`/api/dispatch/trips/${trip.ontime}/notify-preview`).expect(200);
    expect(none.body.recipients).toEqual([]);

    const stop = await prisma.tripStop.findUniqueOrThrow({
      where: { id: trip['late-stop1'] },
      include: { order: true },
    });
    const user = await prisma.user.create({
      data: {
        loginId: `dl-store-${Date.now()}`,
        role: 'store',
        name: 'DL store',
        storeId: stop.order.storeId,
      },
    });
    try {
      const sent = await agent
        .post(`/api/dispatch/trips/${trip.late}/notify`)
        .send({ stopIds: [trip['late-stop1']], message: preview.body.message })
        .expect(200);
      expect(sent.body).toEqual({ sent: 1 });
      const notices = await prisma.notification.findMany({ where: { userId: user.id } });
      expect(notices).toEqual([
        expect.objectContaining({ title: 'Delivery running late', body: preview.body.message }),
      ]);

      await agent
        .post(`/api/dispatch/trips/${trip.late}/notify`)
        .send({ stopIds: [trip['ontime-stop1']], message: 'x' })
        .expect(404);
      await agent
        .post(`/api/dispatch/trips/${trip.late}/notify`)
        .send({ stopIds: [], message: 'x' })
        .expect(400);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("shows trips still being planned today, and tomorrow's trips as they are planned", async () => {
    const agent = await dispatcher();
    const make = (vehicleId: string, day: string, status: 'planning' | 'published') =>
      prisma.trip.create({
        data: {
          vehicleId,
          depotId: 'depo1',
          brand: 'Style',
          districtId,
          serviceDate: date(day),
          tripNumber: 2,
          status,
        },
      });
    const next = new Date(date(DAY));
    next.setUTCDate(next.getUTCDate() + 1);
    const TOMORROW = next.toISOString().slice(0, 10);
    const todayPlanned = await make('DL-V1', DAY, 'planning');
    const tomorrowPlanned = await make('DL-V1', TOMORROW, 'planning');
    const tomorrowSent = await make('DL-V2', TOMORROW, 'published');

    const { body } = await agent.get('/api/dispatch/live').expect(200);
    expect(body.trips.find((t: { id: string }) => t.id === todayPlanned.id)).toMatchObject({
      live: 'planned',
      status: 'planning',
      plate: 'DL-V1',
      stopsTotal: 0,
    });
    const tomorrow = body.tomorrowTrips.filter((t: { vehicleId: string }) =>
      VEHICLES.includes(t.vehicleId),
    );
    expect(tomorrow.map((t: { id: string; live: string }) => [t.id, t.live])).toEqual([
      [tomorrowPlanned.id, 'planned'],
      [tomorrowSent.id, 'assigned'],
    ]);
    expect(body.trips.some((t: { id: string }) => t.id === tomorrowPlanned.id)).toBe(false);
  });

  it('alerts once for a driver waiting 10+ minutes, and shows an open road issue until it is resolved', async () => {
    const agent = await dispatcher();
    const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+05:30`);
    const t = await prisma.trip.create({
      data: {
        vehicleId: 'DL-V3',
        depotId: 'depo1',
        brand: 'Fresh',
        districtId,
        serviceDate: date(DAY),
        tripNumber: 2,
        status: 'on_road',
      },
    });
    const stop = async (storeId: string, sequence: number, arrived: string) => {
      const order = await prisma.order.create({
        data: {
          storeId,
          brand: 'Fresh',
          deliveryDate: date(DAY),
          temp: 'ambient',
          status: 'planned',
          units: 1,
          weightKg: 10,
          volumeM3: 0.1,
        },
      });
      return prisma.tripStop.create({
        data: {
          tripId: t.id,
          orderId: order.id,
          sequence,
          status: 'waiting',
          arrivedAt: at(arrived),
        },
      });
    };
    // Now is 10:45: one driver has waited 15 minutes, the other 5.
    const long = await stop('DL-A', 1, '10:30');
    const short = await stop('DL-B', 2, '10:40');

    const first = await agent.get('/api/dispatch/live').expect(200);
    const mine = first.body.attention.filter((a: { tripId: string }) => a.tripId === t.id);
    expect(mine.map((a: { id: string; kind: string }) => [a.id, a.kind])).toEqual([
      [`waiting-${long.id}`, 'waiting'],
    ]);
    expect(mine[0].title).toBe('DL-V3 waiting 15 min at Store DL-A');
    expect(mine.some((a: { id: string }) => a.id === `waiting-${short.id}`)).toBe(false);

    const kasun = await prisma.user.findUniqueOrThrow({ where: { loginId: 'kasun' } });
    const roadEvent = (clientId: string, status: string, applied: string) =>
      prisma.driverEvent.create({
        data: {
          clientId,
          driverId: kasun.id,
          tripId: t.id,
          type: 'ROAD_ISSUE',
          payload: {
            status,
            kind: 'road_blocked',
            note: 'Tree across the road',
            photo: 'data:image/jpeg;base64,AAAA',
            location: { lat: 6.9, lng: 79.95, accuracyM: 10 },
          },
          createdOnPhoneAt: at(applied),
          appliedAt: at(applied),
        },
      });
    await roadEvent('dl-road-1', 'reported', '10:41');
    const paused = await agent.get('/api/dispatch/live').expect(200);
    const road = paused.body.attention.find((a: { id: string }) => a.id === `road-${t.id}`);
    expect(road).toMatchObject({
      kind: 'road_issue',
      title: 'Road blocked · DL-V3 paused',
      photo: 'data:image/jpeg;base64,AAAA',
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=6.9,79.95',
    });
    expect(road.text).toMatch(/^Tree across the road · Reported 10:41/);
    expect(paused.body.trips.find((x: { id: string }) => x.id === t.id).hasIssue).toBe(true);

    await roadEvent('dl-road-2', 'resolved', '10:44');
    const resumed = await agent.get('/api/dispatch/live').expect(200);
    expect(resumed.body.attention.some((a: { id: string }) => a.id === `road-${t.id}`)).toBe(false);
  });
});
