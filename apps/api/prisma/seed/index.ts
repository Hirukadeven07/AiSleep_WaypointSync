import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { loadAllCsv, loadServiceAllowance } from './load-csv';
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

/** One outlet manager per store. Login id = outlet id (OUT001…), password waypoint. */
async function seedOutletManagers() {
  const stores = await prisma.store.findMany({ orderBy: { id: 'asc' } });
  if (stores.length === 0) {
    console.warn('[seed] no stores - skipping outlet managers');
    return;
  }
  const passwordHash = await argon2.hash('waypoint');
  for (const store of stores) {
    const name = `${store.displayName ?? store.id} manager`;
    await prisma.user.upsert({
      where: { loginId: store.id },
      update: { role: 'store', name, storeId: store.id, passwordHash },
      create: {
        loginId: store.id,
        role: 'store',
        name,
        storeId: store.id,
        passwordHash,
      },
    });
  }
  console.log(`[seed] ${stores.length} outlet managers ready (login = outlet id, password waypoint)`);
}

function dataDir() {
  return resolve(process.env.DATA_DIR ?? resolve(__dirname, '../../../../data'));
}

async function warnIfCsvEmpty() {
  const dir = dataDir();
  if ((await prisma.store.count()) === 0) {
    console.warn(`[seed] no stores after CSV load - check DATA_DIR (${dir}) has outlets.csv`);
  }
  if ((await prisma.vehicle.count()) === 0) {
    console.warn(`[seed] no vehicles after CSV load - check DATA_DIR (${dir}) has vehicles.csv`);
  }
}

async function main() {
  const reset = process.env.SEED_RESET === '1';
  const dir = dataDir();
  if (reset) {
    await truncateAll();
  } else if ((await prisma.depot.count()) > 0) {
    console.log('[seed] database already seeded - skipping CSV (use pnpm seed:reset to reseed)');
    await loadServiceAllowance(prisma, dir);
    await seedOutletManagers();
    await seedTeamErd(prisma);
    return;
  }

  for (const [id, name] of [
    ['Peliyagoda', 'Peliyagoda Depot'],
    ['Kandy', 'Kandy Depot'],
  ]) {
    await prisma.depot.upsert({ where: { id }, update: { name }, create: { id, name } });
  }

  console.log(`[seed] reading CSVs from ${dir}`);
  await loadAllCsv(prisma, dir);
  await warnIfCsvEmpty();

  await seedUsers();
  await seedOutletManagers();
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
