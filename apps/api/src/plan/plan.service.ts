import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  ORDER_CUTOFF_MIN,
  type Me,
  type PlanDay,
  type PlanOrder,
  type PlanSummary,
  type PlanTrip,
  type PlanTripState,
} from '@waypoint/contracts';
import {
  TIME_BUDGET_MIN,
  capacitySummary,
  computeTripMinutes,
  evaluatePublish,
  measureCapacity,
  type Depot,
  type Lookup,
} from '@waypoint/domain';
import type { Vehicle as VehicleRow } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  isAtDepot,
  orderInclude,
  toLookup,
  toOrder,
  toOutlet,
  toStopView,
  toVehicle,
  tripAreaLabel,
  tripInclude,
  usedPct,
  withoutCoveredDistricts,
  type OrderRow,
  type TripRow,
} from './plan.mapper';

/** Booklet departures: the Fresh run leaves at 03:30, the other brands at 08:00. */
export const DEPART_MIN = { Fresh: 3 * 60 + 30, Style: 8 * 60, Tech: 8 * 60 } as const;

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;
/** "Kasun (Driver)" -> "Kasun": seeded names carry the role in brackets. */
const personName = (name: string) => name.replace(/\s*\(.*\)\s*$/, '').trim() || name;
const byWindow = (a: PlanOrder, b: PlanOrder) =>
  a.windowOpenMin - b.windowOpenMin || a.storeName.localeCompare(b.storeName);
/** Urgent orders move to the top; each group keeps its order (a stable partition). */
const urgentFirst = (orders: PlanOrder[]) => [
  ...orders.filter((o) => o.urgent),
  ...orders.filter((o) => !o.urgent),
];

function addDays(iso: string, days: number): string {
  const d = dateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** The plan board for one service day (tomorrow unless a date is given). */
  async day(me: Me, dateParam?: string): Promise<PlanDay> {
    if (dateParam !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    if (!me.depotId) throw new ForbiddenException('This account has no depot');
    const depotId = me.depotId;
    const date = dateParam ?? addDays(this.clock.today(), 1);
    const day = dateOnly(date);

    const [waitingRows, deferredRows, tripRows, vehicles, districts, allowances, drivers] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { deliveryDate: day, status: 'waiting', stop: null, store: { depotId } },
          include: orderInclude,
        }),
        this.prisma.order.findMany({
          where: { movedFromDate: day, status: 'deferred', store: { depotId } },
          include: orderInclude,
        }),
        this.prisma.trip.findMany({
          where: { serviceDate: day, depotId },
          include: tripInclude,
          orderBy: [{ vehicleId: 'asc' }, { tripNumber: 'asc' }],
        }),
        this.prisma.vehicle.findMany({ where: { depotId } }),
        this.prisma.district.findMany(),
        this.prisma.serviceAllowance.findMany(),
        // Drivers who still work here: no leaving date yet, or one after the plan day.
        this.prisma.user.findMany({
          where: {
            role: 'driver',
            depotId,
            OR: [
              { driverProfile: null },
              {
                driverProfile: {
                  isActive: true,
                  OR: [{ leavingDate: null }, { leavingDate: { gt: day } }],
                },
              },
            ],
          },
          select: { id: true, name: true, vehicle: { select: { id: true } } },
          orderBy: { name: 'asc' },
        }),
      ]);

    const lookup = toLookup(districts, allowances);
    const today = this.clock.today();
    const orders = urgentFirst(waitingRows.map((r) => this.planOrder(r, today)).sort(byWindow));
    const movedToLater = deferredRows.map((r) => this.planOrder(r, today)).sort(byWindow);
    const trips = tripRows.map((t) => this.planTrip(t, lookup, depotId as Depot));

    return {
      date,
      today,
      depotId,
      cutoffMin: ORDER_CUTOFF_MIN,
      orders,
      movedToLater,
      trips,
      drivers: drivers.map((d) => ({
        id: d.id,
        name: personName(d.name),
        vehicleId: d.vehicle?.id ?? null,
      })),
      districts: [...new Set(orders.map((o) => o.district))].sort(),
      summary: this.summary(waitingRows, tripRows, trips, vehicles, orders, movedToLater),
      published: this.published(tripRows),
    };
  }

  /** Travel and service-allowance tables for the domain rules. */
  async loadLookup(): Promise<Lookup> {
    const [districts, allowances] = await Promise.all([
      this.prisma.district.findMany(),
      this.prisma.serviceAllowance.findMany(),
    ]);
    return toLookup(districts, allowances);
  }

  /** Set once every trip that currently has stops has been sent. Empty new trips do not clear it. */
  private published(tripRows: TripRow[]): PlanDay['published'] {
    const withStops = tripRows.filter((t) => t.stops.length > 0);
    if (withStops.length === 0 || withStops.some((t) => t.status === 'planning')) return null;
    const at = withStops.reduce<Date | null>(
      (latest, t) =>
        t.publishedAt && (!latest || t.publishedAt > latest) ? t.publishedAt : latest,
      null,
    );
    if (!at) return null;
    return {
      at: at.toISOString(),
      tripCount: withStops.length,
      storeCount: new Set(withStops.flatMap((t) => t.stops.map((s) => s.order.storeId))).size,
    };
  }

  planOrder(row: OrderRow, today: string): PlanOrder {
    const deferred = row.status === 'deferred';
    return {
      id: row.id,
      storeId: row.storeId,
      storeName: row.store.displayName ?? row.store.id,
      brand: row.brand,
      district: row.store.district.name,
      windowOpenMin: row.store.windowOpenMin,
      windowCloseMin: row.store.windowCloseMin,
      weightKg: row.weightKg,
      volumeM3: row.volumeM3,
      units: row.units,
      chilled: row.temp === 'chilled',
      movedCount: row.repeatSkip ? 2 : row.movedFromDate && !deferred ? 1 : 0,
      waitingSinceYesterday: isoDate(row.createdAt) < today,
      status: deferred ? 'deferred' : 'waiting',
      deferredTo: deferred ? isoDate(row.deliveryDate) : null,
      deferReason: row.deferReason,
      urgent: row.urgent,
      stockLevel: row.stockLevel,
      urgentNote: row.urgentNote,
    };
  }

  planTrip(row: TripRow, lookup: Lookup, depot: Depot): PlanTrip {
    const vehicle = toVehicle(row.vehicle);
    const stopViews = row.stops.map((s) => toStopView(s.order));
    const capacity = measureCapacity(
      vehicle,
      stopViews.map((s) => s.order),
    );
    const minutes = computeTripMinutes(stopViews, lookup, depot) ?? row.plannedMinutes;

    let state: PlanTripState;
    if (row.status !== 'planning') {
      state = 'sent';
    } else if (capacity.overWeight || capacity.overVolume) {
      state = 'over';
    } else {
      // Fuel is judged per week, which the board does not total yet, so it does not make a trip a draft.
      const check = evaluatePublish({
        vehicle,
        stops: stopViews,
        lookup,
        departAtMin: DEPART_MIN[row.brand],
        otherLitresThisWeek: 0,
      });
      const issues = withoutCoveredDistricts(
        [...check.blocks, ...check.warnings],
        row,
        stopViews,
      ).filter((i) => i.code !== 'FUEL_QUOTA');
      state = stopViews.length === 0 || issues.length > 0 ? 'draft' : 'ready';
    }

    // The driver the dispatcher picked, else the vehicle's registered driver (same rule as the phone).
    const driver = row.assignedDriver ?? row.vehicle.driver;
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      plate: row.vehicle.numberPlate,
      vehicleType: row.vehicle.type,
      vehicleTemp: row.vehicle.temp,
      brand: row.brand,
      district: tripAreaLabel(row),
      tripNumber: row.tripNumber,
      status: row.status,
      state,
      editable: isAtDepot(row.status),
      overWeight: capacity.overWeight,
      overVolume: capacity.overVolume,
      weightKg: capacity.usedWeightKg,
      weightCapKg: capacity.weightCapKg,
      volumeM3: round1(capacity.usedVolumeM3),
      volumeCapM3: capacity.volumeCapM3,
      minutes,
      budgetMin: TIME_BUDGET_MIN[row.brand],
      driverId: driver?.id ?? null,
      driverName: driver ? personName(driver.name) : null,
      driverAssigned: row.assignedDriverId !== null,
      stops: row.stops.map((s) => ({
        id: s.id,
        orderId: s.orderId,
        sequence: s.sequence,
        storeName: s.order.store.displayName ?? s.order.store.id,
        windowOpenMin: s.order.store.windowOpenMin,
        windowCloseMin: s.order.store.windowCloseMin,
        weightKg: s.order.weightKg,
      })),
    };
  }

  private summary(
    waitingRows: OrderRow[],
    tripRows: TripRow[],
    trips: PlanTrip[],
    vehicles: VehicleRow[],
    orders: PlanOrder[],
    movedToLater: PlanOrder[],
  ): PlanSummary {
    const busy = new Set(tripRows.map((t) => t.vehicleId));
    const available = vehicles.filter((v) => v.status === 'available');

    // Capacity used = what is planned against what the day's trips can carry. Each trip is a
    // full load, so a vehicle on two runs counts twice; weight or volume, whichever is fuller.
    const sum = (f: (t: PlanTrip) => number) => trips.reduce((total, t) => total + f(t), 0);
    const capacityUsedPct = usedPct(
      sum((t) => t.weightKg),
      sum((t) => t.weightCapKg),
      sum((t) => t.volumeM3),
      sum((t) => t.volumeCapM3),
    );

    const over = trips.filter((t) => t.overWeight || t.overVolume);
    const overVolume = over.some((t) => t.overVolume);
    const overWeight = over.some((t) => t.overWeight);

    // The day's demand is every order for the date, planned or still waiting.
    const demand = [...waitingRows, ...tripRows.flatMap((t) => t.stops.map((s) => s.order))];
    const limit = capacitySummary(
      demand.map(toOrder),
      demand.map((o) => toOutlet(o.store)),
      available.map(toVehicle),
    );

    return {
      vehiclesFree: available.filter((v) => !busy.has(v.id)).length,
      vehiclesTotal: vehicles.length,
      capacityUsedPct,
      overCount: over.length,
      overWhat:
        overVolume && overWeight ? 'both' : overVolume ? 'volume' : overWeight ? 'weight' : null,
      orderCount: demand.length,
      waitingCount: orders.length,
      waitingSinceYesterday: orders.filter((o) => o.waitingSinceYesterday).length,
      movedToLaterCount: movedToLater.length,
      limitingResource: limit.limitingResource,
      overbooked: limit.overbooked,
    };
  }
}
