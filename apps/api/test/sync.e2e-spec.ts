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

    driverAgent = await login({ role: 'driver', loginId: 'kasun', secret: '1234' });
  });

  afterAll(async () => {
    await prisma.driverEvent.deleteMany({ where: { driverId } });
    if (tripId) await prisma.tripStop.deleteMany({ where: { tripId } });
    if (badStopTripId) await prisma.tripStop.deleteMany({ where: { tripId: badStopTripId } });
    if (tripId) await prisma.trip.delete({ where: { id: tripId } });
    if (badStopTripId) await prisma.trip.delete({ where: { id: badStopTripId } });
    await prisma.order.deleteMany({ where: { storeId } });
    await prisma.store.delete({ where: { id: storeId } });
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

  it('stores SOS alerts with null trip ids when the trip is invalid, and records stale plan versions', async () => {
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

  it('rejects invalid fuel readings, updates the vehicle and trip, and ignores older one-write wins', async () => {
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

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(vehicle.lastConfirmedLitres).toBe(42.5);
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
            payload: { note: 'wheel noise' },
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
  });
});
