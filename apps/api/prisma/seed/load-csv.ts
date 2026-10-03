import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '@prisma/client';

type Row = Record<string, string>;

// ---------- helpers ----------

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function readCsv(dir: string, file: string): Row[] | null {
  const path = join(dir, file);
  if (!existsSync(path)) {
    console.warn(`[seed] WARNING: ${path} not found - skipping ${file}`);
    return null;
  }
  const records: Row[] = parse(readFileSync(path), {
    columns: (header: string[]) => header.map(norm),
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  console.log(`[seed] ${file}: ${records.length} rows`);
  return records;
}

/** First non-empty value among the given (normalised) column names. */
function pick(row: Row, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== '') return v;
  }
  return undefined;
}

export function hhmmToMin(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Free-flow minutes. km / km/h × 60, rounded. Gampaha 7 km at 45 km/h is 9. */
export function minutesFromSpeed(km: number | undefined, kmh: number | undefined): number | undefined {
  if (km === undefined || kmh === undefined || kmh <= 0) return undefined;
  return Math.round((km / kmh) * 60);
}

/** Real towns in each district, spaced so demo map pins do not stack. */
const DISTRICT_PLACES: Record<string, [number, number][]> = {
  Colombo: [
    [6.9344, 79.8428],
    [6.939, 79.8507],
    [6.925, 79.848],
    [6.911, 79.8486],
    [6.893, 79.856],
    [6.875, 79.8605],
    [6.851, 79.865],
    [6.83, 79.863],
    [6.864, 79.899],
    [6.909, 79.894],
    [6.898, 79.922],
    [6.848, 79.926],
    [6.914, 79.878],
    [6.929, 79.866],
    [6.883, 79.878],
    [6.898, 79.8785],
    [6.906, 79.863],
    [6.944, 79.858],
    [6.948, 79.87],
    [6.936, 79.878],
    [6.843, 80.003],
    [6.802, 79.922],
    [6.773, 79.882],
    [6.936, 79.984],
  ],
  Gampaha: [
    [7.0917, 79.9999],
    [7.2088, 79.8358],
    [7.0015, 79.9533],
    [7.0742, 79.8919],
    [6.9896, 79.8914],
    [6.9553, 79.922],
    [7.1667, 79.9536],
    [6.978, 79.929],
    [7.03, 79.922],
    [7.048, 79.893],
    [7.125, 79.87],
    [7.23, 80.015],
    [7.242, 80.128],
    [7.155, 80.058],
    [7.144, 80.095],
  ],
  Kalutara: [
    [6.5854, 79.9607],
    [6.713, 79.904],
    [6.715, 80.063],
    [6.479, 79.983],
    [6.434, 79.997],
    [6.522, 80.114],
    [6.714, 79.989],
    [6.74, 80.174],
    [6.662, 79.93],
    [6.516, 79.97],
  ],
  Galle: [
    [6.0329, 80.2168],
    [6.14, 80.101],
    [6.235, 80.054],
    [6.287, 80.159],
    [6.172, 80.184],
    [5.973, 80.361],
    [6.01, 80.248],
    [6.065, 80.226],
    [6.032, 80.388],
  ],
  Matara: [
    [5.9549, 80.555],
    [5.975, 80.429],
    [5.972, 80.694],
    [6.095, 80.473],
    [6.079, 80.644],
    [5.929, 80.588],
  ],
  Kandy: [
    [7.2906, 80.6337],
    [7.27, 80.593],
    [7.333, 80.624],
    [7.164, 80.57],
    [7.055, 80.534],
    [7.287, 80.683],
    [7.365, 80.617],
    [7.296, 80.736],
    [7.265, 80.545],
    [7.255, 80.524],
    [7.214, 80.598],
    [7.35, 80.682],
    [7.307, 80.768],
    [7.345, 80.655],
    [7.282, 80.663],
    [7.278, 80.668],
    [7.278, 80.618],
    [7.304, 80.636],
    [7.272, 80.604],
    [7.315, 80.699],
  ],
  Matale: [
    [7.4675, 80.6234],
    [7.86, 80.649],
    [7.957, 80.76],
    [7.42, 80.633],
    [7.517, 80.675],
    [7.757, 80.466],
    [7.622, 80.648],
    [7.535, 80.62],
  ],
  'Nuwara Eliya': [
    [6.9497, 80.7891],
    [6.892, 80.596],
    [6.937, 80.658],
    [6.986, 80.488],
    [7.015, 80.789],
    [6.931, 80.69],
  ],
  Kegalle: [
    [7.2513, 80.3464],
    [7.252, 80.447],
    [7.321, 80.395],
    [7.227, 80.195],
    [7.046, 80.254],
  ],
  Kurunegala: [
    [7.4863, 80.362],
    [7.469, 80.045],
    [7.434, 80.214],
    [7.628, 80.244],
    [7.432, 80.446],
    [7.543, 80.486],
    [7.333, 80.301],
    [7.329, 80.025],
  ],
  Puttalam: [
    [8.0362, 79.8283],
    [7.576, 79.795],
    [7.348, 79.838],
  ],
  Badulla: [
    [6.9934, 81.055],
    [6.825, 80.998],
    [6.866, 81.046],
    [6.768, 80.959],
    [6.905, 80.908],
    [7.331, 81.004],
  ],
};

/** Western province for Peliyagoda, Central for Kandy. LQ-1001, LQ-1002, … */
export function numberPlateFor(depotId: string, index: number): string {
  const province = depotId === 'Kandy' ? 'CP' : 'WP';
  return `${province} LQ-${String(1000 + index + 1).padStart(4, '0')}`;
}

/** A real point in the district. Extra shops step away from the last town. */
export function demoShopPoint(
  district: string,
  index: number,
): { lat: number; lng: number } | undefined {
  const places = DISTRICT_PLACES[district];
  if (!places || places.length === 0) return undefined;
  if (index < places.length) {
    const [lat, lng] = places[index]!;
    return { lat, lng };
  }
  const [lat, lng] = places[places.length - 1]!;
  const extra = index - places.length + 1;
  return { lat: round6(lat + extra * 0.008), lng: round6(lng + extra * 0.008) };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** "10:30-12:30" → minutes after midnight. Used when a mall names its own slot. */
export function mallWindowToMinutes(
  value: string | null | undefined,
): { open: number; close: number } | undefined {
  if (!value) return undefined;
  const match = /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/.exec(value.trim());
  if (!match) return undefined;
  const open = hhmmToMin(match[1]);
  const close = hhmmToMin(match[2]);
  if (open === undefined || close === undefined || close <= open) return undefined;
  return { open, close };
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const int = (v: string | undefined): number | undefined => {
  const n = num(v);
  return n === undefined ? undefined : Math.round(n);
};

const bool = (v: string | undefined, dflt = false): boolean => {
  if (v === undefined) return dflt;
  return ['1', 'true', 'yes', 'y', 't'].includes(v.trim().toLowerCase());
};

const slug = (v: string | undefined) => (v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

const BRANDS = ['Fresh', 'Style', 'Tech'] as const;
type BrandT = (typeof BRANDS)[number];
const brandOf = (v: string | undefined): BrandT => {
  const hit = BRANDS.find((b) => b.toLowerCase() === (v ?? '').trim().toLowerCase());
  if (!hit) throw new Error(`Unknown brand "${v}"`);
  return hit;
};

type DockT = 'rear_dock' | 'street' | 'mall_bay';
const dockOf = (v: string | undefined): DockT => {
  const s = slug(v);
  if (s.includes('rear')) return 'rear_dock';
  if (s.includes('mall')) return 'mall_bay';
  return 'street';
};

type ParkingT = 'normal' | 'van_only' | 'mall_dock';
const parkingOf = (v: string | undefined): ParkingT => {
  const s = slug(v);
  if (s.includes('van')) return 'van_only';
  if (s.includes('mall')) return 'mall_dock';
  return 'normal';
};

const chunks = <T>(arr: T[], size = 1000): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const dateOf = (v: string | undefined): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(`${v.trim().slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

// ---------- loaders ----------

async function ensureDepot(prisma: PrismaClient, id: string) {
  await prisma.depot.upsert({ where: { id }, update: {}, create: { id, name: id } });
}

async function districtId(prisma: PrismaClient, name: string, depotId?: string) {
  const d = await prisma.district.upsert({
    where: { name },
    update: {},
    create: { name, depotId },
  });
  return d.id;
}

export async function loadOutlets(prisma: PrismaClient, dir: string) {
  const rows = readCsv(dir, 'outlets.csv');
  if (!rows) return;
  const placed = new Map<string, number>();
  for (const r of rows) {
    const id = pick(r, 'outlet_id', 'store_id', 'id');
    const districtName = pick(r, 'district', 'district_name');
    const depot = pick(r, 'depot', 'depot_id', 'depot_name');
    if (!id || !districtName || !depot) {
      console.warn('[seed] outlets.csv: skipping row without id/district/depot', r);
      continue;
    }
    await ensureDepot(prisma, depot);
    const dId = await districtId(prisma, districtName, depot);
    const slot = placed.get(districtName) ?? 0;
    placed.set(districtName, slot + 1);
    const demo = demoShopPoint(districtName, slot);
    const data = {
      displayName: pick(r, 'display_name', 'name', 'outlet_name') ?? null,
      brand: brandOf(pick(r, 'brand')),
      districtId: dId,
      depotId: depot,
      dockType: dockOf(pick(r, 'dock_type', 'dock')),
      parkingConstraint: parkingOf(pick(r, 'parking_constraint', 'parking')),
      mallWindow: pick(r, 'mall_window') ?? null,
      windowOpenMin:
        mallWindowToMinutes(pick(r, 'mall_window'))?.open ??
        hhmmToMin(pick(r, 'window_open', 'window_open_time', 'delivery_window_open', 'open')) ??
        8 * 60,
      windowCloseMin:
        mallWindowToMinutes(pick(r, 'mall_window'))?.close ??
        hhmmToMin(pick(r, 'window_close', 'window_close_time', 'delivery_window_close', 'close')) ??
        17 * 60,
      lat: num(pick(r, 'lat', 'latitude')) ?? demo?.lat ?? null,
      lng: num(pick(r, 'lng', 'lon', 'longitude')) ?? demo?.lng ?? null,
    };
    await prisma.store.upsert({ where: { id }, update: data, create: { id, ...data } });
    const phone = pick(r, 'phone');
    if (phone) {
      const already = await prisma.outletPhone.findFirst({
        where: { storeId: id, phoneNo: phone },
      });
      if (!already) {
        await prisma.outletPhone.create({
          data: { storeId: id, phoneNo: phone, label: 'shop' },
        });
      }
    }
  }
}

export async function loadDistrictTravel(prisma: PrismaClient, dir: string) {
  const rows = readCsv(dir, 'district_travel.csv');
  if (!rows) return;
  for (const r of rows) {
    const name = pick(r, 'district', 'district_name');
    if (!name) continue;
    const depot = pick(r, 'depot', 'depot_id', 'depot_name');
    if (depot) await ensureDepot(prisma, depot);
    const speed = num(pick(r, 'free_flow_kmh'));
    const depotKm = num(pick(r, 'depot_to_district_km'));
    const interKm = num(pick(r, 'inter_stop_km'));
    const data = {
      depotId: depot,
      served: bool(pick(r, 'served'), true),
      roadClass: pick(r, 'road_class'),
      freeFlowKmh: speed,
      depotToDistrictKm: depotKm,
      depotToDistrictMin: int(pick(r, 'depot_to_district_min')) ?? minutesFromSpeed(depotKm, speed),
      interStopKm: interKm,
      interStopMin: int(pick(r, 'inter_stop_min')) ?? minutesFromSpeed(interKm, speed),
    };
    await prisma.district.upsert({ where: { name }, update: data, create: { name, ...data } });
  }
}

export async function loadVehicles(prisma: PrismaClient, dir: string) {
  const rows = readCsv(dir, 'vehicles.csv');
  if (!rows) return;
  const issued = new Map<string, number>();
  for (const r of rows) {
    const id = pick(r, 'vehicle_id', 'id');
    const depot = pick(r, 'depot', 'depot_id', 'depot_name');
    if (!id || !depot) {
      console.warn('[seed] vehicles.csv: skipping row without id/depot', r);
      continue;
    }
    await ensureDepot(prisma, depot);
    const slot = issued.get(depot) ?? 0;
    issued.set(depot, slot + 1);
    const data = {
      numberPlate: pick(r, 'plate', 'registration', 'reg_no', 'number_plate') ?? numberPlateFor(depot, slot),
      depotId: depot,
      type: slug(pick(r, 'type', 'vehicle_type')).includes('van') ? ('van' as const) : ('truck' as const),
      temp: slug(pick(r, 'temp', 'temperature', 'vehicle_temp')).includes('reef')
        ? ('reefer' as const)
        : ('ambient' as const),
      weightCapKg: num(pick(r, 'weight_cap_kg', 'weight_capacity_kg', 'capacity_kg')) ?? 0,
      volumeCapM3: num(pick(r, 'volume_cap_m3', 'volume_capacity_m3', 'capacity_m3')) ?? 0,
      fuelType: pick(r, 'fuel_type') ?? null,
      kmPerL: num(pick(r, 'km_per_l', 'kmpl')) ?? null,
      weeklyFuelQuotaL: num(pick(r, 'weekly_fuel_quota_l', 'fuel_quota_l')) ?? null,
      status: 'available' as const,
    };
    await prisma.vehicle.upsert({ where: { id }, update: data, create: { id, ...data } });
  }
}

export async function loadServiceAllowance(prisma: PrismaClient, dir: string) {
  const rows = readCsv(dir, 'service_allowance.csv');
  if (!rows) return;
  for (const r of rows) {
    const minutes = int(
      pick(r, 'service_allowance_min', 'minutes', 'allowance_min', 'service_min'),
    );
    if (minutes === undefined) continue;
    const brand = brandOf(pick(r, 'brand'));
    const dockType = dockOf(pick(r, 'dock_type', 'dock'));
    await prisma.serviceAllowance.upsert({
      where: { brand_dockType: { brand, dockType } },
      update: { minutes },
      create: { brand, dockType, minutes },
    });
  }
}

export async function loadCalendar(prisma: PrismaClient, dir: string) {
  const rows = readCsv(dir, 'calendar.csv');
  if (!rows) return;
  const data = rows.flatMap((r) => {
    const id = dateOf(pick(r, 'date'));
    if (!id) return [];
    return [
      {
        id,
        dow: int(pick(r, 'dow', 'day_of_week')) ?? id.getUTCDay(),
        isWeekend: bool(pick(r, 'is_weekend')),
        isoYear: int(pick(r, 'iso_year')) ?? id.getUTCFullYear(),
        isoWeek: int(pick(r, 'iso_week')) ?? 0,
        isPayday: bool(pick(r, 'is_payday')),
        festival: pick(r, 'festival') ?? null,
        festivalRamp: num(pick(r, 'festival_ramp')) ?? 0,
        isHoliday: bool(pick(r, 'is_holiday')),
        monsoon: bool(pick(r, 'monsoon')),
        isOperating: bool(pick(r, 'is_operating'), true),
      },
    ];
  });
  for (const part of chunks(data)) await prisma.calendarDay.createMany({ data: part, skipDuplicates: true });
}

export async function loadTrafficSpeed(prisma: PrismaClient, dir: string) {
  const rows = readCsv(dir, 'traffic_speed.csv');
  if (!rows) return;
  const data = rows.map((r) => ({
    districtName: pick(r, 'district', 'district_name') ?? '',
    hour: int(pick(r, 'hour')) ?? null,
    monsoon: pick(r, 'monsoon') === undefined ? null : bool(pick(r, 'monsoon')),
    speedIndex: num(pick(r, 'speed_index')) ?? null,
    raw: r,
  }));
  for (const part of chunks(data)) await prisma.trafficSpeed.createMany({ data: part });
}

export async function loadRoadConditions(prisma: PrismaClient, dir: string) {
  const rows = readCsv(dir, 'road_conditions.csv');
  if (!rows) return;
  const data = rows.flatMap((r) => {
    const date = dateOf(pick(r, 'date'));
    if (!date) return [];
    return [
      {
        date,
        districtName: pick(r, 'district', 'district_name') ?? '',
        disruptionIndex: num(pick(r, 'disruption_index')) ?? null,
        raw: r,
      },
    ];
  });
  for (const part of chunks(data)) await prisma.roadCondition.createMany({ data: part });
}

/** Fill travel minutes and mall delivery windows already stored without them. */
export async function fillPlannerMinutes(prisma: PrismaClient) {
  const districts = await prisma.district.findMany({
    select: {
      id: true,
      interStopKm: true,
      interStopMin: true,
      depotToDistrictKm: true,
      depotToDistrictMin: true,
      freeFlowKmh: true,
    },
  });
  let districtUpdates = 0;
  for (const district of districts) {
    const interStopMin =
      district.interStopMin ??
      minutesFromSpeed(district.interStopKm ?? undefined, district.freeFlowKmh ?? undefined) ??
      null;
    const depotToDistrictMin =
      district.depotToDistrictMin ??
      minutesFromSpeed(district.depotToDistrictKm ?? undefined, district.freeFlowKmh ?? undefined) ??
      null;
    if (interStopMin === district.interStopMin && depotToDistrictMin === district.depotToDistrictMin) continue;
    await prisma.district.update({
      where: { id: district.id },
      data: { interStopMin, depotToDistrictMin },
    });
    districtUpdates += 1;
  }

  const stores = await prisma.store.findMany({
    where: { mallWindow: { not: null } },
    select: { id: true, mallWindow: true, windowOpenMin: true, windowCloseMin: true },
  });
  let storeUpdates = 0;
  for (const store of stores) {
    const window = mallWindowToMinutes(store.mallWindow);
    if (!window) continue;
    if (store.windowOpenMin === window.open && store.windowCloseMin === window.close) continue;
    await prisma.store.update({
      where: { id: store.id },
      data: { windowOpenMin: window.open, windowCloseMin: window.close },
    });
    storeUpdates += 1;
  }
  console.log(`[seed] planner minutes: ${districtUpdates} districts, ${storeUpdates} mall stores`);
}

/** Give shops with no spreadsheet coordinates a real point in their district. */
export async function fillStoreLocations(prisma: PrismaClient) {
  const stores = await prisma.store.findMany({
    where: { OR: [{ lat: null }, { lng: null }] },
    select: { id: true, district: { select: { name: true } } },
    orderBy: { id: 'asc' },
  });
  const placed = new Map<string, number>();
  let updates = 0;
  for (const store of stores) {
    const name = store.district.name;
    const slot = placed.get(name) ?? 0;
    placed.set(name, slot + 1);
    const point = demoShopPoint(name, slot);
    if (!point) continue;
    await prisma.store.update({ where: { id: store.id }, data: point });
    updates += 1;
  }
  console.log(`[seed] shop locations: ${updates}`);
}

/** Give vehicles with no registration a unique number plate. */
export async function fillNumberPlates(prisma: PrismaClient) {
  const vehicles = await prisma.vehicle.findMany({
    where: { numberPlate: null },
    select: { id: true, depotId: true },
    orderBy: [{ depotId: 'asc' }, { id: 'asc' }],
  });
  const issued = new Map<string, number>();
  for (const vehicle of vehicles) {
    const slot = issued.get(vehicle.depotId) ?? 0;
    issued.set(vehicle.depotId, slot + 1);
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { numberPlate: numberPlateFor(vehicle.depotId, slot) },
    });
  }
  if (vehicles.length > 0) console.log(`[seed] number plates: ${vehicles.length}`);
}

export async function loadAllCsv(prisma: PrismaClient, dir: string) {
  await loadOutlets(prisma, dir);
  await loadDistrictTravel(prisma, dir);
  await loadVehicles(prisma, dir);
  await loadServiceAllowance(prisma, dir);
  await loadCalendar(prisma, dir);
  await loadTrafficSpeed(prisma, dir);
  await loadRoadConditions(prisma, dir);
}
