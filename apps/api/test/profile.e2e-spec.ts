import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

// Needs a seeded database (users only). Every seeded user it touches is put back in afterAll.
const DEPOT = 'E2E-PROFILE-DEPOT';
const USERS = ['nimal', 'sampath', 'kasun', 'sunil'];

describe('profile: depot, password and notification preferences (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let saved: {
    loginId: string;
    depotId: string | null;
    passwordHash: string | null;
    pinHash: string | null;
    notificationPrefs: Prisma.JsonValue;
  }[] = [];

  async function login(body: object) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/login').send(body).expect(200);
    return agent;
  }
  const dispatcher = () => login({ role: 'dispatcher', loginId: 'nimal', secret: 'waypoint' });
  const loader = () => login({ role: 'loader', loginId: 'sampath', depotId: 'depo1' });
  const driver = () => login({ role: 'driver', loginId: 'kasun', secret: '1234' });
  const store = () => login({ role: 'store', loginId: 'sunil', secret: 'waypoint' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new DomainErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);

    saved = await prisma.user.findMany({
      where: { loginId: { in: USERS } },
      select: {
        loginId: true,
        depotId: true,
        passwordHash: true,
        pinHash: true,
        notificationPrefs: true,
      },
    });
    await prisma.depot.upsert({
      where: { id: DEPOT },
      update: {},
      create: { id: DEPOT, name: 'E2E profile depot' },
    });
    await prisma.user.update({
      where: { loginId: 'sunil' },
      data: { notificationPrefs: Prisma.DbNull },
    });
  });

  afterAll(async () => {
    if (prisma) {
      for (const u of saved) {
        await prisma.user.update({
          where: { loginId: u.loginId },
          data: {
            depotId: u.depotId,
            passwordHash: u.passwordHash,
            pinHash: u.pinHash,
            notificationPrefs: u.notificationPrefs ?? Prisma.DbNull,
          },
        });
      }
      await prisma.depot.deleteMany({ where: { id: DEPOT } });
    }
    await app?.close();
  });

  describe('depot', () => {
    it('lets the dispatcher and the loader switch depot', async () => {
      const desk = await dispatcher();
      const me = await desk.patch('/api/me/depot').send({ depotId: DEPOT }).expect(200);
      expect(me.body).toMatchObject({ role: 'dispatcher', depotId: DEPOT });
      expect((await desk.get('/api/me').expect(200)).body.depotId).toBe(DEPOT);
      await desk.patch('/api/me/depot').send({ depotId: 'depo1' }).expect(200);

      const dock = await loader();
      const moved = await dock.patch('/api/me/depot').send({ depotId: DEPOT }).expect(200);
      expect(moved.body).toMatchObject({ role: 'loader', depotId: DEPOT });
      await dock.patch('/api/me/depot').send({ depotId: 'depo1' }).expect(200);
    });

    it('refuses the store and the driver, and an unknown depot', async () => {
      await (await store()).patch('/api/me/depot').send({ depotId: DEPOT }).expect(403);
      await (await driver()).patch('/api/me/depot').send({ depotId: DEPOT }).expect(403);
      const desk = await dispatcher();
      await desk.patch('/api/me/depot').send({ depotId: 'No-Such-Depot' }).expect(404);
      await desk.patch('/api/me/depot').send({}).expect(400);
    });
  });

  describe('password', () => {
    it('changes the dispatcher password and signs out the other sessions only', async () => {
      const current = await dispatcher();
      const other = await dispatcher();

      const wrong = await current
        .post('/api/me/password')
        .send({ currentSecret: 'not-it', newSecret: 'waypoint-2026' })
        .expect(400);
      expect(wrong.body.reason).toBe('WRONG_CURRENT_SECRET');
      const weak = await current
        .post('/api/me/password')
        .send({ currentSecret: 'waypoint', newSecret: 'short' })
        .expect(400);
      expect(weak.body.reason).toBe('WEAK_SECRET');
      // A failed attempt changes nothing.
      await other.get('/api/me').expect(200);

      const ok = await current
        .post('/api/me/password')
        .send({ currentSecret: 'waypoint', newSecret: 'waypoint-2026' })
        .expect(200);
      expect(ok.body).toEqual({ ok: true });
      await current.get('/api/me').expect(200);
      await other.get('/api/me').expect(401);

      await login({ role: 'dispatcher', loginId: 'nimal', secret: 'waypoint-2026' });
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ role: 'dispatcher', loginId: 'nimal', secret: 'waypoint' })
        .expect(401);
    });

    it('lets a loader with no PIN set a first one, and refuses a missing current password', async () => {
      await prisma.user.update({ where: { loginId: 'sampath' }, data: { pinHash: null } });
      const dock = await loader();
      await dock.post('/api/me/password').send({ newSecret: '2468' }).expect(200);
      const saved = await prisma.user.findUniqueOrThrow({ where: { loginId: 'sampath' } });
      expect(saved.pinHash).toBeTruthy();
      // With a PIN now set, the current one is required.
      const again = await dock.post('/api/me/password').send({ newSecret: '1357' }).expect(400);
      expect(again.body.reason).toBe('WRONG_CURRENT_SECRET');

      // The store manager's password is not changed by the other tests here.
      const shop = await store();
      const missing = await shop
        .post('/api/me/password')
        .send({ newSecret: 'waypoint-2027' })
        .expect(400);
      expect(missing.body.reason).toBe('WRONG_CURRENT_SECRET');
    });

    it('changes the driver PIN and keeps PINs to 4-6 digits', async () => {
      const phone = await driver();
      const wrong = await phone
        .post('/api/me/password')
        .send({ currentSecret: '0000', newSecret: '5678' })
        .expect(400);
      expect(wrong.body.reason).toBe('WRONG_CURRENT_SECRET');
      for (const newSecret of ['12ab', '123', '1234567']) {
        const weak = await phone
          .post('/api/me/password')
          .send({ currentSecret: '1234', newSecret })
          .expect(400);
        expect(weak.body.reason).toBe('WEAK_SECRET');
      }
      await phone
        .post('/api/me/password')
        .send({ currentSecret: '1234', newSecret: '5678' })
        .expect(200);
      await login({ role: 'driver', loginId: 'kasun', secret: '5678' });
    });
  });

  describe('notification preferences', () => {
    it('defaults to all on and round-trips a change', async () => {
      const desk = await store();
      const defaults = await desk.get('/api/me/notification-preferences').expect(200);
      expect(defaults.body).toEqual({
        deliveryUpdates: true,
        delayAlerts: true,
        incidentAlerts: true,
        planChanges: true,
      });

      const next = {
        deliveryUpdates: false,
        delayAlerts: true,
        incidentAlerts: false,
        planChanges: true,
      };
      const put = await desk.put('/api/me/notification-preferences').send(next).expect(200);
      expect(put.body).toEqual(next);
      expect((await desk.get('/api/me/notification-preferences').expect(200)).body).toEqual(next);
    });

    it('rejects unknown keys and missing or non-boolean values', async () => {
      const desk = await store();
      const all = {
        deliveryUpdates: true,
        delayAlerts: true,
        incidentAlerts: true,
        planChanges: true,
      };
      await desk
        .put('/api/me/notification-preferences')
        .send({ ...all, sosAlerts: false })
        .expect(400);
      await desk
        .put('/api/me/notification-preferences')
        .send({ deliveryUpdates: true })
        .expect(400);
      await desk
        .put('/api/me/notification-preferences')
        .send({ ...all, planChanges: 'yes' })
        .expect(400);
    });
  });
});
