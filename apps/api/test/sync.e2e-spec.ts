import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

const DAY = '2026-10-01';
const NOW = `${DAY}T09:00:00+05:30`;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('driver sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverAgent: ReturnType<typeof request.agent>;
  let driverId: string;
  let vehicleId: string;
  // The seed already gives kasun a vehicle; Vehicle.driverId is unique, so borrow kasun for the test.
  let seededVehicleId: string | null = null;
  let tripId: string;
  let stopId: string;
  let storeId: string;
  let badStopTripId: string;
  // Seeded open SOS incidents for kasun: parked (resolved) during the test, reopened in afterAll.
  let parkedSosIds: string[] = [];
  let districtId = '';
  // Dispatcher notices this run raises (SOS, road issue) are removed in afterAll.
  const startedAt = new Date();

  /** Resolve every open SOS incident for the test driver, so activeSos starts false. */
  async function resolveOpenSos() {
    await prisma.driverIncident.updateMany({
      where: { driver: { userId: driverId }, incidentType: 'sos', resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  async function login(body: Record<string, string>) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send(body).expect(200);
    return agent;
  }

  beforeAll(async () => {
    process.env.DEMO_NOW = NOW;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const district = await prisma.district.create({
      data: { name: `Sync District ${Date.now()}`, depotId: 'Peliyagoda' },
    });
    districtId = district.id;
    const store = await prisma.store.create({
      data: {
        id: `E2E-STORE-${Date.now()}`,
        displayName: 'Sync Store',
        brand: 'Fresh',
        districtId: district.id,
        depotId: 'Peliyagoda',
        dockType: 'street',
        windowOpenMin: 300,
        windowCloseMin: 480,
      },
    });
    storeId = store.id;

    const driver = await prisma.user.findUniqueOrThrow({ where: { loginId: 'kasun' } });
    driverId = driver.id;
    const seededVehicle = await prisma.vehicle.findUnique({ where: { driverId } });
    if (seededVehicle) {
      seededVehicleId = seededVehicle.id;
      await prisma.vehicle.update({ where: { id: seededVehicle.id }, data: { driverId: null } });
    }
    vehicleId = `SYNC-VEH-${Date.now()}`;
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        depotId: 'Peliyagoda',
        type: 'truck',
        temp: 'reefer',
        weightCapKg: 2500,
        volumeCapM3: 16,
        driverId: driver.id,
      },
    });

    const otherDriver = await prisma.user.create({
      data: {
        loginId: `driver-${Date.now()}`,
        role: 'driver',
        name: 'Other driver',
        depotId: 'Peliyagoda',
        pinHash: 'unused',
      },
    });
    const otherVehicle = await prisma.vehicle.create({
      data: {
        id: `SYNC-OTHER-${Date.now()}`,
        depotId: 'Peliyagoda',
        type: 'truck',
        temp: 'ambient',
        weightCapKg: 2000,
        volumeCapM3: 12,
        driverId: otherDriver.id,
      },
    });

    const trip = await prisma.trip.create({
      data: {
        vehicleId: vehicleId,
        depotId: 'Peliyagoda',
        brand: 'Fresh',
        districtId: district.id,
        serviceDate: date(DAY),
        tripNumber: 1,
        status: 'published',
        planVersion: 1,
      },
    });
    tripId = trip.id;

    const otherTrip = await prisma.trip.create({
      data: {
        vehicleId: otherVehicle.id,
        depotId: 'Peliyagoda',
        brand: 'Fresh',
        districtId: district.id,
        serviceDate: date(DAY),
        tripNumber: 2,
        status: 'on_road',
        planVersion: 2,
      },
    });
    badStopTripId = otherTrip.id;

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        brand: 'Fresh',
        deliveryDate: date(DAY),
        temp: 'chilled',
        status: 'waiting',
        units: 2,
        weightKg: 50,
        volumeM3: 0.5,
        lines: {
          create: [
            {
              name: 'Milk',
              qty: 2,
              pack: 'crate',
              chilled: true,
              unitWeightKg: 5,
              unitVolumeM3: 0.02,
            },
          ],
        },
      },
    });

    const stop = await prisma.tripStop.create({
      data: {
        tripId: trip.id,
        orderId: order.id,
        sequence: 1,
        status: 'upcoming',
      },
    });
    stopId = stop.id;

    // A stop on another driver's trip, for the FORBIDDEN_STOP check. TripStop.orderId is unique.
    const otherOrder = await prisma.order.create({
      data: {
        storeId: store.id,
        brand: 'Fresh',
        deliveryDate: date(DAY),
        temp: 'ambient',
        status: 'waiting',
        units: 1,
        weightKg: 10,
        volumeM3: 0.1,
      },
    });
    await prisma.tripStop.create({
      data: { tripId: otherTrip.id, orderId: otherOrder.id, sequence: 1, status: 'upcoming' },
    });

    const openSos = await prisma.driverIncident.findMany({
      where: { driver: { userId: driverId }, incidentType: 'sos', resolvedAt: null },
      select: { id: true },
    });
    parkedSosIds = openSos.map((incident) => incident.id);
    await resolveOpenSos();

    driverAgent = await login({ role: 'driver', loginId: 'kasun', secret: '1234' });
  });

  afterAll(async () => {
    await prisma.driverEvent.deleteMany({ where: { driverId } });
    await prisma.driverIncident.deleteMany({
      where: { driver: { userId: driverId }, id: { notIn: parkedSosIds } },
    });
    if (parkedSosIds.length > 0) {
      await prisma.driverIncident.updateMany({
        where: { id: { in: parkedSosIds } },
        data: { resolvedAt: null },
      });
    }
    await prisma.notification.deleteMany({
      where: { title: { in: ['Driver SOS', 'Road issue'] }, createdAt: { gte: startedAt } },
    });
    if (tripId) await prisma.tripStop.deleteMany({ where: { tripId } });
    if (badStopTripId) await prisma.tripStop.deleteMany({ where: { tripId: badStopTripId } });
    if (tripId) await prisma.trip.delete({ where: { id: tripId } });
    if (badStopTripId) await prisma.trip.delete({ where: { id: badStopTripId } });
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.store.delete({ where: { id: storeId } });
    if (districtId) await prisma.district.deleteMany({ where: { id: districtId } });
    await prisma.vehicle.deleteMany({ where: { id: { startsWith: 'SYNC-' } } });
    if (seededVehicleId) {
      await prisma.vehicle.update({ where: { id: seededVehicleId }, data: { driverId } });
    }
    await prisma.user.deleteMany({ where: { loginId: { startsWith: 'driver-' } } });
    await app.close();
  });

  it('rejects the sync route without a session and forbids a non-driver role', async () => {
    await request(app.getHttpServer()).post('/api/sync').send({ events: [] }).expect(401);

    const storeAgent = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
    await storeAgent.post('/api/sync').send({ events: [] }).expect(403);
  });

  it('applies one event, then rejects a duplicate and leaves exactly one row', async () => {
    const clientId = '11111111-1111-4111-8111-111111111111';
    const payload = {
      events: [
        {
          clientId,
          driverId,
          tripId,
          type: 'ARRIVED',
          payload: { stopId },
          createdOnPhoneAt: '2026-10-01T09:05:00+05:30',
          seenPlanVersion: 1,
        },
      ],
    };

    const first = await driverAgent.post('/api/sync').send(payload).expect(200);
    expect(first.body.applied).toEqual([clientId]);
    expect(first.body.rejected).toEqual([]);
    expect(first.body.duplicate).toEqual([]);

    const second = await driverAgent.post('/api/sync').send(payload).expect(200);
    expect(second.body.applied).toEqual([]);
    expect(second.body.duplicate).toEqual([clientId]);

    const rows = await prisma.driverEvent.count({ where: { clientId } });
    expect(rows).toBe(1);
  });

  it('arrived and ack flow respects stop ownership and receipt gating', async () => {
    const arrived = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: '22222222-2222-4222-8222-222222222222',
            driverId,
            tripId,
            type: 'ARRIVED',
            payload: { stopId },
            createdOnPhoneAt: '2026-10-01T09:10:00+05:30',
            seenPlanVersion: 1,
          },
        ],
      })
      .expect(200);
    expect(arrived.body.applied).toEqual(['22222222-2222-4222-8222-222222222222']);

    const beforeReceipt = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: '33333333-3333-4333-8333-333333333333',
            driverId,
            tripId,
            type: 'ACKNOWLEDGEMENT',
            payload: { stopId },
            createdOnPhoneAt: '2026-10-01T09:11:00+05:30',
            seenPlanVersion: 1,
          },
        ],
      })
      .expect(200);
    expect(beforeReceipt.body.rejected).toEqual(['33333333-3333-4333-8333-333333333333']);
    expect(beforeReceipt.body.rejectedReasons['33333333-3333-4333-8333-333333333333']).toBe(
      'ACK_BEFORE_RECEIPT',
    );

    const stop = await prisma.tripStop.update({
      where: { id: stopId },
      data: { storeConfirmedAt: new Date('2026-10-01T09:13:00Z') },
    });
    expect(stop.storeConfirmedAt).toBeTruthy();

    const afterReceipt = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: '44444444-4444-4444-8444-444444444444',
            driverId,
            tripId,
            type: 'ACKNOWLEDGEMENT',
            payload: { stopId },
            createdOnPhoneAt: '2026-10-01T09:14:00+05:30',
            seenPlanVersion: 1,
          },
        ],
      })
      .expect(200);
    expect(afterReceipt.body.applied).toEqual(['44444444-4444-4444-8444-444444444444']);

    const otherTripStop = await prisma.tripStop.findFirst({ where: { tripId: badStopTripId } });
    expect(otherTripStop).toBeTruthy();
    const forbidden = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: '55555555-5555-4555-8555-555555555555',
            driverId,
            tripId: badStopTripId,
            type: 'ARRIVED',
            payload: { stopId: otherTripStop!.id },
            createdOnPhoneAt: '2026-10-01T09:15:00+05:30',
            seenPlanVersion: 1,
          },
        ],
      })
      .expect(200);
    expect(forbidden.body.rejected).toContain('55555555-5555-4555-8555-555555555555');
    expect(forbidden.body.rejectedReasons['55555555-5555-4555-8555-555555555555']).toBe(
      'FORBIDDEN_STOP',
    );
  });

  it('accepts SOS alerts with no or an invalid trip id, and records stale plan versions', async () => {
    const ok = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: '66666666-6666-4666-8666-666666666666',
            driverId,
            tripId: null,
            type: 'SOS_ALERT',
            payload: { location: null },
            createdOnPhoneAt: '2026-10-01T09:20:00+05:30',
            seenPlanVersion: null,
          },
        ],
      })
      .expect(200);
    expect(ok.body.applied).toEqual(['66666666-6666-4666-8666-666666666666']);

    const bogus = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: '77777777-7777-4777-8777-777777777777',
            driverId,
            tripId: 'bad-trip',
            type: 'SOS_ALERT',
            payload: { location: null },
            createdOnPhoneAt: '2026-10-01T09:21:00+05:30',
            seenPlanVersion: null,
          },
        ],
      })
      .expect(200);
    expect(bogus.body.applied).toContain('77777777-7777-4777-8777-777777777777');

    const stale = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: '88888888-8888-4888-8888-888888888888',
            driverId,
            tripId,
            type: 'ARRIVED',
            payload: { stopId },
            createdOnPhoneAt: '2026-10-01T09:23:00+05:30',
            seenPlanVersion: 99,
          },
        ],
      })
      .expect(200);
    expect(stale.body.stale).toContain('88888888-8888-4888-8888-888888888888');
    expect(stale.body.applied).toContain('88888888-8888-4888-8888-888888888888');
  });

  it('rejects invalid fuel readings, updates the trip, and ignores older one-write wins', async () => {
    const bad = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: '99999999-9999-4999-8999-999999999999',
            driverId,
            tripId,
            type: 'FUEL_READING',
            payload: { remainingLitres: -1 },
            createdOnPhoneAt: '2026-10-01T09:30:00+05:30',
            seenPlanVersion: 1,
          },
        ],
      })
      .expect(200);
    expect(bad.body.rejected).toContain('99999999-9999-4999-8999-999999999999');

    const good = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            driverId,
            tripId,
            type: 'FUEL_READING',
            payload: { remainingLitres: 42.5 },
            createdOnPhoneAt: '2026-10-01T09:31:00+05:30',
            seenPlanVersion: 1,
          },
        ],
      })
      .expect(200);
    expect(good.body.applied).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(trip.fuelLitresAtEnd).toBe(42.5);

    const older = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            driverId,
            tripId,
            type: 'FUEL_READING',
            payload: { remainingLitres: 10 },
            createdOnPhoneAt: '2026-10-01T09:30:30+05:30',
            seenPlanVersion: 1,
          },
        ],
      })
      .expect(200);
    expect(older.body.applied).toContain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    const updatedTrip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(updatedTrip.fuelLitresAtEnd).toBe(42.5);
  });

  it('keeps processing in order and returns the pull snapshot and active SOS', async () => {
    // The SOS test above left open incidents; resolve them so activeSos starts false.
    await resolveOpenSos();

    const badEvent = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            driverId,
            tripId,
            type: 'ARRIVED',
            payload: { stopId: 'not-real-stop' },
            createdOnPhoneAt: '2026-10-01T09:40:00+05:30',
            seenPlanVersion: 1,
          },
          {
            clientId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            driverId,
            tripId,
            type: 'ROAD_ISSUE',
            payload: {
              status: 'reported',
              kind: 'vehicle',
              note: 'wheel noise',
              photo: null,
              location: null,
            },
            createdOnPhoneAt: '2026-10-01T09:41:00+05:30',
            seenPlanVersion: 1,
          },
        ],
      })
      .expect(200);
    expect(badEvent.body.rejected).toContain('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(badEvent.body.applied).toContain('dddddddd-dddd-4ddd-8ddd-dddddddddddd');

    const pull = await driverAgent.get('/api/sync').expect(200);
    expect(pull.body.tripId).toBe(tripId);
    expect(pull.body.planVersion).toBe(1);
    expect(Array.isArray(pull.body.stops)).toBe(true);
    expect(pull.body.activeSos).toBe(false);

    const sos = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            driverId,
            tripId: null,
            type: 'SOS_ALERT',
            payload: { location: null },
            createdOnPhoneAt: '2026-10-01T09:50:00+05:30',
            seenPlanVersion: null,
          },
        ],
      })
      .expect(200);
    expect(sos.body.applied).toContain('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

    const refreshed = await driverAgent.get('/api/sync').expect(200);
    expect(refreshed.body.activeSos).toBe(true);

    // Dispatch resolving the incident clears it.
    await resolveOpenSos();
    const resolved = await driverAgent.get('/api/sync').expect(200);
    expect(resolved.body.activeSos).toBe(false);
  });

  it('rejects a malformed event on its own without failing the rest of the batch', async () => {
    const good = 'f1111111-1111-4111-8111-111111111111';
    const res = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          {
            clientId: 'f0000000-0000-4000-8000-000000000000',
            driverId,
            tripId,
            type: 'WAITING',
            payload: {},
            createdOnPhoneAt: '2026-10-01T08:00:00+05:30',
            seenPlanVersion: 1,
          },
          'not-an-event',
          {
            clientId: good,
            driverId,
            tripId,
            type: 'ROAD_ISSUE',
            payload: {
              status: 'resolved',
              kind: 'road_blocked',
              note: 'pothole',
              photo: null,
              location: null,
            },
            createdOnPhoneAt: '2026-10-01T08:01:00+05:30',
            seenPlanVersion: 1,
          },
        ],
      })
      .expect(200);
    expect(res.body.rejected).toEqual(['f0000000-0000-4000-8000-000000000000', 'invalid:1']);
    expect(res.body.rejectedReasons['f0000000-0000-4000-8000-000000000000']).toBe('INVALID_EVENT');
    expect(res.body.applied).toEqual([good]);
  });

  it('raises a dispatcher-visible SOS incident with location and alerts the depot dispatchers', async () => {
    const clientId = 'f2222222-2222-4222-8222-222222222222';
    const body = {
      events: [
        {
          clientId,
          driverId,
          tripId,
          type: 'SOS_ALERT',
          payload: {
            location: { lat: 6.93, lng: 79.85 },
            severity: 'critical',
            message: 'E2E SOS',
          },
          createdOnPhoneAt: '2026-10-01T08:30:00+05:30',
          seenPlanVersion: 1,
        },
      ],
    };
    const res = await driverAgent.post('/api/sync').send(body).expect(200);
    expect(res.body.applied).toEqual([clientId]);

    const incident = await prisma.driverIncident.findFirstOrThrow({
      where: { driver: { userId: driverId }, message: 'E2E SOS' },
    });
    expect(incident).toMatchObject({
      tripId,
      vehicleId,
      incidentType: 'sos',
      severity: 'critical',
      lat: 6.93,
      lng: 79.85,
      resolvedAt: null,
    });
    // Raised at the phone's time, not the sync time.
    expect(incident.raisedAt.toISOString()).toBe(
      new Date('2026-10-01T08:30:00+05:30').toISOString(),
    );

    const nimal = await prisma.user.findUniqueOrThrow({ where: { loginId: 'nimal' } });
    const alerts = await prisma.notification.count({
      where: { userId: nimal.id, title: 'Driver SOS', body: { contains: 'E2E SOS' } },
    });
    expect(alerts).toBe(1);

    // Re-syncing the same SOS must not raise a second incident.
    const again = await driverAgent.post('/api/sync').send(body).expect(200);
    expect(again.body.duplicate).toEqual([clientId]);
    expect(
      await prisma.driverIncident.count({
        where: { driver: { userId: driverId }, message: 'E2E SOS' },
      }),
    ).toBe(1);
  });

  it('records the arrival time from the phone, not the sync time, and keeps the first arrival', async () => {
    const order = await prisma.order.create({
      data: {
        storeId,
        brand: 'Fresh',
        deliveryDate: date(DAY),
        temp: 'ambient',
        status: 'waiting',
        units: 1,
        weightKg: 5,
        volumeM3: 0.05,
      },
    });
    const stop = await prisma.tripStop.create({
      data: { tripId, orderId: order.id, sequence: 2, status: 'upcoming' },
    });
    const arrive = (clientId: string, at: string) => ({
      events: [
        {
          clientId,
          driverId,
          tripId,
          type: 'ARRIVED',
          payload: { stopId: stop.id },
          createdOnPhoneAt: at,
          seenPlanVersion: 1,
        },
      ],
    });

    // Arrived offline at 08:40; synced at 09:00 (DEMO_NOW).
    await driverAgent
      .post('/api/sync')
      .send(arrive('f3333333-3333-4333-8333-333333333333', '2026-10-01T08:40:00+05:30'))
      .expect(200);
    await driverAgent
      .post('/api/sync')
      .send(arrive('f4444444-4444-4444-8444-444444444444', '2026-10-01T08:50:00+05:30'))
      .expect(200);

    const saved = await prisma.tripStop.findUniqueOrThrow({ where: { id: stop.id } });
    expect(saved.status).toBe('waiting');
    expect(saved.arrivedAt?.toISOString()).toBe(
      new Date('2026-10-01T08:40:00+05:30').toISOString(),
    );
  });

  it('accepts a road issue only with a known kind, a valid photo and location, and alerts dispatch once', async () => {
    const send = (clientId: string, payload: Record<string, unknown>) =>
      driverAgent
        .post('/api/sync')
        .send({
          events: [
            {
              clientId,
              driverId,
              tripId,
              type: 'ROAD_ISSUE',
              payload,
              createdOnPhoneAt: '2026-10-01T10:05:00+05:30',
              seenPlanVersion: 1,
            },
          ],
        })
        .expect(200);
    const base = {
      status: 'reported',
      kind: 'road_blocked',
      note: null,
      photo: null,
      location: null,
    };
    const bad = [
      { ...base, kind: 'aliens' },
      { ...base, status: 'maybe' },
      { ...base, photo: 'https://example.com/x.jpg' },
      { ...base, location: { lat: 200, lng: 79.9 } },
      { ...base, note: 'x'.repeat(501) },
    ];
    for (const [i, payload] of bad.entries()) {
      const id = `a${i}aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
      const res = await send(id, payload);
      expect(res.body.rejectedReasons?.[id]).toBe('INVALID_PAYLOAD');
    }

    const nimal = await prisma.user.findUniqueOrThrow({ where: { loginId: 'nimal' } });
    const alerts = () =>
      prisma.notification.count({
        where: { userId: nimal.id, title: 'Road issue', body: { contains: 'E2E fallen tree' } },
      });
    const before = await alerts();
    const photo = `data:image/jpeg;base64,${'A'.repeat(200)}`;
    const reported = await send('b1bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
      ...base,
      note: 'E2E fallen tree',
      photo,
      location: { lat: 6.9, lng: 79.95, accuracyM: 12 },
    });
    expect(reported.body.applied).toEqual(['b1bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
    expect(await alerts()).toBe(before + 1);
    const saved = await prisma.driverEvent.findUniqueOrThrow({
      where: { clientId: 'b1bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    });
    expect(saved).toMatchObject({ tripId, type: 'ROAD_ISSUE' });
    expect(saved.payload).toMatchObject({ kind: 'road_blocked', photo, location: { lat: 6.9 } });

    // Resuming is recorded but does not alert dispatch again.
    const resolved = await send('b2bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
      ...base,
      status: 'resolved',
      note: 'E2E fallen tree',
    });
    expect(resolved.body.applied).toEqual(['b2bbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
    expect(await alerts()).toBe(before + 1);
  });

  it('alerts dispatch once when the driver has waited 10 minutes at a store', async () => {
    // The sequence-2 stop from the arrival test: waiting since 08:40, it is now 09:00.
    const waiting = await prisma.tripStop.findFirstOrThrow({ where: { tripId, sequence: 2 } });
    expect(waiting.status).toBe('waiting');
    const nimal = await prisma.user.findUniqueOrThrow({ where: { loginId: 'nimal' } });
    const alerts = () =>
      prisma.notification.findMany({
        where: {
          userId: nimal.id,
          title: { startsWith: 'Waiting ' },
          createdAt: { gte: startedAt },
        },
      });

    await driverAgent.get('/api/driver/day').expect(200);
    await driverAgent.get('/api/driver/day').expect(200);
    const sent = await alerts();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.title).toBe('Waiting 20 min at Sync Store');
    expect(
      (await prisma.tripStop.findUniqueOrThrow({ where: { id: waiting.id } })).waitAlertedAt,
    ).toBeTruthy();
    await prisma.notification.deleteMany({ where: { id: { in: sent.map((n) => n.id) } } });
  });

  it('blocks the next arrival until the store result before it is acknowledged', async () => {
    const order = (n: number) =>
      prisma.order.create({
        data: {
          storeId,
          brand: 'Fresh',
          deliveryDate: date(DAY),
          temp: 'ambient',
          status: 'planned',
          units: 1,
          weightKg: 5,
          volumeM3: 0.05,
          urgentNote: `E2E order ${n}`,
        },
      });
    const checked = await prisma.tripStop.create({
      data: {
        tripId,
        orderId: (await order(3)).id,
        sequence: 3,
        status: 'confirmed',
        arrivedAt: new Date('2026-10-01T03:00:00Z'),
        storeConfirmedAt: new Date('2026-10-01T03:10:00Z'),
      },
    });
    const next = await prisma.tripStop.create({
      data: { tripId, orderId: (await order(4)).id, sequence: 4, status: 'upcoming' },
    });
    const event = (clientId: string, type: string, stop: string) => ({
      clientId,
      driverId,
      tripId,
      type,
      payload: { stopId: stop },
      createdOnPhoneAt: '2026-10-01T08:55:00+05:30',
      seenPlanVersion: 1,
    });

    const early = await driverAgent
      .post('/api/sync')
      .send({ events: [event('c1cccccc-cccc-4ccc-8ccc-cccccccccccc', 'ARRIVED', next.id)] })
      .expect(200);
    expect(early.body.rejectedReasons['c1cccccc-cccc-4ccc-8ccc-cccccccccccc']).toBe('ACK_PENDING');

    // Acknowledge first, then arrive: both in one push, in order.
    const ok = await driverAgent
      .post('/api/sync')
      .send({
        events: [
          event('c2cccccc-cccc-4ccc-8ccc-cccccccccccc', 'ACKNOWLEDGEMENT', checked.id),
          event('c3cccccc-cccc-4ccc-8ccc-cccccccccccc', 'ARRIVED', next.id),
        ],
      })
      .expect(200);
    expect(ok.body.applied).toEqual([
      'c2cccccc-cccc-4ccc-8ccc-cccccccccccc',
      'c3cccccc-cccc-4ccc-8ccc-cccccccccccc',
    ]);
    expect((await prisma.tripStop.findUniqueOrThrow({ where: { id: next.id } })).status).toBe(
      'waiting',
    );
  });

  it('returns an open road issue in the driver day until it is resolved', async () => {
    const issue = (clientId: string, status: 'reported' | 'resolved') => ({
      events: [
        {
          clientId,
          driverId,
          tripId,
          type: 'ROAD_ISSUE',
          payload: { status, kind: 'traffic', note: 'E2E jam' },
          createdOnPhoneAt:
            // After the 10:05 road issue of the earlier test, so these are the newest.
            status === 'reported' ? '2026-10-01T10:10:00+05:30' : '2026-10-01T10:12:00+05:30',
          seenPlanVersion: 1,
        },
      ],
    });
    await driverAgent
      .post('/api/sync')
      .send(issue('d1dddddd-dddd-4ddd-8ddd-dddddddddddd', 'reported'))
      .expect(200);
    const paused = (await driverAgent.get('/api/driver/day').expect(200)).body;
    expect(paused.roadIssue).toMatchObject({ tripId, kind: 'traffic', note: 'E2E jam' });

    await driverAgent
      .post('/api/sync')
      .send(issue('d2dddddd-dddd-4ddd-8ddd-dddddddddddd', 'resolved'))
      .expect(200);
    expect((await driverAgent.get('/api/driver/day').expect(200)).body.roadIssue).toBeNull();
  });
});
