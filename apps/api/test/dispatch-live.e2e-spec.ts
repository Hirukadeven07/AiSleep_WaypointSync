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
const STORES = ['DL-A', 'DL-B', 'DL-C', 'DL-D', 'DL-E', 'DL-F', 'DL-G', 'DL-H', 'DL-I'];
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
        data: { name: `DL District ${Date.now()}`, depotId: 'Peliyagoda' },
      })
    ).id;
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
          windowCloseMin: 600,
        },
      });
    }
    for (const id of VEHICLES) {
      await prisma.vehicle.create({
        data: {
          id,
          plate: id,
          depotId: 'Peliyagoda',
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
      { status: 'upcoming', etaMin: 590 },
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
      await prisma.trip.deleteMany({ where: { vehicleId: { in: VEHICLES } } });
      await prisma.order.deleteMany({ where: { storeId: { in: STORES } } });
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

  it('is closed to other roles and anonymous callers', async () => {
    await request(app.getHttpServer()).get('/api/dispatch/live').expect(401);
    const loader = request.agent(app.getHttpServer());
    await loader
      .post('/api/auth/login')
      .send({ role: 'loader', loginId: 'sampath', depotId: 'Peliyagoda' })
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
  });

  it('counts the day and lists what needs attention', async () => {
    const agent = await dispatcher();
    const { body } = await agent.get('/api/dispatch/live').expect(200);
    const mine = body.trips.filter((t: { vehicleId: string }) => VEHICLES.includes(t.vehicleId));
    expect(mine).toHaveLength(7);

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
});
