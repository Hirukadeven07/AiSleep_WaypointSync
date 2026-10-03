import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { DriverDayResponse } from '@waypoint/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

const DAY = '2026-10-01';
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
        depotId: 'Peliyagoda',
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
    await app.init();
    prisma = app.get(PrismaService);

    const stamp = Date.now();
    districtName = `Day District ${stamp}`;
    const district = await prisma.district.create({
      data: { name: districtName, depotId: 'Peliyagoda' },
    });
    districtId = district.id;

    const named = await prisma.store.create({
      data: {
        id: `DAY-STORE-A-${stamp}`,
        displayName: 'Day Store',
        brand: 'Fresh',
        districtId,
        depotId: 'Peliyagoda',
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
        depotId: 'Peliyagoda',
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
        depotId: 'Peliyagoda',
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
        depotId: 'Peliyagoda',
        pinHash: 'unused',
      },
    });
    otherDriverId = otherDriver.id;
    otherVehicleId = `DAY-OTHER-${stamp}`;
    await prisma.vehicle.create({
      data: {
        id: otherVehicleId,
        depotId: 'Peliyagoda',
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
    await createTrip({
      vehicleId: otherVehicleId,
      serviceDate: DAY,
      tripNumber: 1,
      status: 'on_road',
    });

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
    const vehicleIds = [vehicleId, otherVehicleId].filter(Boolean);
    await prisma.tripStop.deleteMany({ where: { trip: { vehicleId: { in: vehicleIds } } } });
    await prisma.trip.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.order.deleteMany({ where: { storeId: { in: [namedStoreId, bareStoreId] } } });
    await prisma.store.deleteMany({ where: { id: { in: [namedStoreId, bareStoreId] } } });
    if (districtId) await prisma.district.delete({ where: { id: districtId } });
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
      expect(res.body).toEqual({ serviceDate: DAY, vehicle: null, trips: [], activeTripId: null });
    } finally {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { driverId } });
    }
  });
});
