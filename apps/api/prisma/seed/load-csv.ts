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
    const data = {
      displayName: pick(r, 'display_name', 'name', 'outlet_name') ?? null,
      brand: brandOf(pick(r, 'brand')),
      districtId: dId,
      depotId: depot,
      dockType: dockOf(pick(r, 'dock_type', 'dock')),
      parkingConstraint: parkingOf(pick(r, 'parking_constraint', 'parking')),
      mallWindow: pick(r, 'mall_window') ?? null,
      windowOpenMin: hhmmToMin(pick(r, 'window_open', 'delivery_window_open', 'open')) ?? 8 * 60,
      windowCloseMin: hhmmToMin(pick(r, 'window_close', 'delivery_window_close', 'close')) ?? 17 * 60,
      lat: num(pick(r, 'lat', 'latitude')) ?? null,
      lng: num(pick(r, 'lng', 'lon', 'longitude')) ?? null,
      phone: pick(r, 'phone') ?? null,
    };
    await prisma.store.upsert({ where: { id }, update: data, create: { id, ...data } });
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
    const data = {
      depotId: depot,
      served: bool(pick(r, 'served'), true),
      roadClass: pick(r, 'road_class'),
      freeFlowKmh: num(pick(r, 'free_flow_kmh')),
      depotToDistrictKm: num(pick(r, 'depot_to_district_km')),
      depotToDistrictMin: int(pick(r, 'depot_to_district_min')),
      interStopKm: num(pick(r, 'inter_stop_km')),
      interStopMin: int(pick(r, 'inter_stop_min')),
    };
    await prisma.district.upsert({ where: { name }, update: data, create: { name, ...data } });
  }
}

export async function loadVehicles(prisma: PrismaClient, dir: string) {
  const rows = readCsv(dir, 'vehicles.csv');
  if (!rows) return;
  for (const r of rows) {
    const id = pick(r, 'vehicle_id', 'id');
    const depot = pick(r, 'depot', 'depot_id', 'depot_name');
    if (!id || !depot) {
      console.warn('[seed] vehicles.csv: skipping row without id/depot', r);
      continue;
    }
    await ensureDepot(prisma, depot);
    const data = {
      plate: pick(r, 'plate', 'registration', 'reg_no') ?? null,
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
    const minutes = int(pick(r, 'minutes', 'allowance_min', 'service_min'));
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

export async function loadAllCsv(prisma: PrismaClient, dir: string) {
  await loadOutlets(prisma, dir);
  await loadDistrictTravel(prisma, dir);
  await loadVehicles(prisma, dir);
  await loadServiceAllowance(prisma, dir);
  await loadCalendar(prisma, dir);
  await loadTrafficSpeed(prisma, dir);
  await loadRoadConditions(prisma, dir);
}
