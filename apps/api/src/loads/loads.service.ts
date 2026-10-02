import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  DepartSummary,
  LoadFlagView,
  LoadJob,
  LoadQueueItem,
  LoadSheet,
  LoadStop,
  OrderLine,
  PlanLock,
  PlanLockSlot,
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
  loadingJob: true,
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

function lineView(l: SheetTrip['stops'][number]['order']['lines'][number]): OrderLine {
  return {
    id: l.id,
    name: l.name,
    qty: l.qty,
    pack: l.pack,
    chilled: l.chilled,
    unitWeightKg: l.unitWeightKg,
    unitVolumeM3: l.unitVolumeM3,
  };
}

function vehicleView(v: SheetTrip['vehicle']) {
  return { id: v.id, plate: v.plate, type: v.type, temp: v.temp };
}

function jobView(j: SheetTrip['loadingJob']): LoadJob | null {
  if (!j) return null;
  return {
    bay: j.bay,
    loadByTime: j.loadByTime?.toISOString() ?? null,
    instructions: j.instructions,
    priority: j.priority,
    status: j.status,
  };
}

/** Delivery-note id for an order. Each change adds a version; the current one has validTo = null. */
const dnId = (orderId: string) => `DN-${orderId}`;
const REMOVED = 'removed';
/** DEMO_NOW freezes the clock, so a new version must still land strictly after the current one. */
const after = (current: Date, at: Date) => (current >= at ? new Date(current.getTime() + 1) : at);

/** Quantity actually loaded for a line, after the loader's missing and wrong-quantity flags. */
function confirmedQty(
  line: { id: string; qty: number },
  flags: { orderLineId: string | null; type: string; qty: number | null }[],
) {
  let qty = line.qty;
  for (const f of flags) {
    if (f.orderLineId !== line.id) continue;
    if (f.type === 'missing') qty -= f.qty ?? line.qty;
    if (f.type === 'wrong_quantity' && f.qty != null) qty = Math.min(qty, f.qty);
  }
  return Math.max(0, qty);
}

/** What the loader accepted: the orders on the trip right now. */
const ackedOrders = (trip: SheetTrip) => trip.stops.map((s) => s.orderId);

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
        loadingJob: true,
        stops: { include: { order: { select: { _count: { select: { lines: true } } } } } },
      },
      orderBy: [{ tripNumber: 'asc' }, { vehicleId: 'asc' }],
    });
    // Jobs the dispatcher marked urgent come first; the rest keep trip order.
    trips.sort((a, b) => (b.loadingJob?.priority ?? 0) - (a.loadingJob?.priority ?? 0));
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
      job: jobView(t.loadingJob),
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
      lines: s.order.lines.map(lineView),
      flags: s.flags.map(flagView),
      isNew: session?.newOrderIds.includes(s.orderId) ?? false,
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
      job: jobView(trip.loadingJob),
    };
  }

  async start(me: AuthUser, tripId: string): Promise<LoadSheet> {
    const trip = await this.findTrip(me, tripId);
    if (!trip.loadSession) {
      await this.prisma.loadSession.create({
        data: {
          tripId: trip.id,
          loaderIds: [me.id],
          startedAt: this.clock.now(),
          ackedPlanVersion: trip.planVersion,
          ackedStopIds: ackedOrders(trip),
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
    if (trip.loadingJob?.status === 'assigned') {
      await this.prisma.loadingJob.update({
        where: { tripId: trip.id },
        data: { status: 'picking', startedAt: this.clock.now() },
      });
    }
    await this.openDeliveryNotes(me, trip);
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

  /** The loader confirms a removed order's goods are off the truck. Repeating it changes nothing. */
  async takenOff(me: AuthUser, tripId: string, orderId: string): Promise<LoadSheet> {
    const trip = await this.findTrip(me, tripId);
    const lock = await this.lockFor(trip);
    if (!lock.locked) {
      throw new DomainError('PLAN_NOT_CHANGED', 'There is no plan change to take goods off for.');
    }
    if (!lock.removed.some((r) => r.orderId === orderId)) {
      throw new DomainError('ORDER_NOT_REMOVED', 'That order was not taken off this trip.');
    }
    const done = trip.loadSession!.takenOffOrderIds;
    if (!done.includes(orderId)) {
      await this.prisma.loadSession.update({
        where: { tripId: trip.id },
        data: { takenOffOrderIds: [...done, orderId] },
      });
    }
    return this.sheet(me, tripId);
  }

  /** The loader accepts the dispatcher's new plan; loading resumes on the new stop list. */
  async acknowledge(me: AuthUser, tripId: string): Promise<LoadSheet> {
    const trip = await this.findTrip(me, tripId);
    const lock = await this.lockFor(trip);
    if (lock.locked && lock.removed.some((r) => !r.takenOff)) {
      throw new DomainError(
        'REMOVED_GOODS_NOT_TAKEN_OFF',
        'Take the removed goods off the truck before accepting the new plan.',
      );
    }
    // Stops the change added are marked NEW until the truck departs.
    const added = new Set(lock.added);
    const newOrderIds = trip.stops.filter((s) => added.has(s.id)).map((s) => s.orderId);
    if (lock.locked) {
      // The delivery notes follow the accepted plan: removed orders leave the truck, added ones start picking.
      await this.removedDeliveryNotes(
        me,
        lock.removed.map((r) => r.orderId),
        trip.planVersion,
      );
      await this.openDeliveryNotes(me, trip);
    }
    await this.prisma.loadSession.upsert({
      where: { tripId: trip.id },
      update: {
        ackedPlanVersion: trip.planVersion,
        ackedStopIds: ackedOrders(trip),
        paused: false,
        takenOffOrderIds: [],
        ...(lock.locked ? { newOrderIds } : {}),
      },
      create: {
        tripId: trip.id,
        loaderIds: [me.id],
        startedAt: this.clock.now(),
        ackedPlanVersion: trip.planVersion,
        ackedStopIds: ackedOrders(trip),
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
    const lines = trip.stops.flatMap((s) => s.order.lines);
    const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
    await this.prisma.$transaction([
      this.prisma.loadSession.update({
        where: { tripId: trip.id },
        data: { finishedAt: departedAt, departedAt, newOrderIds: [] },
      }),
      this.prisma.trip.update({
        where: { id: trip.id },
        data: { status: 'on_road', startingTime: departedAt },
      }),
      ...(trip.loadingJob
        ? [
            this.prisma.loadingJob.update({
              where: { tripId: trip.id },
              data: {
                status: 'handed_over',
                loadedAt: departedAt,
                handedOverAt: departedAt,
                totalWeightKg: round(
                  lines.reduce((s, l) => s + l.qty * l.unitWeightKg, 0),
                  2,
                ),
                totalVolumeM3: round(
                  lines.reduce((s, l) => s + l.qty * l.unitVolumeM3, 0),
                  3,
                ),
              },
            }),
          ]
        : []),
      ...(await this.loadedDeliveryNotes(me, trip, departedAt)),
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
          reviewStatus: 'pending_dispatcher' as const,
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
  private async lockFor(trip: SheetTrip): Promise<PlanLock> {
    const session = trip.loadSession;
    const acked = session?.ackedPlanVersion ?? trip.planVersion;
    const locked = !!session?.startedAt && !session.departedAt && trip.planVersion > acked;
    if (!locked) {
      return {
        locked,
        planVersion: trip.planVersion,
        ackedPlanVersion: acked,
        removed: [],
        added: [],
        before: [],
        after: [],
      };
    }
    // Orders, not stop rows, are compared: a stop taken off the trip is deleted, its order stays.
    const ackedIds = session.ackedStopIds;
    const current = new Set(trip.stops.map((s) => s.orderId));
    const removedIds = ackedIds.filter((id) => !current.has(id));
    const removedOrders = removedIds.length
      ? await this.prisma.order.findMany({
          where: { id: { in: removedIds } },
          include: { store: true, lines: { orderBy: { name: 'asc' } } },
        })
      : [];
    const byId = new Map(removedOrders.map((o) => [o.id, o]));
    const names = new Map([
      ...removedOrders.map((o) => [o.id, o.store.displayName ?? o.store.id] as const),
      ...trip.stops.map((s) => [s.orderId, storeName(s)] as const),
    ]);
    const nameOf = (id: string) => names.get(id) ?? 'Removed stop';
    // ackedStopIds were saved in delivery sequence (sheetInclude sorts stops), so reversing gives load order.
    const before: PlanLockSlot[] = loadOrder(ackedIds).map((id) => ({
      orderId: id,
      storeName: nameOf(id),
      change: current.has(id) ? 'kept' : 'removed',
    }));
    const after: PlanLockSlot[] = loadOrder(trip.stops).map((s) => ({
      orderId: s.orderId,
      storeName: storeName(s),
      change: ackedIds.includes(s.orderId) ? 'kept' : 'added',
    }));
    return {
      locked,
      planVersion: trip.planVersion,
      ackedPlanVersion: acked,
      removed: removedIds.map((id) => ({
        orderId: id,
        storeName: nameOf(id),
        lines: byId.get(id)?.lines.map(lineView) ?? [],
        takenOff: session.takenOffOrderIds.includes(id),
      })),
      added: trip.stops.filter((s) => !ackedIds.includes(s.orderId)).map((s) => s.id),
      before,
      after,
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

  private async loaderProfile(me: AuthUser) {
    return this.prisma.loader.findUnique({ where: { userId: me.id } });
  }

  /** On start, each order gets a delivery note in 'picking' with this loader on it. */
  private async openDeliveryNotes(me: AuthUser, trip: SheetTrip) {
    const loader = await this.loaderProfile(me);
    const now = this.clock.now();
    for (const stop of trip.stops) {
      const order = stop.order;
      let note = await this.prisma.deliveryNote.findFirst({
        where: { orderId: order.id, validTo: null },
        orderBy: { versionAt: 'desc' },
      });
      // An order that was taken off another truck starts a fresh picking version.
      if (!note || note.status === REMOVED) {
        const versionAt = note ? after(note.versionAt, now) : now;
        if (note) {
          await this.prisma.deliveryNote.update({
            where: { dnId_versionAt: { dnId: note.dnId, versionAt: note.versionAt } },
            data: { validTo: versionAt },
          });
        }
        note = await this.prisma.deliveryNote.create({
          data: {
            dnId: note?.dnId ?? dnId(order.id),
            versionAt,
            orderId: order.id,
            status: 'picking',
            changedById: loader?.id ?? null,
            changeReason: 'loading started',
            lines: {
              create: order.lines.flatMap((l) =>
                l.itemId ? [{ itemId: l.itemId, qtyConfirmed: null }] : [],
              ),
            },
          },
        });
      }
      if (loader) {
        await this.prisma.deliveryNoteLoader.upsert({
          where: {
            dnId_versionAt_loaderId: {
              dnId: note.dnId,
              versionAt: note.versionAt,
              loaderId: loader.id,
            },
          },
          update: {},
          create: {
            dnId: note.dnId,
            versionAt: note.versionAt,
            loaderId: loader.id,
            role: 'picking',
            startedAt: now,
          },
        });
      }
    }
  }

  /** Orders the dispatcher took off the trip mid-load: their open delivery note gets a 'removed' version. */
  private async removedDeliveryNotes(me: AuthUser, orderIds: string[], planVersion: number) {
    if (orderIds.length === 0) return;
    const loader = await this.loaderProfile(me);
    const now = this.clock.now();
    for (const orderId of orderIds) {
      const current = await this.prisma.deliveryNote.findFirst({
        where: { orderId, validTo: null },
        orderBy: { versionAt: 'desc' },
      });
      if (!current || current.status === REMOVED) continue;
      const versionAt = after(current.versionAt, now);
      await this.prisma.$transaction([
        this.prisma.deliveryNote.update({
          where: { dnId_versionAt: { dnId: current.dnId, versionAt: current.versionAt } },
          data: { validTo: versionAt },
        }),
        this.prisma.deliveryNote.create({
          data: {
            dnId: current.dnId,
            versionAt,
            orderId,
            status: REMOVED,
            changedById: loader?.id ?? null,
            changeReason: `taken off the trip by dispatch (plan v${planVersion})`,
          },
        }),
      ]);
    }
  }

  /**
   * At departure each order's delivery note gets a 'loaded' version with the quantities actually
   * loaded, and every dock flag becomes a LoaderFlag for the dispatcher to review.
   */
  private async loadedDeliveryNotes(me: AuthUser, trip: SheetTrip, at: Date) {
    const loader = await this.loaderProfile(me);
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const stop of trip.stops) {
      const order = stop.order;
      const current = await this.prisma.deliveryNote.findFirst({
        where: { orderId: order.id, validTo: null },
        orderBy: { versionAt: 'desc' },
      });
      const versionAt = current ? after(current.versionAt, at) : at;
      if (current) {
        ops.push(
          this.prisma.deliveryNote.update({
            where: { dnId_versionAt: { dnId: current.dnId, versionAt: current.versionAt } },
            data: { validTo: versionAt },
          }),
        );
      }
      const lineItem = new Map(order.lines.map((l) => [l.id, l.itemId]));
      ops.push(
        this.prisma.deliveryNote.create({
          data: {
            dnId: current?.dnId ?? dnId(order.id),
            versionAt,
            orderId: order.id,
            status: 'loaded',
            changedById: loader?.id ?? null,
            changeReason: stop.flags.length ? 'departure with dock flags' : 'departure',
            lines: {
              create: order.lines.flatMap((l) => {
                if (!l.itemId) return [];
                const lineFlags = stop.flags.filter((f) => f.orderLineId === l.id);
                return [
                  {
                    itemId: l.itemId,
                    qtyConfirmed: confirmedQty(l, lineFlags),
                    shortageReason: lineFlags.length
                      ? lineFlags.map((f) => f.note ?? f.type).join('; ')
                      : null,
                  },
                ];
              }),
            },
            // LoaderFlag needs a Loader profile; without one the dock flags stay on LoadFlag only.
            ...(loader
              ? {
                  loaders: {
                    create: { loaderId: loader.id, role: 'confirming' as const, finishedAt: at },
                  },
                  loaderFlags: {
                    create: stop.flags.map((f) => {
                      const itemId = f.orderLineId ? (lineItem.get(f.orderLineId) ?? null) : null;
                      return {
                        loaderId: loader.id,
                        raisedAt: f.createdAt,
                        scope: itemId ? ('item' as const) : ('dn' as const),
                        itemId,
                        qtyFlagged: f.qty,
                        reason: f.type,
                        reasonDetail: f.note,
                      };
                    }),
                  },
                }
              : {}),
          },
        }),
      );
    }
    return ops;
  }

  private async loaderNames(ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } } });
    return new Map(users.map((u) => [u.id, u.name]));
  }
}
