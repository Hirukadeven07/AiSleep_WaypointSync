import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AssignResult,
  DropCheck,
  Me,
  PlanIssue,
  PlanOrderDetail,
  ReasonCode,
  UnassignResult,
} from '@waypoint/contracts';
import {
  DomainError,
  capacityIssues,
  computeTripMinutes,
  evaluateDrop,
  measureCapacity,
  rankVehiclesForOrder,
  sortStopsByWindow,
  stopEtas,
  windowRiskIssues,
  type Depot,
  type Lookup,
  type RuleIssue,
  type TripView,
} from '@waypoint/domain';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { tellDriversPlanChanged } from '../driver/driver-notices';
import { NoticeHub, type RaisedNotice } from '../notifications/notice-hub';
import { DEPART_MIN, PlanService } from './plan.service';
import {
  isAtDepot,
  orderInclude,
  toOutlet,
  toStopView,
  toVehicle,
  tripAreaLabel,
  tripInclude,
  withoutCoveredDistricts,
  type OrderRow,
  type TripRow,
} from './plan.mapper';

const issue = (i: RuleIssue): PlanIssue => ({
  code: String(i.code),
  severity: i.severity,
  message: i.message,
});
const round1 = (n: number) => Math.round(n * 10) / 10;
const KIND = { truck: 'Ambient', van: 'Van' } as const;

/** Dispatcher edits to the plan: check a drop, place an order on a trip, take it off again, read one order. */
@Injectable()
export class PlanEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plan: PlanService,
    private readonly clock: ClockService,
    private readonly hub: NoticeHub,
  ) {}

  /** Push notices that were written inside a transaction, once that transaction has committed. */
  publishRaised(rows: RaisedNotice[]) {
    this.hub.publishAll(rows);
  }

  depotOf(me: Me): string {
    if (!me.depotId) throw new ForbiddenException('This account has no depot');
    return me.depotId;
  }

  async loadOrder(me: Me, orderId: string): Promise<OrderRow> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, store: { depotId: this.depotOf(me) } },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async loadTrip(
    me: Me,
    tripId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const trip = await db.trip.findFirst({
      where: { id: tripId, depotId: this.depotOf(me) },
      include: tripInclude,
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  static assertEditable(trip: TripRow) {
    if (!isAtDepot(trip.status)) {
      throw new DomainError(
        'PLAN_LOCKED',
        `${trip.vehicle.numberPlate ?? trip.vehicleId} · Trip ${trip.tripNumber} has left the depot and can no longer be changed.`,
      );
    }
  }

  /** Work out what adding `order` to `trip` would do. Nothing is saved. */
  evaluate(order: OrderRow, trip: TripRow, lookup: Lookup) {
    const vehicle = toVehicle(trip.vehicle);
    const candidate = toStopView(order);
    const current = sortStopsByWindow(
      trip.stops.filter((s) => s.orderId !== order.id).map((s) => toStopView(s.order)),
    );

    const issues: RuleIssue[] = withoutCoveredDistricts(
      evaluateDrop({ vehicle, currentStops: current, candidate, lookup }),
      trip,
      [...current, candidate],
    );
    // A trip with no stops yet still belongs to one brand.
    if (current.length === 0 && trip.brand !== order.brand) {
      issues.push({
        code: 'BRAND_MISMATCH' as ReasonCode,
        severity: 'block',
        message: `${trip.vehicle.numberPlate ?? trip.vehicleId} · Trip ${trip.tripNumber} carries ${trip.brand}; ${order.store.displayName ?? order.store.id} is a ${order.brand} store.`,
      });
    }

    const sorted = sortStopsByWindow([...current, candidate]);
    // A sent plan must stay inside capacity, so on a sent trip being over blocks the drop.
    const capacity = capacityIssues(vehicle, sorted, trip.status !== 'planning');
    const measured = measureCapacity(
      vehicle,
      sorted.map((s) => s.order),
    );
    const all = [...issues, ...capacity];
    const blocks = all.filter((i) => i.severity === 'block');
    const warnings = all.filter((i) => i.severity === 'warn');

    return {
      current,
      sorted,
      blocks,
      warnings,
      placedSequence: sorted.indexOf(candidate) + 1,
      // The stop slots in ahead of stops already on the trip, so their numbers shift.
      resorted: sorted.indexOf(candidate) < sorted.length - 1,
      after: {
        stopCount: sorted.length,
        weightKg: measured.usedWeightKg,
        volumeM3: round1(measured.usedVolumeM3),
        minutes: computeTripMinutes(sorted, lookup, trip.depotId as Depot),
      },
    };
  }

  async check(me: Me, orderId: string, tripId: string): Promise<DropCheck> {
    const [order, trip, lookup] = await Promise.all([
      this.loadOrder(me, orderId),
      this.loadTrip(me, tripId),
      this.plan.loadLookup(),
    ]);
    PlanEditService.assertEditable(trip);
    const result = this.evaluate(order, trip, lookup);
    return {
      orderId,
      tripId,
      canDrop: result.blocks.length === 0,
      blocks: result.blocks.map(issue),
      warnings: result.warnings.map(issue),
      placedSequence: result.placedSequence,
      after: result.after,
    };
  }

  async assign(me: Me, orderId: string, tripId: string): Promise<AssignResult> {
    const lookup = await this.plan.loadLookup();
    const depot = this.depotOf(me) as Depot;

    const { fromTripId, placed, resorted, order, notices } = await this.prisma.$transaction(async (tx) => {
      const order = await this.loadOrder(me, orderId);
      const trip = await this.loadTrip(me, tripId, tx);
      PlanEditService.assertEditable(trip);
      if (order.deliveryDate.getTime() !== trip.serviceDate.getTime()) {
        throw new DomainError('PLAN_LOCKED', 'The order and the trip are for different days.');
      }

      const result = this.evaluate(order, trip, lookup);
      if (result.blocks.length > 0) {
        throw new DomainError(result.blocks[0].code, result.blocks[0].message);
      }

      const existing = await tx.tripStop.findUnique({ where: { orderId } });
      let fromTripId: string | null = null;
      if (existing) {
        if (existing.tripId === tripId) {
          return {
            fromTripId: null,
            placed: result.placedSequence,
            resorted: false,
            order,
            notices: [] as RaisedNotice[],
          };
        }
        const source = await this.loadTrip(me, existing.tripId, tx);
        PlanEditService.assertEditable(source);
        fromTripId = existing.tripId;
        await tx.tripStop.update({ where: { orderId }, data: { tripId, sequence: 9999 } });
      } else {
        await tx.tripStop.create({ data: { tripId, orderId, sequence: 9999 } });
      }
      await tx.order.update({ where: { id: orderId }, data: { status: 'planned' } });
      const notices = await this.resequence(tx, tripId, lookup, depot);
      if (fromTripId) notices.push(...(await this.resequence(tx, fromTripId, lookup, depot)));
      return { fromTripId, placed: result.placedSequence, resorted: result.resorted, order, notices };
    });
    this.publishRaised(notices);

    return {
      orderId,
      storeName: order.store.displayName ?? order.store.id,
      placedSequence: placed,
      resorted,
      trip: await this.tripView(me, tripId, lookup, depot),
      fromTrip: fromTripId ? await this.tripView(me, fromTripId, lookup, depot) : null,
    };
  }

  async unassign(me: Me, orderId: string): Promise<UnassignResult> {
    const lookup = await this.plan.loadLookup();
    const depot = this.depotOf(me) as Depot;
    await this.loadOrder(me, orderId);

    const { fromTripId, notices } = await this.prisma.$transaction(async (tx) => {
      const stop = await tx.tripStop.findUnique({ where: { orderId } });
      if (!stop) return { fromTripId: null, notices: [] as RaisedNotice[] };
      const trip = await this.loadTrip(me, stop.tripId, tx);
      PlanEditService.assertEditable(trip);
      await tx.tripStop.delete({ where: { orderId } });
      await tx.order.update({ where: { id: orderId }, data: { status: 'waiting' } });
      return { fromTripId: stop.tripId, notices: await this.resequence(tx, stop.tripId, lookup, depot) };
    });
    this.publishRaised(notices);

    return {
      orderId,
      fromTrip: fromTripId ? await this.tripView(me, fromTripId, lookup, depot) : null,
    };
  }

  /**
   * Stops follow delivery windows, so every change re-sorts the trip and refreshes its planned minutes
   * and each stop's ETA (read by the store, the driver and the dispatch board).
   * A change to a sent trip also raises its plan version, which pauses the dock until the loader accepts it.
   */
  async resequence(
    tx: Prisma.TransactionClient,
    tripId: string,
    lookup: Lookup,
    depot: Depot,
  ): Promise<RaisedNotice[]> {
    const trip = await tx.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { status: true, brand: true },
    });
    const stops = await tx.tripStop.findMany({
      where: { tripId },
      include: { order: { include: orderInclude } },
    });
    const views = new Map(stops.map((s) => [toStopView(s.order), s.id]));
    const sorted = sortStopsByWindow([...views.keys()]);
    // Null when the travel or allowance rows for the district are missing.
    const etas = stopEtas(sorted, lookup, depot, DEPART_MIN[trip.brand]);
    // The (tripId, sequence) pair is unique, so park every stop out of the way before numbering.
    for (const [i, view] of sorted.entries()) {
      await tx.tripStop.update({ where: { id: views.get(view)! }, data: { sequence: 1000 + i } });
    }
    for (const [i, view] of sorted.entries()) {
      await tx.tripStop.update({
        where: { id: views.get(view)! },
        data: { sequence: i + 1, etaMin: etas?.[i]?.arriveMin ?? null },
      });
    }
    await tx.trip.update({
      where: { id: tripId },
      data: {
        plannedMinutes: computeTripMinutes(sorted, lookup, depot),
        ...(trip.status !== 'planning' && { planVersion: { increment: 1 } }),
      },
    });
    if (trip.status === 'planning') return [];
    return tellDriversPlanChanged(tx, [tripId]);
  }

  async tripView(me: Me, tripId: string, lookup: Lookup, depot: Depot) {
    return this.plan.planTrip(await this.loadTrip(me, tripId), lookup, depot);
  }

  async orderDetail(me: Me, orderId: string): Promise<PlanOrderDetail> {
    const depotId = this.depotOf(me);
    const order = await this.loadOrder(me, orderId);
    const [lines, stop, lookup, allowance] = await Promise.all([
      this.prisma.orderLine.findMany({ where: { orderId }, orderBy: { name: 'asc' } }),
      this.prisma.tripStop.findUnique({ where: { orderId } }),
      this.plan.loadLookup(),
      this.prisma.serviceAllowance.findUnique({
        where: { brand_dockType: { brand: order.brand, dockType: order.store.dockType } },
      }),
    ]);

    const day = order.deliveryDate;
    const [tripRows, vehicles] = await Promise.all([
      this.prisma.trip.findMany({
        where: { serviceDate: day, depotId, status: 'planning' },
        include: tripInclude,
      }),
      this.prisma.vehicle.findMany({ where: { depotId, status: 'available' } }),
    ]);

    const views: TripView[] = tripRows.map((t) => ({
      trip: {
        id: t.id,
        vehicleId: t.vehicleId,
        serviceDate: day.toISOString().slice(0, 10),
        tripNumber: t.tripNumber as 1 | 2,
      },
      vehicle: toVehicle(t.vehicle),
      stops: sortStopsByWindow(
        t.stops.filter((s) => s.orderId !== orderId).map((s) => toStopView(s.order)),
      ),
    }));
    const taken: Record<string, number> = {};
    for (const t of tripRows) taken[t.vehicleId] = (taken[t.vehicleId] ?? 0) + 1;

    const ranked = rankVehiclesForOrder({
      order: toStopView(order).order,
      outlet: toOutlet(order.store),
      vehicles: vehicles.map(toVehicle),
      trips: views,
      tripsTakenToday: taken,
      lookup,
    }).filter((o) => !o.hardBlocked && o.tripId !== null && o.tripId !== stop?.tripId);

    // Suggest only a trip it really fits: no warning on the drop (other district, over weight or
    // volume, ...) and the store reached inside its window.
    let fit: { row: TripRow; result: ReturnType<PlanEditService['evaluate']> } | null = null;
    for (const option of ranked) {
      const row = tripRows.find((t) => t.id === option.tripId);
      if (!row) continue;
      const result = this.evaluate(order, row, lookup);
      if (result.blocks.length > 0 || result.warnings.length > 0) continue;
      const etas = stopEtas(result.sorted, lookup, depotId as Depot, DEPART_MIN[row.brand]) ?? [];
      if (windowRiskIssues(etas).length > 0) continue;
      fit = { row, result };
      break;
    }

    let suggestion: PlanOrderDetail['suggestion'] = null;
    if (fit) {
      const { row, result } = fit;
      const kind =
        row.vehicle.type === 'van'
          ? KIND.van
          : row.vehicle.temp === 'reefer'
            ? 'Refrigerated'
            : KIND.truck;
      suggestion = {
        tripId: row.id,
        label: `${row.vehicle.numberPlate ?? row.vehicleId} · Trip ${row.tripNumber}`,
        detail: `${kind} · ${row.brand} · ${tripAreaLabel(row)} · has room`,
        fit: `fits as stop ${result.placedSequence}, window met`,
      };
    }

    const planOrder = this.plan.planOrder(order, this.clock.today());
    return {
      order: planOrder,
      code: `ORD-${order.id.slice(-5).toUpperCase()}`,
      lines: lines.map((l) => ({
        id: l.id,
        name: l.name,
        qty: l.qty,
        pack: l.pack,
        chilled: l.chilled,
      })),
      dockType: order.store.dockType,
      unloadMin: allowance?.minutes ?? null,
      warning:
        planOrder.movedCount > 0
          ? `Already moved ${planOrder.movedCount === 1 ? 'once' : 'twice'}${order.deferReason ? ` (${order.deferReason})` : ''}.`
          : null,
      assignedTripId: stop?.tripId ?? null,
      suggestion,
    };
  }
}
