import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Me, MoveOptions, MoveStopResult, StopStatus, TripStatus } from '@waypoint/contracts';
import {
  capacityIssues,
  evaluateDrop,
  sortStopsByWindow,
  stopEtas,
  type Depot,
  type Lookup,
  type RuleIssue,
} from '@waypoint/domain';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { tellDriversPlanChanged } from '../driver/driver-notices';
import { NoticeHub } from '../notifications/notice-hub';
import { NOTIFIER, type Notifier } from '../notifications/notifier.interface';
import { toStopView, toVehicle, tripInclude, type TripRow } from '../plan/plan.mapper';
import { DEPART_MIN, PlanService } from '../plan/plan.service';

/** Stops that can still move: the driver has not reached them. */
const MOVABLE: StopStatus[] = ['upcoming', 'at_risk'];
/** Trips a stop can move from: published and not finished. */
const FROM: TripStatus[] = ['published', 'loading', 'ready', 'on_road'];
/** Trips a stop can move to: not left the depot yet, so the goods can still be loaded. */
const TO: TripStatus[] = ['published', 'loading', 'ready'];
const TEMP_SEQUENCE = 1000;

/** The domain's reason codes, in words a dispatcher reads (the raw messages name internal ids). */
const REASON_TEXT: Record<string, string> = {
  CHILLED_NEEDS_REEFER: 'Chilled goods need a refrigerated truck',
  VAN_ONLY: 'This store only takes a van',
  BRAND_MISMATCH: 'That trip carries another brand',
  DISTRICT_MISMATCH: 'That trip goes to another district',
  WRONG_DEPOT: 'That truck belongs to another depot',
  TIME_BUDGET: 'That trip would run over its time budget',
  OVER_WEIGHT: 'Over the truck’s weight limit',
  OVER_VOLUME: 'Over the truck’s volume limit',
  MISSING_TRAVEL_LEG: 'No travel time on file for this district',
  MISSING_SERVICE_ALLOWANCE: 'No service time on file for this store',
};
const reasonOf = (i: RuleIssue) => REASON_TEXT[i.code] ?? i.message;

const clockText = (min: number) =>
  `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, '0')}`;

/**
 * "Move a stop" on the live day: reassign one stop the driver has not reached to another of
 * today's trips that has not left the depot. Every rule comes from @waypoint/domain (evaluateDrop),
 * plus capacity as a block (a truck cannot take more than it holds).
 */
@Injectable()
export class MoveStopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly plan: PlanService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    private readonly hub: NoticeHub,
  ) {}

  private depotOf(me: Me): string {
    if (!me.depotId) throw new ForbiddenException('This account has no depot');
    return me.depotId;
  }

  private label(t: TripRow) {
    return `${t.vehicle.numberPlate ?? t.vehicleId} · Trip ${t.tripNumber}`;
  }

  /** Blocking reasons for adding this stop to that trip, or [] when it fits. */
  private blocks(target: TripRow, stop: TripRow['stops'][number], lookup: Lookup): RuleIssue[] {
    const vehicle = toVehicle(target.vehicle);
    const current = target.stops.map((s) => toStopView(s.order));
    const candidate = toStopView(stop.order);
    return [
      ...evaluateDrop({ vehicle, currentStops: current, candidate, lookup }),
      ...capacityIssues(vehicle, [...current, candidate], true),
    ].filter((i) => i.severity === 'block');
  }

  private async load(me: Me, tripId: string) {
    const depotId = this.depotOf(me);
    const from = await this.prisma.trip.findFirst({
      where: { id: tripId, depotId },
      include: tripInclude,
    });
    if (!from) throw new NotFoundException('Trip not found');
    if (!FROM.includes(from.status)) {
      throw new BadRequestException(
        `Stops cannot move off a ${from.status.replace('_', ' ')} trip`,
      );
    }
    const [targets, lookup] = await Promise.all([
      this.prisma.trip.findMany({
        where: {
          depotId,
          serviceDate: from.serviceDate,
          status: { in: TO },
          id: { not: from.id },
          vehicle: { status: { not: 'out_of_service' } },
        },
        include: tripInclude,
        orderBy: [{ vehicleId: 'asc' }, { tripNumber: 'asc' }],
      }),
      this.plan.loadLookup(),
    ]);
    return { from, targets, lookup };
  }

  /** GET /api/dispatch/trips/:id/move-options */
  async options(me: Me, tripId: string): Promise<MoveOptions> {
    const { from, targets, lookup } = await this.load(me, tripId);
    const stops = from.stops.filter((s) => MOVABLE.includes(s.status));
    return {
      tripId: from.id,
      stops: stops.map((s) => ({
        id: s.id,
        storeName: s.order.store.displayName ?? s.order.store.id,
        windowText: `${clockText(s.order.store.windowOpenMin)}-${clockText(s.order.store.windowCloseMin)}`,
      })),
      targets: targets.map((t) => ({
        tripId: t.id,
        label: `${this.label(t)} · ${t.status}`,
        fits: Object.fromEntries(
          stops.map((s) => {
            const b = this.blocks(t, s, lookup);
            return [s.id, { ok: b.length === 0, reason: b[0] ? reasonOf(b[0]) : null }];
          }),
        ),
      })),
    };
  }

  /** POST /api/dispatch/trips/:id/move-stop */
  async move(me: Me, tripId: string, stopId: string, toTripId: string): Promise<MoveStopResult> {
    const { from, targets, lookup } = await this.load(me, tripId);
    const stop = from.stops.find((s) => s.id === stopId);
    if (!stop) throw new NotFoundException('Stop not found on this trip');
    if (!MOVABLE.includes(stop.status)) {
      throw new BadRequestException('The driver has already reached this stop');
    }
    const target = targets.find((t) => t.id === toTripId);
    if (!target) throw new BadRequestException('That trip cannot take stops now');
    const blocked = this.blocks(target, stop, lookup);
    if (blocked.length > 0) throw new BadRequestException(reasonOf(blocked[0]));

    // The receiving trip keeps window order; ETAs from when it leaves (booklet time, or now).
    const views = sortStopsByWindow([...target.stops, stop].map((s) => toStopView(s.order)));
    const departAt = Math.max(this.clock.minutesNow(), DEPART_MIN[target.brand]);
    const etas = stopEtas(views, lookup, target.depotId as Depot, departAt);
    const etaOf = new Map((etas ?? []).map((e) => [e.orderId, e.arriveMin]));
    const idOf = new Map([...target.stops, stop].map((s) => [s.orderId, s.id] as [string, string]));

    const raised = await this.prisma.$transaction(async (tx) => {
      // Park every stop on a temporary sequence first so (tripId, sequence) never clashes.
      for (const [i, v] of views.entries()) {
        await tx.tripStop.update({
          where: { id: idOf.get(v.order.id)! },
          data: { tripId: target.id, sequence: TEMP_SEQUENCE + i },
        });
      }
      for (const [i, v] of views.entries()) {
        await tx.tripStop.update({
          where: { id: idOf.get(v.order.id)! },
          data: { sequence: i + 1, ...(etas ? { etaMin: etaOf.get(v.order.id) ?? null } : {}) },
        });
      }
      // Drivers see a stale plan and the dock gets its plan-change lock on both trips.
      await tx.trip.updateMany({
        where: { id: { in: [from.id, target.id] } },
        data: { planVersion: { increment: 1 } },
      });
      return tellDriversPlanChanged(tx, [from.id, target.id]);
    });
    this.hub.publishAll(raised);

    const storeName = stop.order.store.displayName ?? stop.order.store.id;
    const eta = etaOf.get(stop.orderId) ?? null;
    const users = await this.prisma.user.findMany({
      where: { storeId: stop.order.storeId, role: 'store' },
    });
    for (const u of users) {
      try {
        await this.notifier.notify({
          userId: u.id,
          title: 'Your delivery is on another truck',
          body: `Your order is now on ${this.label(target)}${eta !== null ? `, ETA ${clockText(eta)}` : ''}.`,
          link: '/store',
        });
      } catch {
        // best effort: the move is already saved
      }
    }
    return { stopId, storeName, toTripId: target.id, toLabel: this.label(target), etaMin: eta };
  }
}
