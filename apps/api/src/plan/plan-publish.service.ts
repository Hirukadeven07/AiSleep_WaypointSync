import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Me, PlanPublishResult, PublishCheck, PublishProblem } from '@waypoint/contracts';
import { DomainError, evaluatePublish, measureCapacity, type RuleIssue } from '@waypoint/domain';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { NOTIFIER, type Notifier } from '../notifications/notifier.interface';
import { PlanEditService } from './plan-edit.service';
import { clockText, dayLabel } from './plan-labels';
import { DEPART_MIN, PlanService } from './plan.service';
import {
  toStopView,
  toVehicle,
  tripInclude,
  withoutCoveredDistricts,
  type TripRow,
} from './plan.mapper';

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** The publish gate: capacity problems block, other warnings can be published through. */
@Injectable()
export class PlanPublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edit: PlanEditService,
    private readonly plan: PlanService,
    private readonly clock: ClockService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  private serviceDate(date?: string) {
    if (date) return date;
    const d = dateOnly(this.clock.today());
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  private async planningTrips(me: Me, date?: string, tripId?: string): Promise<TripRow[]> {
    const day = this.serviceDate(date);
    const trips = await this.prisma.trip.findMany({
      where: {
        depotId: this.edit.depotOf(me),
        serviceDate: dateOnly(day),
        status: 'planning',
      },
      include: tripInclude,
      orderBy: [{ vehicleId: 'asc' }, { tripNumber: 'asc' }],
    });
    // A trip with no stops has nothing to send.
    const ready = trips.filter((t) => t.stops.length > 0);
    if (!tripId) return ready;

    const trip = await this.edit.loadTrip(me, tripId);
    if (trip.serviceDate.toISOString().slice(0, 10) !== day) throw new NotFoundException('Trip not found');
    if (trip.status !== 'planning') {
      throw new DomainError('PLAN_LOCKED', 'This trip is already published.');
    }
    if (trip.stops.length === 0) {
      throw new DomainError('PLAN_LOCKED', 'Add stops before publishing this trip.');
    }
    return ready.filter((t) => t.id === tripId);
  }

  private problems(
    trips: TripRow[],
    lookup: Awaited<ReturnType<PlanService['loadLookup']>>,
  ): PublishProblem[] {
    const out: PublishProblem[] = [];
    for (const trip of trips) {
      const vehicle = toVehicle(trip.vehicle);
      const stops = trip.stops.map((s) => toStopView(s.order));
      const plate = trip.vehicle.numberPlate ?? trip.vehicleId;
      const name = `${plate} · Trip ${trip.tripNumber}`;
      const cap = measureCapacity(
        vehicle,
        stops.map((s) => s.order),
      );
      const result = evaluatePublish({
        vehicle,
        stops,
        lookup,
        departAtMin: DEPART_MIN[trip.brand],
        otherLitresThisWeek: 0,
      });
      const push = (i: RuleIssue, message: string) =>
        out.push({
          tripId: trip.id,
          trip: name,
          code: String(i.code),
          message,
          severity: i.severity,
        });
      for (const i of withoutCoveredDistricts(
        [...result.blocks, ...result.warnings],
        trip,
        stops,
      )) {
        if (i.code === 'OVER_VOLUME') {
          push(
            i,
            `${plate} is over volume (${cap.usedVolumeM3.toFixed(1)} / ${cap.volumeCapM3.toFixed(1)} m³). The loader will not fit everything.`,
          );
        } else if (i.code === 'OVER_WEIGHT') {
          push(
            i,
            `${plate} is over weight (${Math.round(cap.usedWeightKg)} / ${Math.round(cap.weightCapKg)} kg). The loader will not fit everything.`,
          );
        } else if (i.code !== 'FUEL_QUOTA') {
          // Fuel is judged per week, which the board does not total yet.
          push(i, `${plate}: ${i.message}`);
        }
      }
    }
    return out;
  }

  async check(me: Me, date?: string, tripId?: string): Promise<PublishCheck> {
    const [trips, lookup] = await Promise.all([
      this.planningTrips(me, date, tripId),
      this.plan.loadLookup(),
    ]);
    const problems = this.problems(trips, lookup);
    return {
      tripCount: trips.length,
      storeCount: new Set(trips.flatMap((t) => t.stops.map((s) => s.order.storeId))).size,
      problems,
      canPublish: !problems.some((p) => p.severity === 'block'),
    };
  }

  /**
   * Sends trips to loaders and drivers and tells each store its delivery window.
   * `tripId` sends that trip only. Without it, every trip that still has stops is sent.
   */
  async publish(me: Me, anyway: boolean, date?: string, tripId?: string): Promise<PlanPublishResult> {
    const [trips, lookup] = await Promise.all([
      this.planningTrips(me, date, tripId),
      this.plan.loadLookup(),
    ]);
    const problems = this.problems(trips, lookup);
    const block = problems.find((p) => p.severity === 'block');
    if (block) throw new DomainError(block.code as never, block.message);
    const warn = problems.find((p) => p.severity === 'warn');
    if (warn && !anyway) throw new DomainError(warn.code as never, warn.message);
    if (trips.length === 0) {
      throw new DomainError(
        'PLAN_LOCKED',
        tripId ? 'This trip cannot be published.' : 'There are no trips with stops to publish.',
      );
    }

    // Stops placed outside the board (seed fixtures) have no ETAs yet; sort and time every trip once more.
    const depot = this.edit.depotOf(me) as Parameters<PlanEditService['resequence']>[3];
    await this.prisma.$transaction(async (tx) => {
      for (const t of trips) await this.edit.resequence(tx, t.id, lookup, depot);
    });

    const now = this.clock.now();
    await this.prisma.trip.updateMany({
      where: { id: { in: trips.map((t) => t.id) } },
      data: { status: 'published', publishedAt: now },
    });
    await this.handToDock(me, trips);

    const stores = new Map<string, { storeId: string; open: number; close: number; date: Date }>();
    for (const t of trips) {
      for (const s of t.stops) {
        stores.set(s.order.storeId, {
          storeId: s.order.storeId,
          open: s.order.store.windowOpenMin,
          close: s.order.store.windowCloseMin,
          date: t.serviceDate,
        });
      }
    }
    for (const s of stores.values()) {
      const users = await this.prisma.user.findMany({
        where: { storeId: s.storeId, role: 'store' },
      });
      for (const u of users) {
        await this.notifier.notify({
          userId: u.id,
          title: `Delivery confirmed for ${dayLabel(s.date)}`,
          body: `Your delivery arrives between ${clockText(s.open)} and ${clockText(s.close)}.`,
          link: '/store',
        });
      }
    }

    return {
      ok: true,
      publishedAt: now.toISOString(),
      tripCount: trips.length,
      storeCount: stores.size,
    };
  }

  /** A published trip becomes a loading job the dock queue can pick up. */
  private async handToDock(me: Me, trips: TripRow[]) {
    const dispatcher = await this.prisma.dispatcher.upsert({
      where: { userId: me.id },
      update: {},
      create: { userId: me.id },
    });
    for (const trip of trips) {
      const totalWeightKg = trip.stops.reduce((sum, stop) => sum + stop.order.weightKg, 0);
      const totalVolumeM3 = trip.stops.reduce((sum, stop) => sum + stop.order.volumeM3, 0);
      await this.prisma.loadingJob.upsert({
        where: { tripId: trip.id },
        update: {},
        create: {
          tripId: trip.id,
          depot: trip.depotId,
          assignedById: dispatcher.id,
          status: 'assigned',
          totalWeightKg,
          totalVolumeM3,
        },
      });
    }
  }
}
