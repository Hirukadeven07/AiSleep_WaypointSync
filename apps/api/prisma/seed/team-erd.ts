/**
 * Sample rows for the team ERD tables (Item, DeliveryNote, FieldFlag, LoaderFlag, …).
 * Idempotent: skips a block when its demo rows already exist.
 */
import type { PrismaClient } from '@prisma/client';
import { CATALOGUE } from '../../src/store/catalogue';

const VERSION_AT = new Date('2026-10-01T04:00:00.000Z');

export async function seedTeamErd(prisma: PrismaClient) {
  await seedCatalogue(prisma);
  await seedPeople(prisma);
  await linkOrderLines(prisma);
  await seedOps(prisma);
  console.log('[seed] team ERD sample rows ready');
}

/** Item and InventoryBatch rows for the catalogue. Idempotent; order lines reference these ids. */
export async function seedCatalogue(prisma: PrismaClient) {
  const all = [...CATALOGUE.Fresh, ...CATALOGUE.Style, ...CATALOGUE.Tech];
  for (const item of all) {
    await prisma.item.upsert({
      where: { id: item.id },
      update: {
        itemName: item.name,
        isChilled: item.chilled,
        packLabel: item.pack,
        packWeightKg: item.unitWeightKg,
      },
      create: {
        id: item.id,
        itemName: item.name,
        isChilled: item.chilled,
        packLabel: item.pack,
        packWeightKg: item.unitWeightKg,
      },
    });
    await prisma.inventoryBatch.upsert({
      where: { id: `BATCH-${item.id}` },
      update: { qty: 80 },
      create: {
        id: `BATCH-${item.id}`,
        itemId: item.id,
        batchName: `${item.id}-2026-W40`,
        manufacturingDate: new Date('2026-09-20T00:00:00Z'),
        expiryDate: item.chilled
          ? new Date('2026-10-20T00:00:00Z')
          : new Date('2027-09-20T00:00:00Z'),
        qty: 80,
      },
    });
  }
}

async function seedPeople(prisma: PrismaClient) {
  const kasun = await prisma.user.findUnique({ where: { loginId: 'kasun' } });
  const sampath = await prisma.user.findUnique({ where: { loginId: 'sampath' } });
  const nimal = await prisma.user.findUnique({ where: { loginId: 'nimal' } });
  const sunil = await prisma.user.findUnique({
    where: { loginId: 'sunil' },
    include: { store: true },
  });

  if (kasun) {
    const driver = await prisma.driver.upsert({
      where: { userId: kasun.id },
      update: { licenseNo: 'B1234567', idNo: '199012345V', isActive: true },
      create: {
        userId: kasun.id,
        licenseNo: 'B1234567',
        idNo: '199012345V',
        joinDate: new Date('2022-03-01T00:00:00Z'),
        lastLoginAt: new Date(),
      },
    });
    await prisma.driverPhone.upsert({
      where: { phoneNumber: '0771234567' },
      update: { driverId: driver.id },
      create: { phoneNumber: '0771234567', driverId: driver.id },
    });
  }

  if (sampath) {
    await prisma.loader.upsert({
      where: { userId: sampath.id },
      update: { employeeNo: 'LDR-014', shift: 'morning', isActive: true },
      create: {
        userId: sampath.id,
        employeeNo: 'LDR-014',
        idNo: '199512378V',
        shift: 'morning',
        joinDate: new Date('2023-06-15T00:00:00Z'),
        lastLoginAt: new Date(),
      },
    });
  }

  if (nimal) {
    await prisma.dispatcher.upsert({
      where: { userId: nimal.id },
      update: { employeeNo: 'DSP-001', isActive: true },
      create: {
        userId: nimal.id,
        employeeNo: 'DSP-001',
        lastLoginAt: new Date(),
      },
    });
  }

  if (sunil?.store) {
    const existing = await prisma.outletPhone.count({ where: { storeId: sunil.store.id } });
    if (existing === 0) {
      await prisma.outletPhone.createMany({
        data: [
          { storeId: sunil.store.id, phoneNo: '0112345678', label: 'shop' },
          { storeId: sunil.store.id, phoneNo: '0778765432', label: 'manager' },
        ],
      });
    }
  }
}

async function linkOrderLines(prisma: PrismaClient) {
  const items = await prisma.item.findMany();
  const byName = new Map(items.map((i) => [i.itemName, i.id]));
  const lines = await prisma.orderLine.findMany({ where: { itemId: null } });
  for (const line of lines) {
    const itemId = byName.get(line.name);
    if (!itemId) continue;
    await prisma.orderLine.update({ where: { id: line.id }, data: { itemId } });
  }
}

async function seedOps(prisma: PrismaClient) {
  const kasun = await prisma.user.findUnique({ where: { loginId: 'kasun' } });
  const driver = kasun ? await prisma.driver.findUnique({ where: { userId: kasun.id } }) : null;
  const sampath = await prisma.user.findUnique({ where: { loginId: 'sampath' } });
  const loader = sampath ? await prisma.loader.findUnique({ where: { userId: sampath.id } }) : null;
  const nimal = await prisma.user.findUnique({ where: { loginId: 'nimal' } });
  const dispatcher = nimal
    ? await prisma.dispatcher.findUnique({ where: { userId: nimal.id } })
    : null;

  const onRoad = await prisma.trip.findFirst({
    where: { status: 'on_road', depotId: 'Peliyagoda' },
    include: {
      stops: {
        orderBy: { sequence: 'asc' },
        include: { order: { include: { lines: true, store: true } } },
      },
    },
    orderBy: { publishedAt: 'desc' },
  });
  const published = await prisma.trip.findFirst({
    where: { status: 'published', depotId: 'Peliyagoda' },
    include: {
      stops: {
        orderBy: { sequence: 'asc' },
        include: { order: { include: { lines: true, store: true } } },
      },
    },
    orderBy: { publishedAt: 'desc' },
  });

  if (onRoad && kasun) {
    await prisma.trip.update({
      where: { id: onRoad.id },
      data: {
        assignedDriverId: kasun.id,
        csvRouteId: 'RTE-COL-01',
        tripStartingDate: onRoad.serviceDate,
        startingTime: onRoad.publishedAt ?? new Date(),
      },
    });
  }

  if (
    dispatcher &&
    published &&
    !(await prisma.loadingJob.findUnique({ where: { tripId: published.id } }))
  ) {
    await prisma.loadingJob.create({
      data: {
        tripId: published.id,
        depot: 'Peliyagoda',
        assignedById: dispatcher.id,
        bay: 'Bay-2',
        instructions: 'Chill first. Confirm DN version before handing over.',
        priority: 1,
        status: 'assigned',
        totalWeightKg: 420,
        totalVolumeM3: 4.8,
      },
    });
  }

  const homeStop = onRoad?.stops[0];
  const homeOrder = homeStop?.order;
  if (
    homeOrder &&
    loader &&
    (await prisma.deliveryNote.count({ where: { orderId: homeOrder.id } })) === 0
  ) {
    const dnId = `DN-${homeOrder.id}`;
    const lines = homeOrder.lines.filter((l) => l.itemId);
    await prisma.deliveryNote.create({
      data: {
        dnId,
        versionAt: VERSION_AT,
        orderId: homeOrder.id,
        status: 'picking',
        changedById: loader.id,
        changeReason: 'initial pick list',
        lines: {
          create: lines.map((l) => ({
            itemId: l.itemId!,
            qtyConfirmed: l.qty,
          })),
        },
        loaders: {
          create: {
            loaderId: loader.id,
            role: 'picking',
            startedAt: new Date(),
          },
        },
      },
    });

    const dnLine = await prisma.deliveryNoteLine.findFirst({
      where: { dnId, versionAt: VERSION_AT, itemId: 'F-MILK' },
    });
    if (dnLine) {
      await prisma.deliveryNotePick.create({
        data: {
          dnLineId: dnLine.id,
          batchId: 'BATCH-F-MILK',
          qty: 2,
        },
      });
    }

    await prisma.loaderFlag.create({
      data: {
        loaderId: loader.id,
        dnId,
        versionAt: VERSION_AT,
        scope: 'item',
        itemId: 'F-MILK',
        qtyFlagged: 1,
        reason: 'crate crushed at dock',
        reasonDetail: 'Outer crate split; 1 bottle leaking. Hold back from this DN version.',
        validationStatus: 'pending_dispatcher',
      },
    });
  }

  if (homeOrder && (await prisma.fieldFlag.count({ where: { orderId: homeOrder.id } })) === 0) {
    await prisma.fieldFlag.create({
      data: {
        storeId: homeOrder.storeId,
        orderId: homeOrder.id,
        tripId: onRoad?.id,
        itemId: 'F-MILK',
        qtyFlagged: 1,
        reason: 'damaged',
        reasonDetail: 'One milk crate arrived with a split bottle.',
        severity: 'medium',
        driverDecision: 'pending',
      },
    });
  }

  if (onRoad && driver && (await prisma.routeLeg.count({ where: { tripId: onRoad.id } })) === 0) {
    const storeName = homeStop?.order.store.displayName ?? homeStop?.order.storeId ?? 'outlet';
    await prisma.routeLeg.create({
      data: {
        tripId: onRoad.id,
        seq: 1,
        fromPoint: 'Peliyagoda depot',
        toOutlet: storeName,
        distanceKm: 12.4,
        plannedTravelMin: 28,
        actualTravelMin: 31,
        monsoon: false,
        trafficBand: 'peak',
      },
    });
  }

  if (onRoad && driver) {
    const pingUuids = [1, 2, 3].map((n) => `ping-${onRoad.id}-${n}`);
    const alreadyPinged = await prisma.locationPing.count({
      where: { OR: [{ tripId: onRoad.id }, { clientUuid: { in: pingUuids } }] },
    });
    if (alreadyPinged === 0) {
      const t0 = new Date();
      await prisma.locationPing.createMany({
        skipDuplicates: true,
        data: [
          {
            clientUuid: pingUuids[0]!,
            tripId: onRoad.id,
            driverId: driver.id,
            lat: 6.958,
            lng: 79.899,
            accuracyM: 8,
            speedKmh: 34,
            recordedAt: new Date(t0.getTime() - 12 * 60_000),
          },
          {
            clientUuid: pingUuids[1]!,
            tripId: onRoad.id,
            driverId: driver.id,
            lat: 6.941,
            lng: 79.863,
            accuracyM: 6,
            speedKmh: 18,
            recordedAt: new Date(t0.getTime() - 4 * 60_000),
          },
          {
            clientUuid: pingUuids[2]!,
            tripId: onRoad.id,
            driverId: driver.id,
            lat: homeStop?.order.store.lat ?? 6.927,
            lng: homeStop?.order.store.lng ?? 79.861,
            accuracyM: 5,
            speedKmh: 0,
            recordedAt: t0,
          },
        ],
      });
    }
  }

  if (
    onRoad &&
    driver &&
    (await prisma.driverIncident.count({ where: { tripId: onRoad.id } })) === 0
  ) {
    await prisma.driverIncident.create({
      data: {
        driverId: driver.id,
        tripId: onRoad.id,
        vehicleId: onRoad.vehicleId,
        lastStopId: homeStop?.id,
        incidentType: 'sos',
        severity: 'high',
        message: 'Breakdown on Baseline Road — requesting assistance.',
        lat: 6.941,
        lng: 79.863,
      },
    });
  }

  // Dummy rows for tables the rest of seed never writes. Use yesterday's completed
  // trip — never the published trip on the loader queue or sunil's live arrived receive stop.
  const done = await prisma.trip.findFirst({
    where: { status: 'completed', depotId: 'Peliyagoda' },
    include: {
      stops: {
        orderBy: { sequence: 'asc' },
        include: { order: { include: { lines: true, store: true } } },
      },
    },
    orderBy: { serviceDate: 'desc' },
  });
  const doneStop = done?.stops[0];
  if (doneStop && (await prisma.storeReceipt.count({ where: { stopId: doneStop.id } })) === 0) {
    const confirmedAt = doneStop.arrivedAt ?? new Date();
    await prisma.tripStop.update({
      where: { id: doneStop.id },
      data: {
        status: 'delivered',
        arrivedAt: doneStop.arrivedAt ?? confirmedAt,
        storeConfirmedAt: confirmedAt,
      },
    });
    await prisma.order.update({
      where: { id: doneStop.orderId },
      data: { status: 'delivered' },
    });

    if ((await prisma.loadFlag.count({ where: { stopId: doneStop.id } })) === 0) {
      const flaggedLine = doneStop.order.lines[0];
      await prisma.loadFlag.create({
        data: {
          stopId: doneStop.id,
          orderLineId: flaggedLine?.id,
          type: 'missing',
          qty: 1,
          note: 'Demo: one pack short at dock.',
          photoKey: 'load-flags/demo.png',
        },
      });
    }

    const manager =
      (await prisma.user.findUnique({ where: { loginId: doneStop.order.storeId } })) ??
      (await prisma.user.findFirst({
        where: { storeId: doneStop.order.storeId, role: 'store' },
      }));
    await prisma.storeReceipt.create({
      data: {
        stopId: doneStop.id,
        lineResults: doneStop.order.lines.map((line) => ({
          name: line.name,
          orderedQty: line.qty,
          receivedQty: line.qty,
          issue: null,
        })),
        chilledWasCold: true,
        photoKey: 'receipts/demo.png',
        signaturePhotoKey: 'signatures/demo.png',
        signedByUserId: manager?.id ?? null,
        signedAt: confirmedAt,
      },
    });
  }

  if (
    kasun &&
    done &&
    doneStop &&
    (await prisma.driverEvent.count({ where: { driverId: kasun.id } })) === 0
  ) {
    const stopId = doneStop.id;
    const arrivedAt = doneStop.arrivedAt ?? new Date();
    await prisma.driverEvent.createMany({
      data: [
        {
          clientId: `seed-arrived-${done.id}`,
          driverId: kasun.id,
          tripId: done.id,
          type: 'ARRIVED',
          payload: { stopId },
          createdOnPhoneAt: arrivedAt,
          seenPlanVersion: done.planVersion,
        },
        {
          clientId: `seed-ack-${done.id}`,
          driverId: kasun.id,
          tripId: done.id,
          type: 'ACKNOWLEDGEMENT',
          payload: { stopId },
          createdOnPhoneAt: new Date(arrivedAt.getTime() + 15 * 60_000),
          seenPlanVersion: done.planVersion,
        },
      ],
    });
  }
}
