import 'reflect-metadata';
import * as argon2 from 'argon2';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StoreService } from '../src/store/store.service';

// Needs a seeded database (users only; the CSVs are optional). Builds and removes its own trips.
// Catalogue items and the loader/dispatcher profiles are upserted so the ERD rows can be checked.
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
  // Dispatcher notices this run raises (new orders, store reports) are removed in afterAll.
  const startedAt = new Date();

  async function login(body: object) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send(body).expect(200);
    return agent;
  }

  async function order(storeId: string, lines: { name: string; qty: number; itemId?: string }[]) {
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

    for (const [id, itemName] of [
      ['F-MILK', 'Fresh milk'],
      ['F-BREAD', 'Bread'],
      ['F-YOG', 'Yoghurt'],
      ['T-PHONE', 'Smartphones'],
    ] as const) {
      await prisma.item.upsert({ where: { id }, update: {}, create: { id, itemName } });
    }
    const sampath = await prisma.user.findUniqueOrThrow({ where: { loginId: 'sampath' } });
    await prisma.loader.upsert({
      where: { userId: sampath.id },
      update: {},
      create: { userId: sampath.id },
    });
    const nimal = await prisma.user.findUniqueOrThrow({ where: { loginId: 'nimal' } });
    const dispatcher = await prisma.dispatcher.upsert({
      where: { userId: nimal.id },
      update: {},
      create: { userId: nimal.id },
    });

    const district = await prisma.district.create({
      data: { name: `E2E District ${Date.now()}`, depotId: 'depo1' },
    });
    ids.district = district.name;
    const store = (id: string) =>
      prisma.store.create({
        data: {
          id,
          displayName: id,
          brand: 'Fresh',
          districtId: district.name,
          depotId: 'depo1',
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
        depotId: 'depo1',
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
      depotId: 'depo1',
      brand: 'Fresh' as const,
      districtId: district.name,
      serviceDate: date(DAY),
    };
    const loadTrip = await prisma.trip.create({
      data: { ...base, tripNumber: 1, status: 'published' },
    });
    ids.loadTrip = loadTrip.id;
    await prisma.loadingJob.create({
      data: {
        tripId: loadTrip.id,
        depot: 'depo1',
        assignedById: dispatcher.id,
        bay: 'Bay-9',
        instructions: 'Chilled first.',
      },
    });
    const a = await order('E2E-A', [{ name: 'Milk', qty: 4, itemId: 'F-MILK' }]);
    const b = await order('E2E-B', [
      { name: 'Yoghurt', qty: 2, itemId: 'F-YOG' },
      { name: 'Bread', qty: 3, itemId: 'F-BREAD' },
    ]);
    await prisma.tripStop.create({ data: { tripId: loadTrip.id, orderId: a.id, sequence: 1 } });
    await prisma.tripStop.create({ data: { tripId: loadTrip.id, orderId: b.id, sequence: 2 } });

    const storeTrip = await prisma.trip.create({
      data: { ...base, tripNumber: 2, status: 'on_road' },
    });
    ids.storeTrip = storeTrip.id;
    const home = await order('E2E-HOME', [
      { name: 'Milk', qty: 6, itemId: 'F-MILK' },
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
      const e2eStores = { in: ['E2E-A', 'E2E-B', 'E2E-HOME'] };
      await prisma.fieldFlag.deleteMany({ where: { storeId: e2eStores } });
      await prisma.deliveryNote.deleteMany({ where: { order: { storeId: e2eStores } } });
      await prisma.notification.deleteMany({ where: { title: 'E2E-HOME checked the goods' } });
      await prisma.notification.deleteMany({
        where: {
          title: { in: ['New order', 'Store report', 'Order cancelled'] },
          createdAt: { gte: startedAt },
        },
      });
      await prisma.trip.deleteMany({ where: { id: { in: [ids.loadTrip, ids.storeTrip] } } });
      await prisma.order.deleteMany({ where: { storeId: { in: ['E2E-A', 'E2E-B', 'E2E-HOME'] } } });
      await prisma.user.update({ where: { loginId: 'sunil' }, data: { storeId: sunilStoreId } });
      await prisma.vehicle.deleteMany({ where: { id: 'E2E-REEFER' } });
      await prisma.store.deleteMany({ where: { id: { in: ['E2E-A', 'E2E-B', 'E2E-HOME'] } } });
      await prisma.district.deleteMany({ where: { name: ids.district } });
    }
    await app?.close();
  });

  describe('loader', () => {
    it('lists the published trip and loads it last stop first', async () => {
      const loader = await login({ role: 'loader', secret: '123456', depotId: 'depo1' });
      const queue = await loader.get('/api/loads').expect(200);
      const card = queue.body.find((t: { tripId: string }) => t.tripId === ids.loadTrip);
      expect(card.job).toMatchObject({ bay: 'Bay-9', status: 'assigned' });

      // Each loader confirms their own ID and PIN; a wrong PIN, a stranger's ID or no PIN adds no one.
      // The dock tablet's own account has no PIN, but it is not a loader who can join the load.
      const start = (body: object) => loader.post(`/api/loads/${ids.loadTrip}/start`).send(body);
      for (const body of [
        { loaderId: 'sampath', pin: '9999' },
        { loaderId: 'nobody', pin: '1234' },
        { loaderId: 'nimal', pin: '1234' },
        { loaderId: 'dock-depo1' },
      ]) {
        const refused = await start(body).expect(400);
        expect(refused.body.reason).toBe('WRONG_LOADER_CREDENTIALS');
      }
      expect(await prisma.loadSession.findUnique({ where: { tripId: ids.loadTrip } })).toBeNull();
      // A loader with no PIN set is let in on the ID alone, and a PIN is then not asked for.
      await prisma.user.update({ where: { loginId: 'sampath' }, data: { pinHash: null } });
      await start({ loaderId: 'SAMPATH' }).expect(200);
      await prisma.loadSession.delete({ where: { tripId: ids.loadTrip } });
      await prisma.user.update({
        where: { loginId: 'sampath' },
        data: { pinHash: await argon2.hash('1234') },
      });

      const started = await start({ loaderId: 'sampath', pin: '1234' }).expect(200);
      expect(started.body.status).toBe('loading');
      expect(started.body.loadOrder.map((s: { sequence: number }) => s.sequence)).toEqual([2, 1]);
      expect(started.body.session.loaderNames).toContain('Sampath (Loader)');
      expect(started.body.job.status).toBe('picking');

      const notes = await prisma.deliveryNote.findMany({
        where: { order: { storeId: { in: ['E2E-A', 'E2E-B'] } } },
        include: { lines: true, loaders: true },
      });
      expect(notes).toHaveLength(2);
      for (const n of notes) {
        expect(n.status).toBe('picking');
        expect(n.validTo).toBeNull();
        expect(n.loaders).toHaveLength(1);
      }
    });

    it('flags a line, locks on a plan change, and departs after acknowledging', async () => {
      const loader = await login({ role: 'loader', secret: '123456', depotId: 'depo1' });
      const sheet = (await loader.get(`/api/loads/${ids.loadTrip}`).expect(200)).body;
      const stop = sheet.loadOrder[0];
      const flagged = await loader
        .post(`/api/loads/${ids.loadTrip}/flags`)
        .send({ stopId: stop.stopId, orderLineId: stop.lines[0].id, type: 'missing', qty: 1 })
        .expect(200);
      expect(flagged.body.loadOrder[0].flags).toHaveLength(1);

      // The dispatcher takes E2E-A off the trip mid-load; the dock pauses and shows it in red.
      const dispatcher = await login({ role: 'dispatcher', loginId: 'nimal', secret: 'waypoint' });
      const removedOrder = sheet.loadOrder.find(
        (s: { storeName: string }) => s.storeName === 'E2E-A',
      );
      const stopRow = await prisma.tripStop.findUniqueOrThrow({
        where: { id: removedOrder.stopId },
      });
      await dispatcher.post('/api/plan/unassign').send({ orderId: stopRow.orderId }).expect(200);
      const locked = (await loader.get(`/api/loads/${ids.loadTrip}`).expect(200)).body;
      expect(locked.planVersion).toBe(2);
      expect(locked.lock).toMatchObject({
        locked: true,
        removed: [{ orderId: stopRow.orderId, storeName: 'E2E-A' }],
        added: [],
      });
      await loader
        .post(`/api/loads/${ids.loadTrip}/flags`)
        .send({ stopId: stop.stopId, orderLineId: stop.lines[1].id, type: 'damaged' })
        .expect(409);

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

      await loader
        .post(`/api/loads/${ids.loadTrip}/taken-off`)
        .send({ orderId: stopRow.orderId })
        .expect(200);
      const acked = await loader.post(`/api/loads/${ids.loadTrip}/ack`).expect(200);
      expect(acked.body.lock.locked).toBe(false);
      // E2E-A left the truck: its delivery note now has a current 'removed' version.
      const removedNote = await prisma.deliveryNote.findFirstOrThrow({
        where: { orderId: stopRow.orderId, validTo: null },
      });
      expect(removedNote).toMatchObject({
        status: 'removed',
        changeReason: 'taken off the trip by dispatch (plan v2)',
      });
      expect(await prisma.deliveryNote.count({ where: { dnId: removedNote.dnId } })).toBe(2);

      const departed = await loader
        .post(`/api/loads/${ids.loadTrip}/depart`)
        .send({ planVersion: 2 })
        .expect(200);
      expect(departed.body.flags).toHaveLength(1);
      expect(departed.body.flags[0].reviewStatus).toBe('pending_dispatcher');
      const trip = await prisma.trip.findUniqueOrThrow({
        where: { id: ids.loadTrip },
        include: { loadingJob: true },
      });
      expect(trip.status).toBe('on_road');
      expect(trip.loadingJob?.status).toBe('handed_over');

      // Loading order is LIFO, so loadOrder[0] is E2E-B; its first line by name is Bread (3).
      const loaded = await prisma.deliveryNote.findFirstOrThrow({
        where: { order: { storeId: 'E2E-B' }, validTo: null },
        include: { lines: true, loaderFlags: true },
      });
      expect(loaded.status).toBe('loaded');
      expect(loaded.lines.find((l) => l.itemId === 'F-BREAD')?.qtyConfirmed).toBe(2);
      expect(loaded.lines.find((l) => l.itemId === 'F-YOG')?.qtyConfirmed).toBe(2);
      expect(loaded.loaderFlags).toHaveLength(1);
      expect(loaded.loaderFlags[0]).toMatchObject({
        scope: 'item',
        itemId: 'F-BREAD',
        reason: 'missing',
        validationStatus: 'pending_dispatcher',
      });
      const versions = await prisma.deliveryNote.count({ where: { dnId: loaded.dnId } });
      expect(versions).toBe(2);
    });

    it('keeps the store out of loader routes', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      await store.get('/api/loads').expect(403);
    });

    it('lets several loaders join one trip and frees a loader after that trip is loaded', async () => {
      const plate = 'WP E2E-OPEN';
      const stores = ['E2E-C', 'E2E-D'];
      const vehicles = ['E2E-VAN-1', 'E2E-VAN-2'];
      const logins = ['E2E-L1', 'E2E-L2'];
      const tripIds: string[] = [];
      const clear = async () => {
        await prisma.deliveryNote.deleteMany({ where: { order: { storeId: { in: stores } } } });
        await prisma.trip.deleteMany({ where: { id: { in: tripIds } } });
        await prisma.trip.deleteMany({ where: { vehicleId: { in: vehicles } } });
        await prisma.order.deleteMany({ where: { storeId: { in: stores } } });
        await prisma.vehicle.deleteMany({ where: { id: { in: vehicles } } });
        await prisma.store.deleteMany({ where: { id: { in: stores } } });
        await prisma.user.deleteMany({ where: { loginId: { in: logins } } });
      };
      const loader = await login({ role: 'loader', secret: '123456', depotId: 'depo1' });
      try {
        await clear();
        for (const id of stores) {
          await prisma.store.create({
            data: {
              id,
              displayName: id,
              brand: 'Fresh',
              districtId: ids.district,
              depotId: 'depo1',
              dockType: 'street',
              windowOpenMin: 300,
              windowCloseMin: 480,
            },
          });
        }
        for (const [loginId, name] of [
          ['E2E-L1', 'E2E Loader One'],
          ['E2E-L2', 'E2E Loader Two'],
        ] as const) {
          await prisma.user.create({
            data: {
              loginId,
              role: 'loader',
              name,
              depotId: 'depo1',
              loaderProfile: { create: {} },
            },
          });
        }
        for (const [index, vehicleId] of vehicles.entries()) {
          await prisma.vehicle.create({
            data: {
              id: vehicleId,
              numberPlate: index === 0 ? plate : 'WP E2E-NEXT',
              depotId: 'depo1',
              type: 'truck',
              temp: 'reefer',
              weightCapKg: 3000,
              volumeCapM3: 20,
            },
          });
          const placed = await order(stores[index]!, [{ name: 'Milk', qty: 1, itemId: 'F-MILK' }]);
          const trip = await prisma.trip.create({
            data: {
              vehicleId,
              depotId: 'depo1',
              brand: 'Fresh',
              districtId: ids.district,
              serviceDate: date(DAY),
              tripNumber: 1,
              status: 'published',
            },
          });
          tripIds.push(trip.id);
          await prisma.tripStop.create({
            data: { tripId: trip.id, orderId: placed.id, sequence: 1 },
          });
        }

        const start = (tripId: string, loaderId: string) =>
          loader.post(`/api/loads/${tripId}/start`).send({ loaderId });
        const first = await start(tripIds[0]!, 'E2E-L1').expect(200);
        expect(first.body.session.loaderNames).toEqual(['E2E Loader One']);
        const both = await start(tripIds[0]!, 'E2E-L2').expect(200);
        expect(both.body.session.loaderNames).toEqual(['E2E Loader One', 'E2E Loader Two']);

        const again = await start(tripIds[0]!, 'E2E-L1').expect(409);
        expect(again.body.reason).toBe('LOADER_ALREADY_ON_TRIP');

        const busy = await start(tripIds[1]!, 'E2E-L1').expect(409);
        expect(busy.body.reason).toBe('LOADER_ON_ANOTHER_TRIP');
        expect(busy.body.message).toContain(plate);

        await loader.post(`/api/loads/${tripIds[0]}/depart`).send({ planVersion: 1 }).expect(200);
        const freed = await start(tripIds[1]!, 'E2E-L1').expect(200);
        expect(freed.body.session.loaderNames).toEqual(['E2E Loader One']);
      } finally {
        await clear();
      }
    });
  });

  describe('store', () => {
    it('takes orders before 16:00 and dates them for the next day after', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      const nimal = await prisma.user.findUniqueOrThrow({ where: { loginId: 'nimal' } });
      const newOrders = () =>
        prisma.notification.count({
          where: { userId: nimal.id, title: 'New order', link: '/dispatch/plan' },
        });
      const before = await newOrders();
      const placed = await store
        .post('/api/store/orders')
        .send({ lines: [{ catalogueId: 'F-MILK', qty: 2 }] })
        .expect(201);
      expect(placed.body.deliveryDate).toBe(DAY);
      // The depot's dispatcher hears about it under Planning.
      expect(await newOrders()).toBe(before + 1);
      expect(placed.body.status).toBe('waiting');
      const lines = await prisma.orderLine.findMany({ where: { orderId: placed.body.id } });
      expect(lines.map((l) => l.itemId)).toEqual(['F-MILK']);

      process.env.DEMO_NOW = EVENING;
      try {
        const late = await store
          .post('/api/store/orders')
          .send({ lines: [{ catalogueId: 'F-MILK', qty: 2 }] })
          .expect(201);
        expect(late.body.deliveryDate).toBe('2026-10-02');
        expect(late.body.status).toBe('waiting');
      } finally {
        process.env.DEMO_NOW = MORNING;
      }
    });

    it('dates the order as the day it is placed, even when the next day is closed', async () => {
      const days = [date('2026-10-02'), date('2026-10-03')];
      const saved = await prisma.calendarDay.findMany({ where: { id: { in: days } } });
      const row = (id: Date, isOperating: boolean) => ({
        id,
        dow: id.getUTCDay(),
        isWeekend: false,
        isoYear: 2026,
        isoWeek: 40,
        isPayday: false,
        isHoliday: !isOperating,
        monsoon: false,
        isOperating,
      });
      try {
        for (const [id, open] of [
          [days[0]!, false],
          [days[1]!, true],
        ] as const) {
          await prisma.calendarDay.upsert({
            where: { id },
            update: { isOperating: open },
            create: row(id, open),
          });
        }
        const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
        const placed = await store
          .post('/api/store/orders')
          .send({ lines: [{ catalogueId: 'F-MILK', qty: 1 }] })
          .expect(201);
        expect(placed.body.deliveryDate).toBe(DAY);
      } finally {
        await prisma.calendarDay.deleteMany({ where: { id: { in: days } } });
        for (const { id, ...rest } of saved) {
          await prisma.calendarDay.create({ data: { id, ...rest } });
        }
      }
    });

    it('confirms receipt with a missing line, then refuses a second receipt', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      const home = (await store.get('/api/store/home').expect(200)).body;
      expect(home.delivery.stopId).toBe(ids.storeStop);
      expect(Array.isArray(home.phones)).toBe(true);

      // The trip's assigned driver is told the goods were checked (the test vehicle has no driver).
      const kasun = await prisma.user.findUniqueOrThrow({ where: { loginId: 'kasun' } });
      await prisma.trip.update({
        where: { id: ids.storeTrip },
        data: { assignedDriverId: kasun.id },
      });
      const noticesBefore = await prisma.notification.count({
        where: { userId: kasun.id, title: 'E2E-HOME checked the goods' },
      });
      const nimal = await prisma.user.findUniqueOrThrow({ where: { loginId: 'nimal' } });
      const reports = () =>
        prisma.notification.count({
          where: { userId: nimal.id, title: 'Store report', body: { contains: 'missing' } },
        });
      const reportsBefore = await reports();

      const delivery = (await store.get(`/api/store/deliveries/${ids.storeStop}`).expect(200)).body;
      const [first, second] = delivery.lines;
      // Two quick taps: one receipt is saved, the other is refused rather than failing.
      const send = () =>
        store.post(`/api/store/deliveries/${ids.storeStop}/receipt`).send({
          lines: [
            { orderLineId: first.id, receivedQty: first.qty },
            { orderLineId: second.id, receivedQty: second.qty - 1, issue: 'missing' },
          ],
          chilledWasCold: true,
          signaturePng:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        });
      const taps = await Promise.all([send(), send()]);
      expect(taps.map((r) => r.status).sort()).toEqual([200, 409]);
      const confirmed = taps.find((r) => r.status === 200)!;
      expect(await prisma.storeReceipt.count({ where: { stopId: ids.storeStop } })).toBe(1);
      expect(confirmed.body.status).toBe('confirmed');
      expect(confirmed.body.storeConfirmedAt).toBeTruthy();
      expect(confirmed.body.signaturePhotoKey).toBe(`receipts/${ids.storeStop}/signature.png`);
      expect(confirmed.body.signedAt).toBeTruthy();

      const stop = await prisma.tripStop.findUniqueOrThrow({
        where: { id: ids.storeStop },
        include: { order: true },
      });
      expect(stop.order.status).toBe('partial');
      expect(confirmed.body.issues).toEqual([
        expect.objectContaining({
          reason: 'missing',
          qty: 1,
          driverDecision: 'pending',
          resolveStatus: false,
        }),
      ]);
      const flag = await prisma.fieldFlag.findFirstOrThrow({ where: { orderId: stop.orderId } });
      expect(flag).toMatchObject({
        tripId: ids.storeTrip,
        itemId: 'F-MILK',
        severity: 'medium',
        resolveStatus: false,
      });
      const flags = (await store.get('/api/store/flags').expect(200)).body;
      expect(flags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: flag.id,
            reason: 'missing',
            qty: 1,
            driverDecision: 'pending',
            resolveStatus: false,
            raisedAt: expect.any(String),
          }),
        ]),
      );
      expect(
        await prisma.notification.count({
          where: { userId: kasun.id, title: 'E2E-HOME checked the goods' },
        }),
      ).toBe(noticesBefore + 1);
      expect(confirmed.body.driverName).toBe(kasun.name);

      // A receipt with a problem is a store report for the dispatcher, under Stores.
      expect(await reports()).toBe(reportsBefore + 1);
      const dispatcher = await login({ role: 'dispatcher', loginId: 'nimal', secret: 'waypoint' });
      const panel = (await dispatcher.get('/api/dispatch/notices').expect(200)).body;
      const report = panel.notices.find(
        (n: { title: string; body: string }) =>
          n.title === 'Store report' && n.body.includes('missing'),
      );
      expect(report).toMatchObject({ category: 'stores', link: '/dispatch/board' });
      expect(panel.notices.find((n: { title: string }) => n.title === 'New order')).toMatchObject({
        category: 'planning',
      });
      expect(panel.counts.all).toBe(panel.notices.length);
      expect(panel.counts.stores).toBe(
        panel.notices.filter((n: { category: string }) => n.category === 'stores').length,
      );
      // Seen notices leave the panel; the store cannot mark the dispatcher's notices.
      await store.post(`/api/store/notices/${report.id}/read`).expect(200);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: report.id } })).read).toBe(
        false,
      );
      await dispatcher.post(`/api/dispatch/notices/${report.id}/read`).expect(200);
      const after = (await dispatcher.get('/api/dispatch/notices').expect(200)).body;
      expect(after.notices.some((n: { id: string }) => n.id === report.id)).toBe(false);
      expect(after.counts.all).toBe(panel.counts.all - 1);

      const again = await store
        .post(`/api/store/deliveries/${ids.storeStop}/receipt`)
        .send({ lines: [] })
        .expect(409);
      expect(again.body.reason).toBe('RECEIPT_NOT_READY');
    });

    it('shows a deferred order on home and sends the store a notice with the reason', async () => {
      const deferred = await prisma.order.create({
        data: {
          storeId: 'E2E-HOME',
          brand: 'Fresh',
          deliveryDate: date('2026-10-03'),
          movedFromDate: date('2026-10-02'),
          temp: 'ambient',
          status: 'deferred',
          deferReason: 'No truck capacity left',
          units: 4,
          weightKg: 20,
          volumeM3: 0.1,
        },
      });
      await app.get(StoreService).notifyDeferral(deferred.id);

      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      const home = (await store.get('/api/store/home').expect(200)).body;
      expect(home.deferral).toMatchObject({
        id: deferred.id,
        deliveryDate: '2026-10-03',
        deferReason: 'No truck capacity left',
      });
      const notices = (await store.get('/api/store/notices').expect(200)).body;
      const notice = notices.find(
        (n: { title: string }) => n.title === 'Delivery moved to Sat 3 Oct',
      );
      expect(notice.body).toContain('No truck capacity left');
      await prisma.notification.deleteMany({ where: { id: notice.id } });
    });

    it('stars catalogue items from any brand and refuses an unknown item', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      const sorted = (res: { body: string[] }) => [...res.body].sort();
      expect((await store.get('/api/store/saved').expect(200)).body).toEqual([]);

      await store.put('/api/store/saved/F-MILK').expect(200);
      // Starring the same item again keeps one row.
      expect(sorted(await store.put('/api/store/saved/F-MILK').expect(200))).toEqual(['F-MILK']);
      expect(sorted(await store.put('/api/store/saved/F-BREAD').expect(200))).toEqual([
        'F-BREAD',
        'F-MILK',
      ]);
      // E2E-HOME is a Fresh store; it may still star another brand's item.
      expect(sorted(await store.put('/api/store/saved/T-PHONE').expect(200))).toEqual([
        'F-BREAD',
        'F-MILK',
        'T-PHONE',
      ]);
      await store.put('/api/store/saved/NOT-AN-ITEM').expect(404);

      expect(sorted(await store.delete('/api/store/saved/F-MILK').expect(200))).toEqual([
        'F-BREAD',
        'T-PHONE',
      ]);
      expect(sorted(await store.get('/api/store/saved').expect(200))).toEqual([
        'F-BREAD',
        'T-PHONE',
      ]);
      expect(await prisma.storeSavedItem.count({ where: { storeId: 'E2E-HOME' } })).toBe(2);
    });

    it('offers every brand’s items, the store’s own brand first', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      const catalogue: { id: string; type: string }[] = (
        await store.get('/api/store/catalogue').expect(200)
      ).body;
      expect(catalogue).toHaveLength(35);
      expect(catalogue[0]!.id).toBe('F-MILK');
      expect([...new Set(catalogue.map((c) => c.type))]).toEqual([
        'chilled_food',
        'fresh',
        'style',
        'tech',
      ]);
    });

    it('takes an order of one kind of goods and refuses a mixed one', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      // Tech and chilled food cannot share an order; nothing is saved.
      const before = await prisma.order.count({ where: { storeId: 'E2E-HOME' } });
      const mixed = await store
        .post('/api/store/orders')
        .send({
          lines: [
            { catalogueId: 'T-PHONE', qty: 1 },
            { catalogueId: 'F-MILK', qty: 1 },
          ],
        })
        .expect(400);
      expect(mixed.body.message).toContain('one kind of goods');
      expect(await prisma.order.count({ where: { storeId: 'E2E-HOME' } })).toBe(before);

      // A Fresh store may order Tech on its own: an ambient order, still under the store's brand.
      const tech = await store
        .post('/api/store/orders')
        .send({ lines: [{ catalogueId: 'T-PHONE', qty: 2 }] })
        .expect(201);
      expect(tech.body.chilled).toBe(false);
      const saved = await prisma.order.findUniqueOrThrow({
        where: { id: tech.body.id },
        include: { lines: true },
      });
      expect(saved.brand).toBe('Fresh');
      expect(saved.temp).toBe('ambient');
      expect(saved.lines.map((l) => l.itemId)).toEqual(['T-PHONE']);
    });

    it('lists the latest order first with its lines, for "order again"', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      const placed = await store
        .post('/api/store/orders')
        .send({
          lines: [
            { catalogueId: 'F-BREAD', qty: 12 },
            { catalogueId: 'F-MILK', qty: 3 },
          ],
        })
        .expect(201);
      const recent = (await store.get('/api/store/orders/recent').expect(200)).body;
      expect(recent[0]).toMatchObject({ id: placed.body.id, status: 'waiting', units: 15 });
      expect(recent[0].lines).toEqual([
        { catalogueId: 'F-MILK', name: 'Fresh milk 1 L', qty: 3, pack: 'crate of 12' },
        { catalogueId: 'F-BREAD', name: 'Sandwich bread', qty: 12, pack: 'crate of 20' },
      ]);
    });

    it('cancels a waiting order and tells dispatch; a planned one stays', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      const nimal = await prisma.user.findUniqueOrThrow({ where: { loginId: 'nimal' } });
      const cancelNotices = () =>
        prisma.notification.count({ where: { userId: nimal.id, title: 'Order cancelled' } });

      const placed = await store
        .post('/api/store/orders')
        .send({ lines: [{ catalogueId: 'F-MILK', qty: 4 }] })
        .expect(201);
      const before = await cancelNotices();
      await store.delete(`/api/store/orders/${placed.body.id}`).expect(200);
      expect(await prisma.order.findUnique({ where: { id: placed.body.id } })).toBeNull();
      expect(await prisma.orderLine.count({ where: { orderId: placed.body.id } })).toBe(0);
      expect(await cancelNotices()).toBe(before + 1);
      const recent = (await store.get('/api/store/orders/recent').expect(200)).body;
      expect(recent.map((o: { id: string }) => o.id)).not.toContain(placed.body.id);
      // Cancelling it again finds nothing.
      await store.delete(`/api/store/orders/${placed.body.id}`).expect(404);

      // An order that is already planned is the dispatcher's to change.
      const planned = await order('E2E-HOME', [{ name: 'Milk', qty: 1, itemId: 'F-MILK' }]);
      const refused = await store.delete(`/api/store/orders/${planned.id}`).expect(409);
      expect(refused.body.message).toContain('Ask dispatch');
      expect(await prisma.order.findUnique({ where: { id: planned.id } })).not.toBeNull();

      // Another store's order is not found.
      const other = await order('E2E-A', [{ name: 'Milk', qty: 1, itemId: 'F-MILK' }]);
      await prisma.order.update({ where: { id: other.id }, data: { status: 'waiting' } });
      await store.delete(`/api/store/orders/${other.id}`).expect(404);
      expect(await prisma.order.findUnique({ where: { id: other.id } })).not.toBeNull();
    });

    it('does not cancel a waiting order that is on a trip', async () => {
      const store = await login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });
      // A stop on a trip with the status not yet moved on: the order must stay.
      const onTrip = await order('E2E-HOME', [{ name: 'Milk', qty: 1, itemId: 'F-MILK' }]);
      await prisma.order.update({ where: { id: onTrip.id }, data: { status: 'waiting' } });
      await prisma.tripStop.create({
        data: { tripId: ids.storeTrip, orderId: onTrip.id, sequence: 9 },
      });
      await store.delete(`/api/store/orders/${onTrip.id}`).expect(409);
      expect(await prisma.order.findUnique({ where: { id: onTrip.id } })).not.toBeNull();
    });
  });
});
