import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  fillNumberPlates,
  fillPlannerMinutes,
  fillStoreLocations,
  loadAllCsv,
  loadServiceAllowance,
} from './load-csv';
import { seedDockStoreDemo } from './dock-store-demo';
import { seedTeamErd } from './team-erd';
import { seedDispatchDemo } from './dispatch-demo';
import { seedDepotOrders } from './depot-orders';
import { seedDepotTrips } from './depot-trips';
import { linkDemoDriver, seedLicenceExpiry, seedSpineDemo } from './spine-demo';

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
    where: { depotId: 'depo1', brand: 'Fresh' },
    orderBy: { id: 'asc' },
  });
  if (!store)
    console.warn('[seed] no Peliyagoda Fresh store found - store user gets storeId = null');

  const users = [
    {
      loginId: 'nimal',
      role: 'dispatcher' as const,
      name: 'Nimal (Dispatcher)',
      depotId: 'depo1',
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
      depotId: 'depo1',
    },
    {
      loginId: 'kasun',
      role: 'driver' as const,
      name: 'Kasun (Driver)',
      depotId: 'depo1',
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
  console.log(
    `[seed] ${stores.length} outlet managers ready (login = outlet id, password waypoint)`,
  );
}

const DRIVER_NAMES = [
  'Amila', 'Bandara', 'Chaminda', 'Dinesh', 'Eranga', 'Fazil', 'Gayan', 'Hasitha',
  'Isuru', 'Janaka', 'Kamal', 'Lahiru', 'Madushanka', 'Nadeesha', 'Osanda', 'Pradeep',
  'Roshan', 'Saman', 'Tharindu', 'Udara', 'Vijitha', 'Wasana', 'Yasith', 'Ajith',
  'Buddhika', 'Chathura', 'Dilshan',
];

const LOADER_NAMES = [
  'Aruna', 'Bimal', 'Chamara', 'Duminda', 'Eshan', 'Feroze', 'Gihan', 'Harsha',
  'Indika', 'Jagath', 'Kasun', 'Lasantha', 'Mahesh', 'Nuwan', 'Oshan', 'Pasindu',
  'Ruwan', 'Sandun', 'Thusitha', 'Upul',
];

/** Family names for the User.name column. Login ids stay on loginId, not the surname. */
const FAMILY_NAMES = [
  'Perera', 'Silva', 'Fernando', 'Jayawardena', 'Wijesinghe', 'Rathnayake',
  'Gunasekara', 'Herath', 'Dissanayake', 'Senanayake', 'Weerasinghe', 'Abeysekera',
  'Pathirana', 'Liyanage', 'Karunaratne', 'Ekanayake', 'Jayasuriya', 'Mendis',
  'Peiris', 'Wickramasinghe', 'Fonseka', 'Amarasinghe', 'Balasuriya', 'Dias',
  'Alwis', 'Nazeer', 'Iqbal', 'Rajah', 'Selvan', 'Krishnan',
];

function personName(given: string, n: number) {
  const family = FAMILY_NAMES[(n * 11) % FAMILY_NAMES.length]!;
  return `${given} ${family}`;
}

const FLEET_DRIVER_COUNT = 70;
const FLEET_DRIVER_LEAVERS = 10;
const LOADERS_PER_DEPOT = 100;
const LOADER_LEAVERS_PER_DEPOT = 10;
const LEFT_ON = new Date(Date.UTC(2026, 2, 15));

function fleetDriverLogin(n: number) {
  return `D${String(n).padStart(3, '0')}`;
}

function fleetLoaderLogin(n: number) {
  return `L${String(n).padStart(3, '0')}`;
}

async function removeExtraFleetDrivers() {
  for (let n = FLEET_DRIVER_COUNT + 1; n <= 200; n++) {
    const loginId = fleetDriverLogin(n);
    const user = await prisma.user.findUnique({
      where: { loginId },
      include: { driverProfile: true },
    });
    if (!user) continue;
    await prisma.vehicle.updateMany({ where: { driverId: user.id }, data: { driverId: null } });
    await prisma.trip.updateMany({ where: { assignedDriverId: user.id }, data: { assignedDriverId: null } });
    await prisma.driverEvent.deleteMany({ where: { driverId: user.id } });
    if (user.driverProfile) {
      await prisma.locationPing.deleteMany({ where: { driverId: user.driverProfile.id } });
      await prisma.driverIncident.deleteMany({ where: { driverId: user.driverProfile.id } });
      await prisma.driver.delete({ where: { id: user.driverProfile.id } });
    }
    await prisma.user.delete({ where: { id: user.id } });
  }
}

/**
 * 70 drivers D001–D070. PIN 1234 (the driver keypad is 4 digits). Password waypont is unused at sign-in.
 * Active drivers (no leaving date) fill the trucks 1:1.
 * The last 10 (D061–D070) have leavingDate set and get no truck.
 */
async function seedFleetDrivers() {
  const vehicles = await prisma.vehicle.findMany({ orderBy: { id: 'asc' } });
  if (vehicles.length === 0) {
    console.warn('[seed] no vehicles - skipping fleet drivers');
    return;
  }
  const pinHash = await argon2.hash('1234');
  const passwordHash = await argon2.hash('waypont');
  const depots = await prisma.depot.findMany({ select: { id: true } });
  const depotIds = depots.map((d) => d.id);
  const fallbackDepot = vehicles[0]?.depotId ?? depotIds[0] ?? 'depo1';
  const activeCount = FLEET_DRIVER_COUNT - FLEET_DRIVER_LEAVERS;

  await prisma.vehicle.updateMany({ data: { driverId: null } });

  for (let n = 1; n <= FLEET_DRIVER_COUNT; n++) {
    const loginId = fleetDriverLogin(n);
    const active = n <= activeCount;
    const vehicle = active && n <= vehicles.length ? vehicles[n - 1] : undefined;
    const depotId = vehicle?.depotId ?? depotIds[(n - 1) % Math.max(depotIds.length, 1)] ?? fallbackDepot;
    const given = DRIVER_NAMES[(n - 1) % DRIVER_NAMES.length]!;
    const name = personName(given, n);
    const phone = `077${String(2000000 + n).slice(-7)}`;
    const user = await prisma.user.upsert({
      where: { loginId },
      update: {
        role: 'driver',
        name,
        depotId,
        passwordHash,
        pinHash,
      },
      create: {
        loginId,
        role: 'driver',
        name,
        depotId,
        passwordHash,
        pinHash,
      },
    });
    const joinDate = new Date(Date.UTC(2019, 0, 1 + ((n * 11) % 1400)));
    const leavingDate = active ? null : LEFT_ON;
    await prisma.driver.upsert({
      where: { userId: user.id },
      update: {
        licenseNo: `B${String(2000000 + n)}`,
        idNo: `${199000000 + n}V`,
        joinDate,
        leavingDate,
        lastLoginAt: active ? new Date() : new Date(Date.UTC(2026, 2, 10)),
        isActive: active,
      },
      create: {
        userId: user.id,
        licenseNo: `B${String(2000000 + n)}`,
        idNo: `${199000000 + n}V`,
        joinDate,
        leavingDate,
        lastLoginAt: active ? new Date() : new Date(Date.UTC(2026, 2, 10)),
        isActive: active,
      },
    });
    const driver = await prisma.driver.findUniqueOrThrow({ where: { userId: user.id } });
    await prisma.driverPhone.upsert({
      where: { phoneNumber: phone },
      update: { driverId: driver.id },
      create: { phoneNumber: phone, driverId: driver.id },
    });
    if (vehicle) {
      await prisma.vehicle.update({ where: { id: vehicle.id }, data: { driverId: user.id } });
    }
  }
  await removeExtraFleetDrivers();
  const assigned = Math.min(activeCount, vehicles.length);
  console.log(
    `[seed] ${FLEET_DRIVER_COUNT} fleet drivers ready (D001–D${String(activeCount).padStart(3, '0')} active, D${String(activeCount + 1).padStart(3, '0')}–D${String(FLEET_DRIVER_COUNT).padStart(3, '0')} left; ${assigned} trucks assigned; PIN 1234)`,
  );
}

/**
 * 100 loaders per depot (L001… Peliyagoda, then Kandy). Last 10 at each depot have left.
 * Login is loader id + depot; dock keypad is not checked. sampath stays as the demo login.
 */
async function seedFleetLoaders() {
  const depots = await prisma.depot.findMany({ select: { id: true }, orderBy: { id: 'desc' } });
  if (depots.length === 0) {
    console.warn('[seed] no depots - skipping fleet loaders');
    return;
  }
  let n = 0;
  for (const depot of depots) {
    for (let i = 1; i <= LOADERS_PER_DEPOT; i++) {
      n += 1;
      const loginId = fleetLoaderLogin(n);
      const active = i <= LOADERS_PER_DEPOT - LOADER_LEAVERS_PER_DEPOT;
      const given = LOADER_NAMES[(n - 1) % LOADER_NAMES.length]!;
      const name = personName(given, n);
      const user = await prisma.user.upsert({
        where: { loginId },
        update: { role: 'loader', name, depotId: depot.id },
        create: { loginId, role: 'loader', name, depotId: depot.id },
      });
      const joinDate = new Date(Date.UTC(2020, 0, 1 + ((n * 7) % 1200)));
      await prisma.loader.upsert({
        where: { userId: user.id },
        update: {
          employeeNo: `LDR-${loginId}`,
          idNo: `${198000000 + n}V`,
          shift: i % 2 === 1 ? 'morning' : 'night',
          joinDate,
          leavingDate: active ? null : LEFT_ON,
          lastLoginAt: active ? new Date() : new Date(Date.UTC(2026, 2, 10)),
          isActive: active,
        },
        create: {
          userId: user.id,
          employeeNo: `LDR-${loginId}`,
          idNo: `${198000000 + n}V`,
          shift: i % 2 === 1 ? 'morning' : 'night',
          joinDate,
          leavingDate: active ? null : LEFT_ON,
          lastLoginAt: active ? new Date() : new Date(Date.UTC(2026, 2, 10)),
          isActive: active,
        },
      });
    }
  }
  console.log(
    `[seed] ${depots.length * LOADERS_PER_DEPOT} fleet loaders ready (${LOADERS_PER_DEPOT} per depot; last ${LOADER_LEAVERS_PER_DEPOT} at each depot left)`,
  );
}

/** One Peliyagoda truck out of service, with a reason and a return time tomorrow at 14:30 Colombo. */
async function seedOutOfServiceDemo() {
  const colomboDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const back = new Date(`${colomboDate}T14:30:00+05:30`);
  back.setUTCDate(back.getUTCDate() + 1);

  const busy = await prisma.trip.findMany({
    where: { status: { in: ['loading', 'ready', 'on_road', 'breakdown'] } },
    select: { vehicleId: true },
  });
  const busyIds = new Set(busy.map((t) => t.vehicleId));
  const marked = await prisma.vehicle.findFirst({
    where: { outOfServiceReason: 'Brake service — rear pads' },
    orderBy: { id: 'asc' },
  });
  const vehicle =
    marked && !busyIds.has(marked.id)
      ? marked
      : await prisma.vehicle.findFirst({
          where: {
            depotId: 'depo1',
            id: { notIn: [...busyIds] },
            status: { not: 'on_road' },
          },
          orderBy: { id: 'desc' },
        });
  if (!vehicle) {
    console.warn('[seed] out-of-service demo skipped: no free Peliyagoda vehicle');
    return;
  }
  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: {
      status: 'out_of_service',
      outOfServiceReason: 'Brake service — rear pads',
      returnDate: back,
    },
  });
  console.log(
    `[seed] ${vehicle.id} (${vehicle.numberPlate ?? 'no plate'}) out of service: Brake service — rear pads, back ${back.toISOString()}`,
  );
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

/** Tomorrow's spine demo day, today's trips for the demo driver, and licence expiry dates. */
async function seedDemoDay() {
  await seedSpineDemo(prisma);
  await linkDemoDriver(prisma);
  await seedLicenceExpiry(prisma);
}

async function main() {
  const reset = process.env.SEED_RESET === '1';
  const dir = dataDir();
  if (reset) {
    await truncateAll();
  } else if ((await prisma.depot.count()) > 0) {
    console.log('[seed] database already seeded - skipping CSV (use pnpm seed:reset to reseed)');
    await loadServiceAllowance(prisma, dir);
    await fillPlannerMinutes(prisma);
    await fillStoreLocations(prisma);
    await fillNumberPlates(prisma);
    // The four demo logins are recreated on every seed, so a copied database always has them.
    await seedUsers();
    await seedOutletManagers();
    await seedFleetDrivers();
    await seedFleetLoaders();
    await seedTeamErd(prisma);
    await seedDispatchDemo(prisma);
    await seedOutOfServiceDemo();
    await seedDepotOrders(prisma);
    await seedDepotTrips(prisma);
    await seedDemoDay();
    return;
  }

  for (const [id, name] of [
    ['depo1', 'Peliyagoda'],
    ['depo2', 'Kandy'],
  ]) {
    await prisma.depot.upsert({ where: { id }, update: { name }, create: { id, name } });
  }

  console.log(`[seed] reading CSVs from ${dir}`);
  await loadAllCsv(prisma, dir);
  await fillPlannerMinutes(prisma);
  await fillStoreLocations(prisma);
  await fillNumberPlates(prisma);
  await warnIfCsvEmpty();

  await seedUsers();
  await seedOutletManagers();
  await seedFleetDrivers();
  await seedFleetLoaders();
  await seedDockStoreDemo(prisma);
  await seedTeamErd(prisma);
  await seedDispatchDemo(prisma);
  await seedOutOfServiceDemo();
  await seedDepotOrders(prisma);
  await seedDepotTrips(prisma);
  await seedDemoDay();
  console.log('[seed] done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
