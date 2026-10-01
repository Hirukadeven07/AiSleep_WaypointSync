import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { loadAllCsv } from './load-csv';
import { seedDockStoreDemo } from './dock-store-demo';
import { seedTeamErd } from './team-erd';

const prisma = new PrismaClient();

async function truncateAll() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  console.log(`[seed] truncated ${tables.length} tables`);
}

async function seedUsers() {
  const store = await prisma.store.findFirst({
    where: { depotId: 'Peliyagoda', brand: 'Fresh' },
    orderBy: { id: 'asc' },
  });
  if (!store)
    console.warn('[seed] no Peliyagoda Fresh store found - store user gets storeId = null');

  const users = [
    {
      loginId: 'nimal',
      role: 'dispatcher' as const,
      name: 'Nimal (Dispatcher)',
      depotId: 'Peliyagoda',
      passwordHash: await argon2.hash('waypoint'),
    },
    {
      loginId: 'sunil',
      role: 'store' as const,
      name: 'Sunil (Store manager)',
      storeId: store?.id ?? null,
      passwordHash: await argon2.hash('waypoint'),
    },
    {
      loginId: 'sampath',
      role: 'loader' as const,
      name: 'Sampath (Loader)',
      depotId: 'Peliyagoda',
    },
    {
      loginId: 'kasun',
      role: 'driver' as const,
      name: 'Kasun (Driver)',
      depotId: 'Peliyagoda',
      pinHash: await argon2.hash('1234'),
    },
  ];
  for (const u of users) {
    await prisma.user.upsert({ where: { loginId: u.loginId }, update: u, create: u });
  }
  console.log(`[seed] ${users.length} users ready`);
}

async function main() {
  const reset = process.env.SEED_RESET === '1';
  if (reset) {
    await truncateAll();
  } else if ((await prisma.depot.count()) > 0) {
    console.log('[seed] database already seeded - skipping CSV (use pnpm seed:reset to reseed)');
    await seedTeamErd(prisma);
    return;
  }

  for (const [id, name] of [
    ['Peliyagoda', 'Peliyagoda Depot'],
    ['Kandy', 'Kandy Depot'],
  ]) {
    await prisma.depot.upsert({ where: { id }, update: { name }, create: { id, name } });
  }

  const dataDir = resolve(process.env.DATA_DIR ?? resolve(__dirname, '../../../../data'));
  console.log(`[seed] reading CSVs from ${dataDir}`);
  await loadAllCsv(prisma, dataDir);

  await seedUsers();
  await seedDockStoreDemo(prisma);
  await seedTeamErd(prisma);
  console.log('[seed] done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
