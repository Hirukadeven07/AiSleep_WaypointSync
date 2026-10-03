import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Needs a seeded database (DATABASE_URL) - run `pnpm seed` first.
describe('auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/me without a session is 401', async () => {
    await request(app.getHttpServer()).get('/api/me').expect(401);
  });

  it('logs a dispatcher in with an HTTP-only cookie and reads /api/me', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/api/auth/login')
      .send({ role: 'dispatcher', loginId: 'nimal', secret: 'waypoint' })
      .expect(200);
    expect(res.body).toEqual({ role: 'dispatcher', home: '/dispatch' });
    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toContain('ws_session=');
    expect(cookie).toContain('HttpOnly');
    await agent.get('/api/me').expect(200);

    // The account card's details.
    const profile = (await agent.get('/api/me/profile').expect(200)).body;
    expect(profile).toMatchObject({
      loginId: 'nimal',
      role: 'dispatcher',
      depot: { id: 'Peliyagoda' },
      store: null,
    });
    expect(Date.parse(profile.signedInAt)).toBeLessThanOrEqual(
      Date.parse(profile.sessionExpiresAt),
    );
    await request(app.getHttpServer()).get('/api/me/profile').expect(401);
  });

  it('rejects a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ role: 'dispatcher', loginId: 'nimal', secret: 'nope' })
      .expect(401);
  });

  it('forbids a driver from a dispatcher route', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ role: 'driver', loginId: 'kasun', secret: '1234' })
      .expect(200);
    await agent.get('/api/orders').expect(403);
  });
});
