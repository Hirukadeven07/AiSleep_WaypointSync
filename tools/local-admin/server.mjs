import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.ADMIN_PORT || 3099);
const DB_CONTAINER = process.env.ADMIN_DB_CONTAINER || 'hosting-db-1';
const dir = dirname(fileURLToPath(import.meta.url));

const BOARD_SQL = `
SELECT json_build_object(
  'now', now(),
  'trips', (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.plate, t.trip_number), '[]'::json)
    FROM (
      SELECT
        v."numberPlate" AS plate,
        t."tripNumber" AS trip_number,
        t.status::text AS status,
        t.brand::text AS brand,
        t."districtId" AS district,
        t."depotId" AS depot,
        t."serviceDate"::text AS service_date,
        vu."loginId" AS driver_login,
        vu.name AS driver_name,
        (vu."pinHash" IS NOT NULL) AS driver_has_pin,
        du."loginId" AS assigned_login,
        du.name AS assigned_name,
        lj.status::text AS load_status,
        ls."finishedAt" AS load_finished_at,
        ls."departedAt" AS departed_at,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'seq', s.sequence,
            'storeId', o."storeId",
            'store', COALESCE(st."displayName", o."storeId"),
            'status', s.status::text,
            'orderStatus', o.status::text,
            'kg', round(o."weightKg"::numeric, 1),
            'window', to_char(make_time(st."windowOpenMin" / 60, st."windowOpenMin" % 60, 0), 'HH24:MI')
              || '–' ||
              to_char(make_time(st."windowCloseMin" / 60, st."windowCloseMin" % 60, 0), 'HH24:MI')
          ) ORDER BY s.sequence), '[]'::json)
          FROM "TripStop" s
          JOIN "Order" o ON o.id = s."orderId"
          JOIN "Store" st ON st.id = o."storeId"
          WHERE s."tripId" = t.id
        ) AS stops
      FROM "Trip" t
      JOIN "Vehicle" v ON v.id = t."vehicleId"
      LEFT JOIN "User" du ON du.id = t."assignedDriverId"
      LEFT JOIN "User" vu ON vu.id = v."driverId"
      LEFT JOIN "LoadingJob" lj ON lj."tripId" = t.id
      LEFT JOIN "LoadSession" ls ON ls."tripId" = t.id
    ) t
  ),
  'people', (
    SELECT COALESCE(json_agg(row_to_json(p) ORDER BY p.role, p.login_id), '[]'::json)
    FROM (
      SELECT
        u."loginId" AS login_id,
        u.name,
        u.role::text AS role,
        u."depotId" AS depot_id,
        u."storeId" AS store_id,
        u.phone,
        (u."pinHash" IS NOT NULL) AS has_pin,
        (u."passwordHash" IS NOT NULL) AS has_password,
        v."numberPlate" AS plate,
        COALESCE(d."isActive", l."isActive", true) AS active
      FROM "User" u
      LEFT JOIN "Vehicle" v ON v."driverId" = u.id
      LEFT JOIN "Driver" d ON d."userId" = u.id
      LEFT JOIN "Loader" l ON l."userId" = u.id
    ) p
  ),
  'orders', (
    SELECT COALESCE(json_object_agg(status, n), '{}'::json)
    FROM (
      SELECT status::text AS status, count(*)::int AS n
      FROM "Order"
      GROUP BY status
    ) o
  ),
  'vehicles', (
    SELECT COALESCE(json_object_agg(status, n), '{}'::json)
    FROM (
      SELECT status::text AS status, count(*)::int AS n
      FROM "Vehicle"
      GROUP BY status
    ) v
  )
);
`;

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'waypoint', '-d', 'waypoint', '-v', 'ON_ERROR_STOP=1', '-t', '-A'],
      { windowsHide: true },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err.trim() || out.trim() || `psql exited ${code}`));
      else resolve(out.trim());
    });
    child.stdin.end(sql);
  });
}

const CATALOGUE = {
  Fresh: [
    ['F-MILK', 'Fresh milk 1 L', 'crate of 12', 'chilled_food', 12.6, 0.018],
    ['F-YOG', 'Set yoghurt', 'tray of 24', 'chilled_food', 2.6, 0.006],
    ['F-CHKN', 'Chicken, whole', 'box of 10', 'chilled_food', 12, 0.03],
    ['F-CHEE', 'Cheddar cheese', 'crate of 8', 'chilled_food', 8, 0.02],
    ['F-BUTTR', 'Butter 500 g', 'carton of 20', 'chilled_food', 10, 0.016],
    ['F-CURD', 'Buffalo curd', 'crate of 12', 'chilled_food', 9, 0.02],
    ['F-FISH', 'Fish fillets', 'crate of 8', 'chilled_food', 10, 0.025],
    ['F-SAUS', 'Chicken sausages', 'carton of 20', 'chilled_food', 8, 0.022],
    ['F-CREAM', 'Fresh cream 200 ml', 'crate of 24', 'chilled_food', 5.2, 0.012],
    ['F-ICE', 'Ice cream 1 L', 'carton of 8', 'chilled_food', 7.2, 0.024],
    ['F-BREAD', 'Sandwich bread', 'crate of 20', 'fresh', 9, 0.06],
    ['F-VEG', 'Mixed vegetables', 'crate', 'fresh', 15, 0.045],
    ['F-RICE', 'Samba rice 5 kg', 'bundle of 4', 'fresh', 20, 0.03],
    ['F-FRUIT', 'Mixed fruit', 'crate', 'fresh', 12, 0.04],
    ['F-DHAL', 'Red dhal 2 kg', 'bundle of 10', 'fresh', 20, 0.028],
  ],
  Style: [
    ['S-SHIRT', 'Shirts, assorted', 'carton of 20', 'style', 6, 0.05],
    ['S-DENIM', 'Denim trousers', 'carton of 12', 'style', 8, 0.05],
    ['S-SHOE', 'Footwear', 'carton of 10 pairs', 'style', 9, 0.08],
    ['S-DRESS', 'Dresses', 'carton of 10', 'style', 5, 0.06],
    ['S-SOCK', 'Socks, packs', 'carton of 40', 'style', 4, 0.025],
    ['S-HAT', 'Caps and hats', 'carton of 24', 'style', 3.5, 0.04],
    ['S-BELT', 'Belts', 'carton of 30', 'style', 5, 0.03],
    ['S-JACK', 'Jackets', 'carton of 8', 'style', 10, 0.09],
    ['S-SKIRT', 'Skirts', 'carton of 12', 'style', 5.5, 0.045],
    ['S-BAG', 'Handbags', 'carton of 8', 'style', 7, 0.07],
  ],
  Tech: [
    ['T-PHONE', 'Smartphones', 'carton of 10', 'tech', 3, 0.012],
    ['T-TV', '43" television', 'single box', 'tech', 11, 0.11],
    ['T-ACC', 'Accessories', 'carton', 'tech', 4, 0.03],
    ['T-TAB', 'Tablets', 'carton of 8', 'tech', 4.5, 0.02],
    ['T-LAP', 'Laptops', 'carton of 4', 'tech', 8, 0.04],
    ['T-HEAD', 'Headphones', 'carton of 20', 'tech', 3.2, 0.025],
    ['T-CHG', 'Chargers', 'carton of 40', 'tech', 5, 0.02],
    ['T-SPK', 'Bluetooth speakers', 'carton of 12', 'tech', 6, 0.035],
    ['T-WATCH', 'Smartwatches', 'carton of 16', 'tech', 2.4, 0.015],
    ['T-CABLE', 'Cables', 'carton of 50', 'tech', 3.8, 0.018],
  ],
};

function itemView(row) {
  const [id, name, pack, type, unitWeightKg, unitVolumeM3] = row;
  return { id, name, pack, type, chilled: type === 'chilled_food', unitWeightKg, unitVolumeM3, group: type === 'style' ? 'Style' : type === 'tech' ? 'Tech' : 'Fresh' };
}

function catalogueFor(brand) {
  const order = [brand, ...Object.keys(CATALOGUE).filter((b) => b !== brand)];
  return order.flatMap((b) => CATALOGUE[b].map(itemView));
}

function sqlText(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function storeList() {
  const raw = await psql(`
    SELECT COALESCE(json_agg(json_build_object(
      'id', s.id,
      'name', COALESCE(s."displayName", s.id),
      'brand', s.brand::text,
      'districtId', dist.id,
      'district', dist.name
    ) ORDER BY dist.name, s.id), '[]'::json)
    FROM "Store" s
    JOIN "District" dist ON dist.id = s."districtId";
  `);
  return JSON.parse(raw || '[]');
}

async function storeCatalogue(storeId) {
  const id = String(storeId || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Store id is not valid');
  const raw = await psql(`
    SELECT json_build_object(
      'id', s.id,
      'name', COALESCE(s."displayName", s.id),
      'brand', s.brand::text,
      'depot', s."depotId"
    )
    FROM "Store" s WHERE s.id = ${sqlText(id)};
  `);
  if (!raw) throw new Error(`No store ${id}`);
  const store = JSON.parse(raw);
  return { store, catalogue: catalogueFor(store.brand) };
}

async function placeOrder(body) {
  const { store, catalogue } = await storeCatalogue(body.storeId);
  const byId = new Map(catalogue.map((item) => [item.id, item]));
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((line) => ({ item: byId.get(line.catalogueId), qty: Number(line.qty) }))
    .filter((line) => line.item && Number.isInteger(line.qty) && line.qty > 0 && line.qty <= 99);
  if (lines.length === 0) throw new Error('Add a quantity to at least one item');
  const groups = new Set(lines.map((line) => line.item.group));
  if (groups.size > 1) {
    throw new Error('One order can hold one kind of goods: fresh and chilled food, Style, or Tech.');
  }
  const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;
  const units = lines.reduce((sum, line) => sum + line.qty, 0);
  const weightKg = round(lines.reduce((sum, line) => sum + line.qty * line.item.unitWeightKg, 0), 2);
  const volumeM3 = round(lines.reduce((sum, line) => sum + line.qty * line.item.unitVolumeM3, 0), 3);
  const chilled = lines.some((line) => line.item.chilled);
  const urgent = body.urgent === true;
  const orderId = `ord_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const lineSql = lines
    .map((line, index) => {
      const item = line.item;
      return `(${sqlText(`${orderId}_${index}`)}, ${sqlText(orderId)}, ${sqlText(item.id)}, ${sqlText(item.name)}, ${line.qty}, ${sqlText(item.pack)}, ${item.chilled}, ${item.unitWeightKg}, ${item.unitVolumeM3})`;
    })
    .join(',\n');
  const day = await psql(`
    SELECT to_char(d::date, 'YYYY-MM-DD')
    FROM generate_series(
      (timezone('Asia/Colombo', now()))::date + 1,
      (timezone('Asia/Colombo', now()))::date + 7,
      interval '1 day'
    ) AS d
    LEFT JOIN "CalendarDay" c ON c.id = d::date
    WHERE c.id IS NULL OR c."isOperating" = true
    ORDER BY d
    LIMIT 1;
  `);
  if (!day) throw new Error('No open delivery day');
  await psql(`
    BEGIN;
    INSERT INTO "Order" (
      id, "storeId", brand, "deliveryDate", temp, status, units, "weightKg", "volumeM3", urgent, "stockLevel"
    ) VALUES (
      ${sqlText(orderId)}, ${sqlText(store.id)}, ${sqlText(store.brand)}::"Brand", ${sqlText(day)}::date,
      ${sqlText(chilled ? 'chilled' : 'ambient')}::"Temp", 'waiting', ${units}, ${weightKg}, ${volumeM3},
      ${urgent}, ${urgent ? "'running_low'::\"StockLevel\"" : 'NULL'}
    );
    INSERT INTO "OrderLine" (id, "orderId", "itemId", name, qty, pack, chilled, "unitWeightKg", "unitVolumeM3")
    VALUES ${lineSql};
    INSERT INTO "Notification" (id, "userId", title, body, link)
    SELECT 'ntf_' || substr(md5(random()::text || u.id), 1, 16), u.id,
      'New order',
      ${sqlText(`${store.name} ordered ${units} ${units === 1 ? 'item' : 'items'} (${Math.round(weightKg)} kg) for ${day}.`)},
      '/dispatch/plan'
    FROM "User" u
    WHERE u.role = 'dispatcher' AND u."depotId" = ${sqlText(store.depot)};
    COMMIT;
  `);
  return {
    storeId: store.id,
    store: store.name,
    deliveryDate: day,
    units,
    weightKg: Math.round(weightKg),
    items: lines.map((line) => `${line.item.name} × ${line.qty}`),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) reject(new Error('Order is too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const html = await readFile(join(dir, 'index.html'));

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  try {
    if (url.pathname === '/api/board') {
      const body = await psql(BOARD_SQL);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(body);
      return;
    }
    if (url.pathname === '/api/stores') {
      const body = JSON.stringify(await storeList());
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(body);
      return;
    }
    if (url.pathname === '/api/catalogue') {
      const body = JSON.stringify(await storeCatalogue(url.searchParams.get('storeId')));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(body);
      return;
    }
    if (url.pathname === '/api/orders' && req.method === 'POST') {
      const body = JSON.stringify(await placeOrder(await readBody(req)));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(body);
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Local admin http://127.0.0.1:${PORT}`);
});
