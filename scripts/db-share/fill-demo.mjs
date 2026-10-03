/**
 * Fills the demo columns and rows added for the dispatcher walkthrough.
 * Safe to run again: demo orders use the demo-dispatch- id prefix.
 */
import pg from 'pg';

const c = new pg.Client({
  connectionString: 'postgresql://waypoint:waypoint@localhost:5432/waypoint',
});

const NAMES = {
  Fresh: ['Lakeview Grocers', 'Fort Market', 'Palm Fresh', 'Harbour Stores', 'Green Basket', 'River Pantry'],
  Style: ['Loom House', 'City Style', 'Wardrobe Room', 'Silk Corner', 'Thread & Co', 'Main Street Tailors'],
  Tech: ['Circuit Hub', 'Bright Devices', 'Signal Shop', 'Pixel Point', 'North Gate Electronics', 'Lamp House'],
};

function shopName(brand, n) {
  const list = NAMES[brand] ?? NAMES.Fresh;
  return `${list[n % list.length]} ${n + 1}`;
}

function haversine(aLat, aLng, bLat, bLng) {
  const r = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(r * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}

await c.connect();
try {
  await c.query('BEGIN');

  await c.query(`
    UPDATE "Depot" SET
      telephone = '011 293 9100',
      email = 'peliyagoda@waypoint.lk',
      address = '148 Negombo Road, Peliyagoda',
      lat = 6.9678,
      lng = 79.8832,
      name = 'Peliyagoda'
    WHERE id = 'depo1'
  `);
  await c.query(`
    UPDATE "Depot" SET
      telephone = '081 223 8450',
      email = 'kandy@waypoint.lk',
      address = '27 William Gopallawa Mawatha, Kandy',
      lat = 7.2906,
      lng = 80.6337,
      name = 'Kandy'
    WHERE id = 'depo2'
  `);

  const stores = (
    await c.query(`
      SELECT s.id, s.brand, s."districtId" AS district, s.lat, s.lng, d.lat AS dlat, d.lng AS dlng
      FROM "Store" s
      JOIN "Depot" d ON d.id = s."depotId"
      ORDER BY s.id
    `)
  ).rows;
  for (let i = 0; i < stores.length; i++) {
    const s = stores[i];
    const streetNo = 12 + (i % 80);
    await c.query(
      `UPDATE "Store" SET "displayName" = $2, address = $3, email = $4,
         lat = COALESCE(lat, $5), lng = COALESCE(lng, $6)
       WHERE id = $1`,
      [
        s.id,
        shopName(s.brand, i),
        `${streetNo} Temple Road, ${s.district}`,
        `${s.id.toLowerCase()}@shops.waypoint.lk`,
        s.lat ?? s.dlat,
        s.lng ?? s.dlng,
      ],
    );
  }

  const items = (await c.query(`SELECT id, "itemName", type, "isChilled", "packLabel", "packWeightKg" FROM "Item" ORDER BY id`)).rows;
  const byType = new Map();
  for (const item of items) {
    const list = byType.get(item.type) ?? [];
    list.push(item);
    byType.set(item.type, list);
  }
  const freshItems = [...(byType.get('chilled_food') ?? []), ...(byType.get('fresh') ?? [])];
  const styleItems = byType.get('style') ?? [];
  const techItems = byType.get('tech') ?? [];
  const catalogue = { Fresh: freshItems, Style: styleItems, Tech: techItems };

  const savedStores = stores.slice(0, 8);
  for (const s of savedStores) {
    const picks = (catalogue[s.brand] ?? freshItems).slice(0, 3);
    for (const item of picks) {
      await c.query(
        `INSERT INTO "StoreSavedItem" ("storeId", "itemId") VALUES ($1, $2)
         ON CONFLICT ("storeId", "itemId") DO NOTHING`,
        [s.id, item.id],
      );
    }
  }

  const prefs = [
    { deliveryUpdates: true, delayAlerts: true, incidentAlerts: true, planChanges: true },
    { deliveryUpdates: true, delayAlerts: false, incidentAlerts: true, planChanges: true },
    { deliveryUpdates: false, delayAlerts: true, incidentAlerts: false, planChanges: true },
    { deliveryUpdates: true, delayAlerts: true, incidentAlerts: true, planChanges: false },
  ];
  const users = (await c.query(`SELECT id FROM "User" ORDER BY "loginId"`)).rows;
  for (let i = 0; i < users.length; i++) {
    await c.query(`UPDATE "User" SET "notificationPrefs" = $2::jsonb WHERE id = $1`, [
      users[i].id,
      JSON.stringify(prefs[i % prefs.length]),
    ]);
  }

  const drivers = (
    await c.query(`
      SELECT d.id, u."depotId"
      FROM "Driver" d JOIN "User" u ON u.id = d."userId"
      ORDER BY d.id
    `)
  ).rows;
  for (let i = 0; i < drivers.length; i++) {
    const city = drivers[i].depotId === 'depo2' ? 'Kandy' : 'Peliyagoda';
    const expiry = new Date(Date.UTC(2026, 6, 1));
    expiry.setUTCDate(expiry.getUTCDate() + (i % 500));
    await c.query(
      `UPDATE "Driver" SET address = $2, "licenseExpiry" = $3::date WHERE id = $1`,
      [drivers[i].id, `${20 + (i % 60)} Lake Road, ${city}`, expiry.toISOString().slice(0, 10)],
    );
  }

  const loaders = (await c.query(`SELECT l.id, u.id AS "userId", u."depotId" FROM "Loader" l JOIN "User" u ON u.id = l."userId" ORDER BY l.id`)).rows;
  for (let i = 0; i < loaders.length; i++) {
    const city = loaders[i].depotId === 'depo2' ? 'Kandy' : 'Peliyagoda';
    await c.query(`UPDATE "Loader" SET address = $2 WHERE id = $1`, [
      loaders[i].id,
      `${8 + (i % 40)} Dock Lane, ${city}`,
    ]);
    const phone = `077${String(1000000 + i).slice(0, 7)}`;
    await c.query(
      `INSERT INTO "LoaderPhone" ("phoneNumber", "loaderId") VALUES ($1, $2)
       ON CONFLICT ("phoneNumber") DO NOTHING`,
      [phone, loaders[i].id],
    );
  }

  const dispatchers = (await c.query(`SELECT d.id, u."loginId", u."depotId", u.name FROM "Dispatcher" d JOIN "User" u ON u.id = d."userId" ORDER BY u."loginId"`)).rows;
  for (let i = 0; i < dispatchers.length; i++) {
    const city = dispatchers[i].depotId === 'depo2' ? 'Kandy' : 'Peliyagoda';
    await c.query(`UPDATE "Dispatcher" SET email = $2, address = $3 WHERE id = $1`, [
      dispatchers[i].id,
      `${dispatchers[i].loginId}@waypoint.lk`,
      `${4 + i} Depot Office, ${city}`,
    ]);
    const phone = `011${String(2000000 + i).slice(0, 7)}`;
    await c.query(
      `INSERT INTO "DispatcherPhone" ("phoneNumber", "dispatcherId") VALUES ($1, $2)
       ON CONFLICT ("phoneNumber") DO NOTHING`,
      [phone, dispatchers[i].id],
    );
  }

  const vehicles = (await c.query(`SELECT id FROM "Vehicle" ORDER BY id`)).rows;
  for (let i = 0; i < vehicles.length; i++) {
    const at = new Date(Date.UTC(2026, 8, 1));
    at.setUTCDate(at.getUTCDate() - (i % 70));
    await c.query(`UPDATE "Vehicle" SET "lastServiceAt" = $2 WHERE id = $1`, [vehicles[i].id, at.toISOString()]);
  }

  await c.query(`
    DELETE FROM "OrderLine" WHERE "orderId" IN (
      SELECT id FROM "Order" o WHERE o.id LIKE 'demo-dispatch-%'
        AND NOT EXISTS (SELECT 1 FROM "TripStop" t WHERE t."orderId" = o.id)
    )
  `);
  await c.query(`
    DELETE FROM "Order" o WHERE o.id LIKE 'demo-dispatch-%'
      AND NOT EXISTS (SELECT 1 FROM "TripStop" t WHERE t."orderId" = o.id)
  `);

  const placed = (
    await c.query(`
      SELECT id, brand, "districtId" AS district
      FROM "Store"
      WHERE "depotId" = 'depo1' AND lat IS NOT NULL AND lng IS NOT NULL
      ORDER BY "districtId", id
    `)
  ).rows;
  // Tomorrow in Asia/Colombo: the plan board always shows the next day.
  const colomboToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(process.env.DEMO_NOW ? new Date(process.env.DEMO_NOW) : new Date());
  const next = new Date(`${colomboToday}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const day = next.toISOString().slice(0, 10);
  let made = 0;
  for (let i = 0; i < 24 && placed.length > 0; i++) {
    const store = placed[i % placed.length];
    const pool = catalogue[store.brand] ?? freshItems;
    if (pool.length === 0) continue;
    const orderId = `demo-dispatch-${String(i + 1).padStart(2, '0')}`;
    const picks = [pool[i % pool.length], pool[(i + 1) % pool.length]];
    const lines = picks.map((item, n) => {
      const qty = n === 0 ? 4 : 2;
      const unitWeight = Number(item.packWeightKg) || 1;
      return {
        item,
        qty,
        weight: Math.round(unitWeight * qty * 100) / 100,
        volume: Math.round(0.01 * qty * 1000) / 1000,
      };
    });
    const units = lines.reduce((s, l) => s + l.qty, 0);
    const weight = lines.reduce((s, l) => s + l.weight, 0);
    const volume = lines.reduce((s, l) => s + l.volume, 0);
    const chilled = lines.some((l) => l.item.isChilled);
    await c.query(
      `INSERT INTO "Order"
        (id, "storeId", brand, "deliveryDate", temp, status, units, "weightKg", "volumeM3", urgent)
       VALUES ($1, $2, $3::"Brand", $4::date, $5::"Temp", 'waiting', $6, $7, $8, $9)`,
      [orderId, store.id, store.brand, day, chilled ? 'chilled' : 'ambient', units, weight, volume, i < 3],
    );
    for (const line of lines) {
      await c.query(
        `INSERT INTO "OrderLine"
          (id, "orderId", "itemId", name, qty, pack, chilled, "unitWeightKg", "unitVolumeM3")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.01)`,
        [
          `${orderId}-l${lines.indexOf(line)}`,
          orderId,
          line.item.id,
          line.item.itemName,
          line.qty,
          line.item.packLabel || 'pack',
          line.item.isChilled,
          Number(line.item.packWeightKg) || 1,
        ],
      );
    }
    made += 1;
  }

  const depotPoints = new Map(
    (await c.query(`SELECT id, name, lat, lng FROM "Depot"`)).rows.map((d) => [d.id, d]),
  );
  const trips = (
    await c.query(`
      SELECT t.id, t."depotId", t.status, t."serviceDate"
      FROM "Trip" t
      ORDER BY t."serviceDate", t.id
    `)
  ).rows;
  const dispatcher = dispatchers[0];
  const loader = loaders[0];
  for (const trip of trips) {
    const stops = (
      await c.query(
        `SELECT ts.id, ts.sequence, ts.status, s."displayName", s.lat, s.lng, s.id AS "storeId", o.id AS "orderId"
         FROM "TripStop" ts
         JOIN "Order" o ON o.id = ts."orderId"
         JOIN "Store" s ON s.id = o."storeId"
         WHERE ts."tripId" = $1
         ORDER BY ts.sequence`,
        [trip.id],
      )
    ).rows;
    const legs = Number((await c.query(`SELECT COUNT(*)::int AS n FROM "RouteLeg" WHERE "tripId" = $1`, [trip.id])).rows[0].n);
    const yard = depotPoints.get(trip.depotId);
    if (legs === 0 && stops.length > 0 && yard?.lat != null) {
      let prev = { name: `${yard.name} depot`, lat: Number(yard.lat), lng: Number(yard.lng) };
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const lat = stop.lat == null ? prev.lat : Number(stop.lat);
        const lng = stop.lng == null ? prev.lng : Number(stop.lng);
        const km = haversine(prev.lat, prev.lng, lat, lng);
        await c.query(
          `INSERT INTO "RouteLeg"
            (id, "tripId", seq, "fromPoint", "toOutlet", "distanceKm", "plannedTravelMin", monsoon, "trafficBand")
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'free')`,
          [
            `demo-leg-${trip.id}-${i + 1}`,
            trip.id,
            i + 1,
            prev.name,
            stop.displayName,
            km,
            Math.max(5, Math.round((km / 40) * 60)),
          ],
        );
        prev = { name: stop.displayName, lat, lng };
      }
    }

    const job = Number((await c.query(`SELECT COUNT(*)::int AS n FROM "LoadingJob" WHERE "tripId" = $1`, [trip.id])).rows[0].n);
    if (job === 0 && dispatcher && ['published', 'loading', 'ready', 'on_road', 'completed'].includes(trip.status)) {
      const handed = trip.status === 'on_road' || trip.status === 'completed';
      await c.query(
        `INSERT INTO "LoadingJob"
          (id, "tripId", depot, "assignedById", bay, instructions, priority, status, "startedAt", "handedOverAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7::"LoadingJobStatus", $8, $9)`,
        [
          `demo-job-${trip.id}`,
          trip.id,
          trip.depotId,
          dispatcher.id,
          'Bay 2',
          'Load last shop first.',
          handed ? 'handed_over' : trip.status === 'loading' ? 'picking' : 'assigned',
          handed || trip.status === 'loading' ? new Date().toISOString() : null,
          handed ? new Date().toISOString() : null,
        ],
      );
    }

    const session = Number((await c.query(`SELECT COUNT(*)::int AS n FROM "LoadSession" WHERE "tripId" = $1`, [trip.id])).rows[0].n);
    if (session === 0 && loader && ['loading', 'on_road', 'completed'].includes(trip.status)) {
      const gone = trip.status !== 'loading';
      await c.query(
        `INSERT INTO "LoadSession"
          (id, "tripId", "loaderIds", "startedAt", "finishedAt", "departedAt", "ackedPlanVersion", "ackedStopIds")
         VALUES ($1, $2, $3::text[], $4, $5, $6, 1, $7::text[])`,
        [
          `demo-session-${trip.id}`,
          trip.id,
          [loader.userId],
          new Date().toISOString(),
          gone ? new Date().toISOString() : null,
          gone ? new Date().toISOString() : null,
          stops.map((s) => s.orderId),
        ],
      );
    }
  }

  await c.query(`UPDATE "LoadFlag" SET "resolvedAt" = NOW() WHERE id IN (SELECT id FROM "LoadFlag" WHERE "resolvedAt" IS NULL ORDER BY "createdAt" LIMIT 1)`);

  const noteOrders = (
    await c.query(`
      SELECT o.id
      FROM "Order" o
      JOIN "TripStop" ts ON ts."orderId" = o.id
      WHERE NOT EXISTS (SELECT 1 FROM "DeliveryNote" n WHERE n."orderId" = o.id AND n."validTo" IS NULL)
      LIMIT 8
    `)
  ).rows;
  const batches = (await c.query(`SELECT id, "itemId" FROM "InventoryBatch"`)).rows;
  const batchFor = (itemId) => batches.find((b) => b.itemId === itemId) ?? batches[0];
  for (const order of noteOrders) {
    if (!loader) break;
    const lines = (await c.query(`SELECT id, "itemId", qty FROM "OrderLine" WHERE "orderId" = $1 AND "itemId" IS NOT NULL`, [order.id])).rows;
    if (lines.length === 0) continue;
    const versionAt = new Date().toISOString();
    const dnId = `dn-${order.id}`;
    await c.query(
      `INSERT INTO "DeliveryNote" ("dnId", "versionAt", "orderId", status, "changedById", "changeReason")
       VALUES ($1, $2, $3, 'picking', $4, 'demo pick list')`,
      [dnId, versionAt, order.id, loader.id],
    );
    await c.query(
      `INSERT INTO "DeliveryNoteLoader" (id, "dnId", "versionAt", "loaderId", role, "startedAt")
       VALUES ($1, $2, $3, $4, 'picking', $3)`,
      [`dnl-${order.id}`, dnId, versionAt, loader.id],
    );
    for (const line of lines) {
      const dnLineId = `dnl-line-${order.id}-${line.itemId}`;
      await c.query(
        `INSERT INTO "DeliveryNoteLine" (id, "dnId", "versionAt", "itemId", "qtyConfirmed")
         VALUES ($1, $2, $3, $4, $5)`,
        [dnLineId, dnId, versionAt, line.itemId, line.qty],
      );
      const batch = batchFor(line.itemId);
      if (batch) {
        await c.query(
          `INSERT INTO "DeliveryNotePick" (id, "dnLineId", "batchId", qty) VALUES ($1, $2, $3, $4)`,
          [`pick-${dnLineId}`, dnLineId, batch.id, line.qty],
        );
      }
    }
  }

  const receiptStops = (
    await c.query(`
      SELECT ts.id, ts."orderId", o."storeId"
      FROM "TripStop" ts
      JOIN "Order" o ON o.id = ts."orderId"
      WHERE ts.status IN ('confirmed', 'delivered', 'partial')
        AND NOT EXISTS (SELECT 1 FROM "StoreReceipt" r WHERE r."stopId" = ts.id)
      LIMIT 6
    `)
  ).rows;
  for (const stop of receiptStops) {
    const lines = (await c.query(`SELECT name, qty FROM "OrderLine" WHERE "orderId" = $1`, [stop.orderId])).rows;
    const signer = (
      await c.query(`SELECT id FROM "User" WHERE "storeId" = $1 AND role = 'store' LIMIT 1`, [stop.storeId])
    ).rows[0];
    await c.query(
      `INSERT INTO "StoreReceipt"
        (id, "stopId", "lineResults", "chilledWasCold", "signaturePhotoKey", "signedByUserId", "signedAt")
       VALUES ($1, $2, $3::jsonb, true, $4, $5, NOW())`,
      [
        `rcpt-${stop.id}`,
        stop.id,
        JSON.stringify(lines.map((l) => ({ name: l.name, orderedQty: l.qty, receivedQty: l.qty, issue: null }))),
        `receipts/${stop.id}/signature.png`,
        signer?.id ?? null,
      ],
    );
  }

  const pingTrips = (
    await c.query(`
      SELECT t.id, t."assignedDriverId", v."driverId" AS "vehicleDriver"
      FROM "Trip" t
      JOIN "Vehicle" v ON v.id = t."vehicleId"
      WHERE t.status IN ('completed', 'on_road')
         OR EXISTS (SELECT 1 FROM "TripStop" ts WHERE ts."tripId" = t.id AND ts.status IN ('delivered', 'confirmed', 'partial'))
      ORDER BY t."serviceDate" DESC
      LIMIT 2
    `)
  ).rows;
  for (const trip of pingTrips) {
    const driverUser = trip.assignedDriverId ?? trip.vehicleDriver;
    const profile = driverUser
      ? (await c.query(`SELECT id FROM "Driver" WHERE "userId" = $1`, [driverUser])).rows[0]
      : drivers[0];
    if (!profile || !driverUser) continue;
    const stops = (
      await c.query(
        `SELECT s.lat, s.lng FROM "TripStop" ts
         JOIN "Order" o ON o.id = ts."orderId"
         JOIN "Store" s ON s.id = o."storeId"
         WHERE ts."tripId" = $1 AND s.lat IS NOT NULL
         ORDER BY ts.sequence LIMIT 4`,
        [trip.id],
      )
    ).rows;
    for (let i = 0; i < Math.max(stops.length, 1); i++) {
      const lat = stops[i]?.lat ?? 6.95;
      const lng = stops[i]?.lng ?? 79.86;
      const when = new Date(Date.UTC(2026, 9, 3, 3, i * 12));
      await c.query(
        `INSERT INTO "LocationPing"
          (id, "clientUuid", "tripId", "driverId", lat, lng, "accuracyM", "speedKmh", "recordedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 8, 32, $7)
         ON CONFLICT ("clientUuid") DO NOTHING`,
        [`demo-ping-${trip.id}-${i}`, `demo-ping-${trip.id}-${i}`, trip.id, profile.id, lat, lng, when.toISOString()],
      );
      if (i === 0) {
        await c.query(
          `INSERT INTO "DriverEvent"
            (id, "clientId", "driverId", "tripId", type, payload, "createdOnPhoneAt", "seenPlanVersion")
           VALUES ($1, $2, $3, $4, 'ARRIVED', $5::jsonb, $6, 1)
           ON CONFLICT ("clientId") DO NOTHING`,
          [
            `demo-ev-${trip.id}`,
            `demo-ev-${trip.id}`,
            driverUser,
            trip.id,
            JSON.stringify({ stopId: 'demo' }),
            when.toISOString(),
          ],
        );
      }
    }
  }

  if (drivers[0] && pingTrips[0]) {
    const vehicle = (await c.query(`SELECT "vehicleId" FROM "Trip" WHERE id = $1`, [pingTrips[0].id])).rows[0];
    await c.query(
      `INSERT INTO "DriverIncident"
        (id, "driverId", "tripId", "vehicleId", "incidentType", severity, message, lat, lng)
       SELECT $1, $2, $3, $4, 'delay', 'low', 'Held in traffic near the first shop', 6.94, 79.86
       WHERE NOT EXISTS (SELECT 1 FROM "DriverIncident" WHERE id = $1)`,
      [`demo-drv-inc-1`, drivers[0].id, pingTrips[0].id, vehicle?.vehicleId ?? null],
    );
  }

  const incidentTrip = trips.find((t) => t.status === 'on_road') ?? trips[0];
  if (incidentTrip) {
    await c.query(
      `INSERT INTO "Incident" (id, type, "tripId", status, timeline)
       SELECT 'demo-inc-delay', 'delay', $1, 'open', $2::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM "Incident" WHERE id = 'demo-inc-delay')`,
      [incidentTrip.id, JSON.stringify([{ at: new Date().toISOString(), note: 'About 20 min late' }])],
    );
    await c.query(
      `INSERT INTO "Incident" (id, type, "tripId", status, timeline)
       SELECT 'demo-inc-quiet', 'quiet_driver', $1, 'open', $2::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM "Incident" WHERE id = 'demo-inc-quiet')`,
      [incidentTrip.id, JSON.stringify([{ at: new Date().toISOString(), note: 'No location for 15 min' }])],
    );
  }

  const notifyUser = users[0];
  if (notifyUser) {
    await c.query(
      `INSERT INTO "Notification" (id, "userId", title, body, link, read)
       SELECT 'demo-note-1', $1, 'Plan ready', 'Tomorrow has waiting orders to route.', '/dispatch/plan', false
       WHERE NOT EXISTS (SELECT 1 FROM "Notification" WHERE id = 'demo-note-1')`,
      [notifyUser.id],
    );
    await c.query(
      `INSERT INTO "Notification" (id, "userId", title, body, link, read)
       SELECT 'demo-note-2', $1, 'Store report', 'A shop marked a short delivery.', '/dispatch/board', true
       WHERE NOT EXISTS (SELECT 1 FROM "Notification" WHERE id = 'demo-note-2')`,
      [notifyUser.id],
    );
  }

  await c.query(`UPDATE "FieldFlag" SET "resolveStatus" = false WHERE "resolvedAt" IS NULL AND "resolveStatus" IS DISTINCT FROM false`);
  const flagOrder = (
    await c.query(`
      SELECT o.id AS "orderId", o."storeId", ts."tripId", ol."itemId"
      FROM "Order" o
      JOIN "TripStop" ts ON ts."orderId" = o.id
      JOIN "OrderLine" ol ON ol."orderId" = o.id
      WHERE ol."itemId" IS NOT NULL
      LIMIT 1
    `)
  ).rows[0];
  if (flagOrder) {
    await c.query(
      `INSERT INTO "FieldFlag"
        (id, "storeId", "orderId", "tripId", "itemId", "qtyFlagged", reason, "reasonDetail", severity, "driverDecision", "resolveStatus", "resolvedAt")
       SELECT 'demo-flag-solved', $1, $2, $3, $4, 1, 'damaged', 'Demo: one pack damaged, replacement sent', 'medium', 'accepted', true, NOW()
       WHERE NOT EXISTS (SELECT 1 FROM "FieldFlag" WHERE id = 'demo-flag-solved')`,
      [flagOrder.storeId, flagOrder.orderId, flagOrder.tripId, flagOrder.itemId],
    );
  }

  if (loader && noteOrders[0]) {
    const dn = (await c.query(`SELECT "dnId", "versionAt" FROM "DeliveryNote" WHERE "orderId" = $1 LIMIT 1`, [noteOrders[0].id])).rows[0];
    const item = items[0];
    if (dn && item) {
      await c.query(
        `INSERT INTO "LoaderFlag"
          (id, "loaderId", "dnId", "versionAt", scope, "itemId", "qtyFlagged", reason, "reasonDetail", "validationStatus")
         SELECT 'demo-loader-flag', $1, $2, $3, 'item', $4, 1, 'crate crushed', 'Demo dock flag', 'pending_dispatcher'
         WHERE NOT EXISTS (SELECT 1 FROM "LoaderFlag" WHERE id = 'demo-loader-flag')`,
        [loader.id, dn.dnId, dn.versionAt, item.id],
      );
    }
  }

  await c.query('COMMIT');
  const counts = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM "Order" WHERE status = 'waiting' AND "deliveryDate" = $1::date) AS waiting,
      (SELECT COUNT(*) FROM "Store" WHERE address IS NOT NULL) AS stores,
      (SELECT COUNT(*) FROM "RouteLeg") AS legs,
      (SELECT COUNT(*) FROM "LoadingJob") AS jobs,
      (SELECT COUNT(*) FROM "StoreReceipt") AS receipts,
      (SELECT COUNT(*) FROM "LocationPing") AS pings
  `, [day]);
  console.log(counts.rows[0], 'orders inserted', made);
} catch (err) {
  await c.query('ROLLBACK');
  throw err;
} finally {
  await c.end();
}
