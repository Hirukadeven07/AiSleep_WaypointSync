import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { DriverDayResponse } from '@waypoint/contracts';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

const DAY = '2026-10-01';
const TOMORROW = '2026-10-02';
const YESTERDAY = '2026-09-30';
const NOW = `${DAY}T09:00:00+05:30`;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('driver day (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverAgent: ReturnType<typeof request.agent>;
  let driverId: string;
  let vehicleId: string;
  let otherVehicleId: string;
  let otherDriverId: string;
  // The seed already gives kasun a vehicle; Vehicle.driverId is unique, so borrow kasun for the test.
  let seededVehicleId: string | null = null;
  let districtId: string;
  let districtName: string;
  let namedStoreId: string;
  let bareStoreId: string;
  let liveTripId: string;
  let otherTripId: string;
  let firstStopId: string;
  let secondStopId: string;
  let flagId: string;

  async function login(body: Record<string, string>) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send(body).expect(200);
    return agent;
  }

  async function createOrder(storeId: string, lines: { name: string }[] = []) {
    return prisma.order.create({
      data: {
        storeId,
        brand: 'Fresh',
        deliveryDate: date(DAY),
        temp: 'chilled',
        status: 'planned',
        units: 2,
        weightKg: 50,
        volumeM3: 0.5,
        urgentNote: lines.length > 0 ? 'Call before arriving' : null,
        lines: {
          create: lines.map((line) => ({
            name: line.name,
            qty: 2,
            pack: 'crate',
            chilled: true,
            unitWeightKg: 5,
            unitVolumeM3: 0.02,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async function createTrip(data: {
    vehicleId: string;
    serviceDate: string;
    tripNumber: number;
    status: 'planning' | 'published' | 'on_road' | 'completed';
    planVersion?: number;
  }) {
    return prisma.trip.create({
      data: {
        vehicleId: data.vehicleId,
        depotId: 'depo1',
        brand: 'Fresh',
        districtId,
        serviceDate: date(data.serviceDate),
        tripNumber: data.tripNumber,
        status: data.status,
        planVersion: data.planVersion ?? 1,
      },
    });
  }

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

    const stamp = Date.now();
    districtName = `Day District ${stamp}`;
    const district = await prisma.district.create({
      data: { name: districtName, depotId: 'depo1' },
    });
    districtId = district.name;

    const named = await prisma.store.create({
      data: {
        id: `DAY-STORE-A-${stamp}`,
        displayName: 'Day Store',
        brand: 'Fresh',
        districtId,
        depotId: 'depo1',
        dockType: 'street',
        windowOpenMin: 300,
        windowCloseMin: 480,
        lat: 6.9271,
        lng: 79.8612,
        phones: {
          create: [
            { label: 'manager', phoneNo: '0771111111' },
            { label: 'shop', phoneNo: '0772222222' },
          ],
        },
      },
    });
    namedStoreId = named.id;
    const bare = await prisma.store.create({
      data: {
        id: `DAY-STORE-B-${stamp}`,
        brand: 'Fresh',
        districtId,
        depotId: 'depo1',
        dockType: 'street',
        windowOpenMin: 360,
        windowCloseMin: 600,
      },
    });
    bareStoreId = bare.id;

    const driver = await prisma.user.findUniqueOrThrow({ where: { loginId: 'kasun' } });
    driverId = driver.id;
    const seededVehicle = await prisma.vehicle.findUnique({ where: { driverId } });
    if (seededVehicle) {
      seededVehicleId = seededVehicle.id;
      await prisma.vehicle.update({ where: { id: seededVehicle.id }, data: { driverId: null } });
    }
    vehicleId = `DAY-VEH-${stamp}`;
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        numberPlate: `DAY-${stamp}`,
        depotId: 'depo1',
        type: 'truck',
        temp: 'reefer',
        weightCapKg: 2500,
        volumeCapM3: 16,
        driverId,
      },
    });

    const otherDriver = await prisma.user.create({
      data: {
        loginId: `dayd-${stamp}`,
        role: 'driver',
        name: 'Other day driver',
        depotId: 'depo1',
        pinHash: 'unused',
      },
    });
    otherDriverId = otherDriver.id;
    otherVehicleId = `DAY-OTHER-${stamp}`;
    await prisma.vehicle.create({
      data: {
        id: otherVehicleId,
        depotId: 'depo1',
        type: 'van',
        temp: 'ambient',
        weightCapKg: 2000,
        volumeCapM3: 12,
        driverId: otherDriverId,
      },
    });

    await createTrip({ vehicleId, serviceDate: DAY, tripNumber: 1, status: 'completed' });
    const live = await createTrip({
      vehicleId,
      serviceDate: DAY,
      tripNumber: 2,
      status: 'published',
      planVersion: 3,
    });
    liveTripId = live.id;
    await createTrip({ vehicleId, serviceDate: YESTERDAY, tripNumber: 2, status: 'published' });
    const other = await createTrip({
      vehicleId: otherVehicleId,
      serviceDate: DAY,
      tripNumber: 1,
      status: 'on_road',
    });
    otherTripId = other.id;

    // Created out of order: sequence 2 first, so the response order must come from `sequence`.
    const bareOrder = await createOrder(bareStoreId);
    const second = await prisma.tripStop.create({
      data: { tripId: liveTripId, orderId: bareOrder.id, sequence: 2, status: 'upcoming' },
    });
    secondStopId = second.id;

    const namedOrder = await createOrder(namedStoreId, [{ name: 'Milk' }]);
    const first = await prisma.tripStop.create({
      data: {
        tripId: liveTripId,
        orderId: namedOrder.id,
        sequence: 1,
        status: 'arrived',
        etaMin: 330,
        arrivedAt: new Date('2026-10-01T03:40:00.000Z'),
      },
    });
    firstStopId = first.id;
    const flag = await prisma.loadFlag.create({
      data: {
        stopId: firstStopId,
        orderLineId: namedOrder.lines[0]!.id,
        type: 'damaged',
        qty: 1,
        note: 'Crate cracked',
      },
    });
    flagId = flag.id;

    driverAgent = await login({ role: 'driver', loginId: 'kasun', secret: '1234' });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: [driverId, otherDriverId].filter(Boolean) }, link: '/drive' },
    });
    const vehicleIds = [vehicleId, otherVehicleId].filter(Boolean);
    await prisma.tripStop.deleteMany({ where: { trip: { vehicleId: { in: vehicleIds } } } });
    await prisma.trip.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.order.deleteMany({ where: { storeId: { in: [namedStoreId, bareStoreId] } } });
    await prisma.store.deleteMany({ where: { id: { in: [namedStoreId, bareStoreId] } } });
    if (districtId) await prisma.district.delete({ where: { name: districtId } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    if (seededVehicleId) {
      await prisma.vehicle.update({ where: { id: seededVehicleId }, data: { driverId } });
    }
    if (otherDriverId) await prisma.user.delete({ where: { id: otherDriverId } });
    await app.close();
  });

  it('rejects the route without a session and forbids a non-driver role', async () => {
    await request(app.getHttpServer()).get('/api/driver/day').expect(401);

    const storeAgent = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
    await storeAgent.get('/api/driver/day').expect(403);
  });

  it("returns the driver's vehicle and only today's workable trip", async () => {
    const res = await driverAgent.get('/api/driver/day').expect(200);
    const day = res.body as DriverDayResponse;

    expect(day.serviceDate).toBe(DAY);
    expect(day.vehicle).toEqual({
      id: vehicleId,
      plate: expect.stringMatching(/^DAY-/),
      type: 'truck',
    });
    // Completed, yesterday's and the other driver's on_road trips are left out.
    expect(day.trips.map((trip) => trip.id)).toEqual([liveTripId]);
    expect(day.trips[0]).toMatchObject({ tripNumber: 2, status: 'published', planVersion: 3 });
    expect(day.activeTripId).toBe(liveTripId);
  });

  it('returns stops in sequence with every mapped field', async () => {
    const res = await driverAgent.get('/api/driver/day').expect(200);
    const [trip] = (res.body as DriverDayResponse).trips;
    const [first, second] = trip!.stops;

    expect(trip!.stops.map((stop) => stop.id)).toEqual([firstStopId, secondStopId]);
    expect(first).toMatchObject({
      sequence: 1,
      storeId: namedStoreId,
      outletName: 'Day Store',
      address: districtName,
      status: 'arrived',
      windowStart: 300,
      windowEnd: 480,
      eta: 330,
      phone: '0772222222',
      lat: 6.9271,
      lng: 79.8612,
      navigateUrl:
        'https://www.google.com/maps/dir/?api=1&destination=6.9271,79.8612&travelmode=driving',
      urgentNote: 'Call before arriving',
      arrivedAt: '2026-10-01T03:40:00.000Z',
      storeConfirmedAt: null,
      driverAckAt: null,
      flags: [{ id: flagId, type: 'damaged', qty: 1, note: 'Crate cracked', itemName: 'Milk' }],
    });
    expect(first!.phones).toHaveLength(2);
    expect(first!.phones).toEqual(
      expect.arrayContaining([
        { label: 'manager', phoneNo: '0771111111' },
        { label: 'shop', phoneNo: '0772222222' },
      ]),
    );

    expect(second).toMatchObject({
      sequence: 2,
      storeId: bareStoreId,
      outletName: bareStoreId,
      address: districtName,
      eta: null,
      phone: null,
      phones: [],
      lat: null,
      lng: null,
      navigateUrl: null,
      urgentNote: null,
      flags: [],
    });
  });

  it('agrees with GET /api/sync on the active trip', async () => {
    const day = (await driverAgent.get('/api/driver/day').expect(200)).body as DriverDayResponse;
    const sync = (await driverAgent.get('/api/sync').expect(200)).body;

    expect(sync.tripId).toBe(day.activeTripId);
    const active = day.trips.find((trip) => trip.id === day.activeTripId);
    expect(sync.planVersion).toBe(active!.planVersion);
  });

  it('returns the empty day for a driver with no vehicle', async () => {
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { driverId: null } });
    try {
      const res = await driverAgent.get('/api/driver/day').expect(200);
      expect(res.body).toMatchObject({
        serviceDate: DAY,
        vehicle: null,
        trips: [],
        activeTripId: null,
        upcoming: [],
      });
    } finally {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { driverId } });
    }
  });

  it('follows the trip the dispatcher assigned, not only the registered vehicle', async () => {
    // The other driver's on-road trip is given to kasun, and kasun's own trip to the other driver.
    await prisma.trip.update({ where: { id: otherTripId }, data: { assignedDriverId: driverId } });
    await prisma.trip.update({
      where: { id: liveTripId },
      data: { assignedDriverId: otherDriverId },
    });
    try {
      const day = (await driverAgent.get('/api/driver/day').expect(200)).body as DriverDayResponse;
      expect(day.trips.map((t) => t.id)).toEqual([otherTripId]);
      expect(day.activeTripId).toBe(otherTripId);
      // The truck shown is the one the trip runs on.
      expect(day.vehicle?.id).toBe(otherVehicleId);
      const sync = (await driverAgent.get('/api/sync').expect(200)).body;
      expect(sync.tripId).toBe(otherTripId);
    } finally {
      await prisma.trip.updateMany({
        where: { id: { in: [otherTripId, liveTripId] } },
        data: { assignedDriverId: null },
      });
    }
  });

  it('lists published trips on the next days as upcoming', async () => {
    const tomorrow = await createTrip({
      vehicleId,
      serviceDate: TOMORROW,
      tripNumber: 1,
      status: 'published',
    });
    const draft = await createTrip({
      vehicleId,
      serviceDate: TOMORROW,
      tripNumber: 2,
      status: 'planning',
    });
    try {
      const day = (await driverAgent.get('/api/driver/day').expect(200)).body as DriverDayResponse;
      expect(day.upcoming.map((t) => [t.id, t.serviceDate])).toEqual([[tomorrow.id, TOMORROW]]);
      expect(day.trips.map((t) => t.id)).toEqual([liveTripId]);
    } finally {
      await prisma.trip.deleteMany({ where: { id: { in: [tomorrow.id, draft.id] } } });
    }
  });

  it('lets dispatch put another driver on a trip and tells both drivers', async () => {
    const dispatcher = await login({ role: 'dispatcher', loginId: 'nimal', secret: 'waypoint' });
    try {
      const given = await dispatcher
        .post(`/api/plan/trips/${liveTripId}/driver`)
        .send({ driverId: otherDriverId })
        .expect(200);
      expect(given.body).toMatchObject({
        driverId: otherDriverId,
        driverName: 'Other day driver',
        driverAssigned: true,
      });
      const day = (await driverAgent.get('/api/driver/day').expect(200)).body as DriverDayResponse;
      expect(day.trips.map((t) => t.id)).not.toContain(liveTripId);
      expect(
        await prisma.notification.count({
          where: { userId: otherDriverId, title: { startsWith: 'You are driving' } },
        }),
      ).toBe(1);
      expect(
        await prisma.notification.count({
          where: { userId: driverId, title: { endsWith: 'moved to another driver' } },
        }),
      ).toBe(1);

      // A trip that has left the depot keeps its driver; an unknown driver is not found.
      const left = await dispatcher
        .post(`/api/plan/trips/${otherTripId}/driver`)
        .send({ driverId })
        .expect(409);
      expect(left.body.reason).toBe('PLAN_LOCKED');
      await dispatcher
        .post(`/api/plan/trips/${liveTripId}/driver`)
        .send({ driverId: 'no-such-driver' })
        .expect(404);

      const back = await dispatcher
        .post(`/api/plan/trips/${liveTripId}/driver`)
        .send({ driverId: null })
        .expect(200);
      expect(back.body).toMatchObject({ driverId: driverId, driverAssigned: false });
    } finally {
      await prisma.trip.update({ where: { id: liveTripId }, data: { assignedDriverId: null } });
    }
  });

  it('lists notices for the driver and marks them read', async () => {
    const notice = await prisma.notification.create({
      data: { userId: driverId, title: 'E2E driver notice', body: 'Hello', link: '/drive' },
    });
    const before = (await driverAgent.get('/api/driver/day').expect(200)).body as DriverDayResponse;
    expect(before.unreadNotices).toBeGreaterThanOrEqual(1);
    const list = (await driverAgent.get('/api/driver/notices').expect(200)).body;
    expect(list.find((n: { id: string }) => n.id === notice.id)).toMatchObject({
      title: 'E2E driver notice',
      read: false,
    });
    await driverAgent.post(`/api/driver/notices/${notice.id}/read`).expect(200);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: notice.id } })).read).toBe(
      true,
    );
  });
});
