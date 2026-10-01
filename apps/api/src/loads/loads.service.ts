import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  DepartSummary,
  LoadFlagView,
  LoadQueueItem,
  LoadSheet,
  LoadStop,
} from '@waypoint/contracts';
import { DomainError, loadOrder } from '@waypoint/domain';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { FlagDto } from './dto/loads.dto';

const QUEUE_STATUSES = ['published', 'loading', 'ready'] as const;

const sheetInclude = {
  vehicle: true,
  district: true,
  loadSession: true,
  stops: {
    orderBy: { sequence: 'asc' },
    include: {
      order: { include: { store: true, lines: { orderBy: { name: 'asc' } } } },
      flags: { orderBy: { createdAt: 'asc' } },
    },
  },
} satisfies Prisma.TripInclude;

type SheetTrip = Prisma.TripGetPayload<{ include: typeof sheetInclude }>;

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

function flagView(f: SheetTrip['stops'][number]['flags'][number]): LoadFlagView {
  return {
    id: f.id,
    stopId: f.stopId,
    orderLineId: f.orderLineId,
    type: f.type,
    qty: f.qty,
    note: f.note,
  };
}

function vehicleView(v: SheetTrip['vehicle']) {
  return { id: v.id, plate: v.plate, type: v.type, temp: v.temp };
}

function storeName(stop: SheetTrip['stops'][number]) {
  return stop.order.store.displayName ?? stop.order.store.id;
}

@Injectable()
export class LoadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** Today's trips in the loader's depot that are waiting for, or in, loading. */
  async queue(me: AuthUser): Promise<LoadQueueItem[]> {
    const trips = await this.prisma.trip.findMany({
      where: {
        depotId: me.depotId ?? undefined,
        serviceDate: asDate(this.clock.today()),
        status: { in: [...QUEUE_STATUSES] },
      },
      include: {
        vehicle: true,
        district: true,
        loadSession: true,
        stops: { include: { order: { select: { _count: { select: { lines: true } } } } } },
      },
      orderBy: [{ tripNumber: 'asc' }, { vehicleId: 'asc' }],
    });
    const names = await this.loaderNames(trips.flatMap((t) => t.loadSession?.loaderIds ?? []));
    return trips.map((t) => ({
      tripId: t.id,
      vehicle: vehicleView(t.vehicle),
      brand: t.brand,
      district: t.district.name,
      tripNumber: t.tripNumber,
      status: t.status,
      stopCount: t.stops.length,
      lineCount: t.stops.reduce((s, st) => s + st.order._count.lines, 0),
      loaderNames: (t.loadSession?.loaderIds ?? []).map((id) => names.get(id) ?? 'Loader'),
      planVersion: t.planVersion,
    }));
  }

  async sheet(me: AuthUser, tripId: string): Promise<LoadSheet> {
    const trip = await this.findTrip(me, tripId);
    const names = await this.loaderNames(trip.loadSession?.loaderIds ?? []);
    const session = trip.loadSession;

    const stops: LoadStop[] = trip.stops.map((s) => ({
      stopId: s.id,
      sequence: s.sequence,
      storeName: storeName(s),
      status: s.status,
      chilled: s.order.temp === 'chilled',
      lines: s.order.lines.map((l) => ({
        id: l.id,
        name: l.name,
        qty: l.qty,
        pack: l.pack,
        chilled: l.chilled,
        unitWeightKg: l.unitWeightKg,
        unitVolumeM3: l.unitVolumeM3,
      })),
      flags: s.flags.map(flagView),
    }));

    return {
      tripId: trip.id,
      vehicle: vehicleView(trip.vehicle),
      brand: trip.brand,
      district: trip.district.name,
      tripNumber: trip.tripNumber,
      status: trip.status,
      planVersion: trip.planVersion,
      loadOrder: loadOrder(stops),
      session: session
        ? {
            startedAt: session.startedAt?.toISOString() ?? null,
            departedAt: session.departedAt?.toISOString() ?? null,
            loaderNames: session.loaderIds.map((id) => names.get(id) ?? 'Loader'),
          }
        : null,
      lock: await this.lockFor(trip),
    };
  }

  async start(me: AuthUser, tripId: string): Promise<LoadSheet> {
    const trip = await this.findTrip(me, tripId);
    const stopIds = trip.stops.map((s) => s.id);
    if (!trip.loadSession) {
      await this.prisma.loadSession.create({
        data: {
          tripId: trip.id,
          loaderIds: [me.id],
          startedAt: this.clock.now(),
          ackedPlanVersion: trip.planVersion,
          ackedStopIds: stopIds,
        },
      });
    } else if (!trip.loadSession.loaderIds.includes(me.id)) {
      await this.prisma.loadSession.update({
        where: { tripId: trip.id },
        data: { loaderIds: { push: me.id } },
      });
    }
    if (trip.status === 'published') {
      await this.prisma.trip.update({ where: { id: trip.id }, data: { status: 'loading' } });
    }
    return this.sheet(me, tripId);
  }

  async addFlag(me: AuthUser, tripId: string, dto: FlagDto): Promise<LoadSheet> {
    const trip = await this.findTrip(me, tripId);
    await this.assertUnlocked(trip);
    const stop = trip.stops.find((s) => s.id === dto.stopId);
    if (!stop) throw new NotFoundException('Stop is not on this trip');
    if (dto.orderLineId && !stop.order.lines.some((l) => l.id === dto.orderLineId)) {
      throw new NotFoundException('Line is not on this stop');
    }
    await this.prisma.loadFlag.create({
      data: {
        stopId: stop.id,
        orderLineId: dto.orderLineId ?? null,
        type: dto.type,
        qty: dto.qty ?? null,
        note: dto.note?.trim() || null,
      },
    });
    return this.sheet(me, tripId);
  }

  async removeFlag(me: AuthUser, tripId: string, flagId: string): Promise<LoadSheet> {
    const trip = await this.findTrip(me, tripId);
    await this.assertUnlocked(trip);
    const owned = trip.stops.some((s) => s.flags.some((f) => f.id === flagId));
    if (!owned) throw new NotFoundException('Flag not found');
    await this.prisma.loadFlag.delete({ where: { id: flagId } });
    return this.sheet(me, tripId);
  }

  /** The loader accepts the dispatcher's new plan; loading resumes on the new stop list. */
  async acknowledge(me: AuthUser, tripId: string): Promise<LoadSheet> {
    const trip = await this.findTrip(me, tripId);
    await this.prisma.loadSession.upsert({
      where: { tripId: trip.id },
      update: {
        ackedPlanVersion: trip.planVersion,
        ackedStopIds: trip.stops.map((s) => s.id),
        paused: false,
      },
      create: {
        tripId: trip.id,
        loaderIds: [me.id],
        startedAt: this.clock.now(),
        ackedPlanVersion: trip.planVersion,
        ackedStopIds: trip.stops.map((s) => s.id),
      },
    });
    return this.sheet(me, tripId);
  }

  async depart(me: AuthUser, tripId: string, planVersion: number): Promise<DepartSummary> {
    const trip = await this.findTrip(me, tripId);
    if (planVersion !== trip.planVersion) {
      throw new DomainError(
        'PLAN_VERSION_STALE',
        'The plan changed. Reload the checklist before departing.',
      );
    }
    await this.assertUnlocked(trip);
    if (!trip.loadSession?.startedAt) {
      throw new DomainError('PLAN_LOCKED', 'Start loading before confirming departure.');
    }
    const departedAt = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.loadSession.update({
        where: { tripId: trip.id },
        data: { finishedAt: departedAt, departedAt },
      }),
      this.prisma.trip.update({ where: { id: trip.id }, data: { status: 'on_road' } }),
    ]);

    const lineName = new Map(
      trip.stops.flatMap((s) => s.order.lines.map((l) => [l.id, l.name] as const)),
    );
    return {
      tripId: trip.id,
      departedAt: departedAt.toISOString(),
      stopCount: trip.stops.length,
      lineCount: trip.stops.reduce((s, st) => s + st.order.lines.length, 0),
      flags: trip.stops.flatMap((s) =>
        s.flags.map((f) => ({
          ...flagView(f),
          storeName: storeName(s),
          lineName: f.orderLineId ? (lineName.get(f.orderLineId) ?? null) : null,
        })),
      ),
    };
  }

  private async findTrip(me: AuthUser, tripId: string): Promise<SheetTrip> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: sheetInclude,
    });
    if (!trip || (me.depotId && trip.depotId !== me.depotId))
      throw new NotFoundException('Trip not found');
    return trip;
  }

  /** Locked when loading has started and the dispatcher has since published a newer plan version. */
  private async lockFor(trip: SheetTrip) {
    const session = trip.loadSession;
    const acked = session?.ackedPlanVersion ?? trip.planVersion;
    const locked = !!session?.startedAt && !session.departedAt && trip.planVersion > acked;
    const current = new Set(trip.stops.map((s) => s.id));
    const ackedIds = session?.ackedStopIds ?? [];
    const removedIds = locked ? ackedIds.filter((id) => !current.has(id)) : [];
    const removedStops = removedIds.length
      ? await this.prisma.tripStop.findMany({
          where: { id: { in: removedIds } },
          include: { order: { include: { store: true } } },
        })
      : [];
    const removedNames = new Map(
      removedStops.map((s) => [s.id, s.order.store.displayName ?? s.order.store.id]),
    );
    return {
      locked,
      planVersion: trip.planVersion,
      ackedPlanVersion: acked,
      // A removed stop may be deleted outright; then only its id is left to show.
      removed: removedIds.map((id) => ({
        stopId: id,
        storeName: removedNames.get(id) ?? 'Removed stop',
      })),
      added: locked ? trip.stops.filter((s) => !ackedIds.includes(s.id)).map((s) => s.id) : [],
    };
  }

  private async assertUnlocked(trip: SheetTrip) {
    if ((await this.lockFor(trip)).locked) {
      throw new DomainError(
        'PLAN_LOCKED',
        'The plan changed. Acknowledge the new plan to continue.',
      );
    }
  }

  private async loaderNames(ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } } });
    return new Map(users.map((u) => [u.id, u.name]));
  }
}
