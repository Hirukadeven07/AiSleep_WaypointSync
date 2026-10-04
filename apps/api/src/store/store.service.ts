import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Order, Prisma } from '@prisma/client';
import {
  ORDER_CUTOFF_MIN,
  type CatalogueItem,
  type StoreDelivery,
  type StoreFlag,
  type StoreHome,
  type StoreNotice,
  type StopStatus,
  type StoreOrderDetail,
  type StoreOrderView,
} from '@waypoint/contracts';
import { DomainError } from '@waypoint/domain';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ClockService } from '../common/clock/clock.service';
import { nextOperatingDay } from '../common/clock/operating-day';
import { PrismaService } from '../common/prisma/prisma.service';
import { NOTIFIER, type Notifier } from '../notifications/notifier.interface';
import { anyCatalogueItem, buildOrderLines, fullCatalogue } from './catalogue';
import type { PlaceOrderDto, ReceiptDto } from './dto/store.dto';
import { PhotosService } from '../photos/photos.service';

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const deliveryInclude = {
  order: {
    include: {
      lines: { orderBy: { name: 'asc' } },
      fieldFlags: { include: { item: true }, orderBy: { raisedAt: 'asc' } },
    },
  },
  trip: {
    include: {
      assignedDriver: true,
      vehicle: { include: { driver: true } },
      stops: { select: { id: true, sequence: true, status: true }, orderBy: { sequence: 'asc' } },
    },
  },
  receipt: true,
} satisfies Prisma.TripStopInclude;

type DeliveryStop = Prisma.TripStopGetPayload<{ include: typeof deliveryInclude }>;

/** Stop states where the truck has finished with that stop (or will not call there). */
const DONE: readonly StopStatus[] = ['delivered', 'partial', 'deferred', 'confirmed'];
const COUNTING: readonly StopStatus[] = ['upcoming', 'at_risk'];

/** Stops the truck still has to serve before this one; null unless the truck is out and this stop is still ahead. */
function stopsAway(s: DeliveryStop): number | null {
  if (s.trip.status !== 'on_road' || !COUNTING.includes(s.status)) return null;
  return s.trip.stops.filter((o) => o.sequence < s.sequence && !DONE.includes(o.status)).length;
}

function orderView(o: Order): StoreOrderView {
  return {
    id: o.id,
    deliveryDate: isoDay(o.deliveryDate),
    status: o.status,
    units: o.units,
    weightKg: o.weightKg,
    volumeM3: o.volumeM3,
    chilled: o.temp === 'chilled',
    deferReason: o.deferReason,
    movedFromDate: o.movedFromDate ? isoDay(o.movedFromDate) : null,
    repeatSkip: o.repeatSkip,
    urgent: o.urgent,
    stockLevel: o.stockLevel,
    urgentNote: o.urgentNote,
  };
}

function deliveryView(s: DeliveryStop): StoreDelivery {
  return {
    stopId: s.id,
    orderId: s.orderId,
    serviceDate: isoDay(s.trip.serviceDate),
    status: s.status,
    etaMin: s.etaMin,
    plate: s.trip.vehicle.numberPlate ?? s.trip.vehicle.id,
    driverName: (s.trip.assignedDriver ?? s.trip.vehicle.driver)?.name ?? null,
    chilled: s.order.temp === 'chilled',
    arrivedAt: s.arrivedAt?.toISOString() ?? null,
    storeConfirmedAt: s.storeConfirmedAt?.toISOString() ?? null,
    driverAckAt: s.driverAckAt?.toISOString() ?? null,
    signaturePhotoKey: s.receipt?.signaturePhotoKey ?? null,
    signedAt: s.receipt?.signedAt?.toISOString() ?? null,
    stopsAway: stopsAway(s),
    // Other stores on the trip stay anonymous: only their place in the run and their status.
    track: s.trip.stops.map((o) => ({
      sequence: o.sequence,
      status: o.status,
      isYou: o.id === s.id,
    })),
    lines: s.order.lines.map((l) => ({
      id: l.id,
      name: l.name,
      qty: l.qty,
      pack: l.pack,
      chilled: l.chilled,
      unitWeightKg: l.unitWeightKg,
      unitVolumeM3: l.unitVolumeM3,
    })),
    // Only this trip's flags; an order moved off a broken-down truck keeps its old ones apart.
    issues: s.order.fieldFlags
      .filter((f) => f.tripId === s.tripId)
      .map((f) => ({
        id: f.id,
        itemName: f.item?.itemName ?? 'Whole delivery',
        qty: f.qtyFlagged,
        reason: f.reason,
        driverDecision: f.driverDecision,
        resolveStatus: f.resolveStatus,
      })),
  };
}

/** "Sat 3 Oct" for a service date. */
const dayText = (d: Date) =>
  d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    private readonly photos: PhotosService,
  ) {}

  async home(me: AuthUser): Promise<StoreHome> {
    const store = await this.store(me);
    const today = this.clock.today();
    const [deliveries, upcoming, deferral, unreadNotices, openFlagCount] = await Promise.all([
      this.deliveries(me),
      this.prisma.order.findFirst({
        where: {
          storeId: store.id,
          deliveryDate: { gt: asDate(today) },
          status: { in: ['waiting', 'planned'] },
        },
        orderBy: { deliveryDate: 'asc' },
      }),
      this.prisma.order.findFirst({
        where: { storeId: store.id, status: 'deferred', deliveryDate: { gte: asDate(today) } },
        orderBy: { deliveryDate: 'asc' },
      }),
      this.prisma.notification.count({ where: { userId: me.id, read: false } }),
      this.prisma.fieldFlag.count({ where: { storeId: store.id, resolveStatus: false } }),
    ]);
    return {
      storeId: store.id,
      storeName: store.displayName ?? store.id,
      brand: store.brand,
      windowOpenMin: store.windowOpenMin,
      windowCloseMin: store.windowCloseMin,
      cutoffMin: this.orderCutoffMin(),
      nowMin: this.clock.minutesNow(),
      today,
      // The open delivery first; otherwise the last one of the day.
      delivery: deliveries.find((d) => !d.driverAckAt) ?? deliveries.at(-1) ?? null,
      nextOrder: upcoming ? orderView(upcoming) : null,
      deferral: deferral ? orderView(deferral) : null,
      unreadNotices,
      openFlagCount,
      phones: store.phones.map((p) => ({ label: p.label, phoneNo: p.phoneNo })),
    };
  }

  /** Every brand's items, the store's own brand first. One order still holds a single group. */
  async catalogue(me: AuthUser): Promise<CatalogueItem[]> {
    const store = await this.store(me);
    return fullCatalogue(store.brand);
  }

  async orders(me: AuthUser): Promise<StoreOrderView[]> {
    const store = await this.store(me);
    const orders = await this.prisma.order.findMany({
      where: { storeId: store.id, deliveryDate: { gte: asDate(this.clock.today()) } },
      orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'asc' }],
    });
    return orders.map(orderView);
  }

  /**
   * The store's orders with their lines, newest first: every order still to come (what is
   * already placed, and what can be cancelled) and the latest five of any day ("order again").
   */
  async recentOrders(me: AuthUser): Promise<StoreOrderDetail[]> {
    const store = await this.store(me);
    const include = { lines: { orderBy: { name: 'asc' } } } satisfies Prisma.OrderInclude;
    const [latest, coming] = await Promise.all([
      this.prisma.order.findMany({
        where: { storeId: store.id },
        include,
        orderBy: [{ createdAt: 'desc' }, { deliveryDate: 'desc' }],
        take: 5,
      }),
      this.prisma.order.findMany({
        where: {
          storeId: store.id,
          deliveryDate: { gt: asDate(this.clock.today()) },
          status: { in: ['waiting', 'planned'] },
        },
        include,
      }),
    ]);
    const orders = [...new Map([...latest, ...coming].map((o) => [o.id, o])).values()].sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.deliveryDate.getTime() - a.deliveryDate.getTime(),
    );
    return orders.map((o) => ({
      ...orderView(o),
      lines: o.lines.map((l) => ({
        catalogueId: l.itemId,
        name: l.name,
        qty: l.qty,
        pack: l.pack,
      })),
    }));
  }

  /** Catalogue ids this store has starred, oldest first. */
  async saved(me: AuthUser): Promise<string[]> {
    const store = await this.store(me);
    return this.savedIds(store.id);
  }

  async saveItem(me: AuthUser, itemId: string): Promise<string[]> {
    const store = await this.store(me);
    if (!anyCatalogueItem(itemId)) {
      throw new NotFoundException('That item is not in the catalogue');
    }
    await this.prisma.storeSavedItem.upsert({
      where: { storeId_itemId: { storeId: store.id, itemId } },
      update: {},
      create: { storeId: store.id, itemId },
    });
    return this.savedIds(store.id);
  }

  async unsaveItem(me: AuthUser, itemId: string): Promise<string[]> {
    const store = await this.store(me);
    await this.prisma.storeSavedItem.deleteMany({ where: { storeId: store.id, itemId } });
    return this.savedIds(store.id);
  }

  private async savedIds(storeId: string): Promise<string[]> {
    const rows = await this.prisma.storeSavedItem.findMany({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
      select: { itemId: true },
    });
    return rows.map((r) => r.itemId);
  }

  /**
   * Orders close at ORDER_CUTOFF_MIN (16:00) everywhere, so the store app and the plan board agree.
   * For working on the store screens after 16:00, set ORDER_CUTOFF_OPEN=1 to keep ordering open
   * until 23:59; never set it for a demo.
   */
  private orderCutoffMin(): number {
    return process.env.ORDER_CUTOFF_OPEN === '1' ? 23 * 60 + 59 : ORDER_CUTOFF_MIN;
  }

  /** Orders are for the next operating day and close at 16:00 Asia/Colombo. */
  async placeOrder(me: AuthUser, dto: PlaceOrderDto): Promise<StoreOrderView> {
    const store = await this.store(me);
    if (this.clock.minutesNow() >= this.orderCutoffMin()) {
      throw new DomainError(
        'AFTER_CUTOFF',
        'Orders for tomorrow close at 16:00. Order again tomorrow morning.',
      );
    }
    let built: ReturnType<typeof buildOrderLines>;
    try {
      built = buildOrderLines(dto.lines);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    // Stock level and note only mean something on an urgent order.
    const urgent = dto.urgent === true;
    const deliveryDate = asDate(await nextOperatingDay(this.prisma, asDate(this.clock.today())));
    const order = await this.prisma.order.create({
      data: {
        storeId: store.id,
        brand: store.brand,
        deliveryDate,
        temp: built.chilled ? 'chilled' : 'ambient',
        status: 'waiting',
        units: built.units,
        weightKg: built.weightKg,
        volumeM3: built.volumeM3,
        urgent,
        stockLevel: urgent ? (dto.stockLevel ?? null) : null,
        urgentNote: urgent ? dto.urgentNote || null : null,
        lines: { create: built.lines },
      },
    });
    await this.closeFlagsForSentItems(store.id, built.lines.map((l) => l.itemId));
    await this.notifyDispatchers(store.depotId, {
      title: 'New order',
      body: `${store.displayName ?? store.id} ordered ${built.units} ${built.units === 1 ? 'item' : 'items'} (${Math.round(built.weightKg)} kg) for ${dayText(deliveryDate)}.`,
      link: '/dispatch/plan',
    });
    return orderView(order);
  }

  /**
   * The store takes back an order that is still in the waiting queue: its own, waiting, on no
   * trip, and with no dock or delivery paperwork from an earlier trip. The order and its lines
   * are deleted. Anything further along is the dispatcher's to change.
   */
  async cancelOrder(me: AuthUser, orderId: string): Promise<{ ok: true }> {
    const store = await this.store(me);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: store.id },
    });
    if (!order) throw new NotFoundException('Order not found');
    const tooLate = () =>
      new ConflictException(
        'This order is already being planned or delivered. Ask dispatch to change it.',
      );
    if (order.status !== 'waiting') throw tooLate();
    // One statement, so an order the dispatcher has just put on a trip is not deleted.
    let deleted = 0;
    try {
      const result = await this.prisma.order.deleteMany({
        where: {
          id: order.id,
          storeId: store.id,
          status: 'waiting',
          stop: null,
          deliveryNotes: { none: {} },
          fieldFlags: { none: {} },
          lines: { every: { flags: { none: {} } } },
        },
      });
      deleted = result.count;
    } catch (e) {
      // P2003: a trip stop or delivery note was attached while this ran.
      if ((e as { code?: string }).code !== 'P2003') throw e;
    }
    if (deleted === 0) throw tooLate();
    await this.notifyDispatchers(store.depotId, {
      title: 'Order cancelled',
      body: `${store.displayName ?? store.id} cancelled its order of ${order.units} ${order.units === 1 ? 'item' : 'items'} (${Math.round(order.weightKg)} kg) for ${dayText(order.deliveryDate)}.`,
      link: '/dispatch/plan',
    });
    return { ok: true };
  }

  /**
   * An open FieldFlag stays resolveStatus false until this shop orders that item again,
   * or the flag is marked solved (resolvedAt).
   */
  private async closeFlagsForSentItems(storeId: string, itemIds: string[]) {
    const ids = [...new Set(itemIds.filter(Boolean))];
    if (ids.length === 0) return;
    const now = new Date();
    await this.prisma.fieldFlag.updateMany({
      where: { storeId, resolveStatus: false, itemId: { in: ids } },
      data: { resolveStatus: true, resolvedAt: now },
    });
  }

  /** Every item this store has flagged, newest first. */
  async flags(me: AuthUser): Promise<StoreFlag[]> {
    const store = await this.store(me);
    const rows = await this.prisma.fieldFlag.findMany({
      where: { storeId: store.id },
      include: { item: true },
      orderBy: { raisedAt: 'desc' },
    });
    return rows.map((f) => ({
      id: f.id,
      itemName: f.item?.itemName ?? 'Whole delivery',
      qty: f.qtyFlagged,
      reason: f.reason,
      driverDecision: f.driverDecision,
      resolveStatus: f.resolveStatus,
      raisedAt: f.raisedAt.toISOString(),
    }));
  }

  /** Today's stops for this store, in ETA order. */
  async deliveries(me: AuthUser): Promise<StoreDelivery[]> {
    const store = await this.store(me);
    const stops = await this.prisma.tripStop.findMany({
      where: {
        order: { storeId: store.id },
        trip: { serviceDate: asDate(this.clock.today()), status: { not: 'planning' } },
      },
      include: deliveryInclude,
      orderBy: [{ etaMin: 'asc' }, { sequence: 'asc' }],
    });
    return stops.map(deliveryView);
  }

  async delivery(me: AuthUser, stopId: string): Promise<StoreDelivery> {
    return deliveryView(await this.ownStop(me, stopId));
  }

  /** The store checks the goods. The stop is confirmed; the driver acknowledges afterwards. */
  async receipt(me: AuthUser, stopId: string, dto: ReceiptDto): Promise<StoreDelivery> {
    const stop = await this.ownStop(me, stopId);
    if (stop.status !== 'arrived' && stop.status !== 'waiting') {
      throw new DomainError(
        'RECEIPT_NOT_READY',
        'The goods can be checked once the driver has arrived.',
      );
    }
    const lineIds = new Set(stop.order.lines.map((l) => l.id));
    if (dto.lines.some((l) => !lineIds.has(l.orderLineId))) {
      throw new BadRequestException('A line does not belong to this delivery');
    }
    if (!dto.signaturePng) {
      throw new BadRequestException('A storekeeper signature is required');
    }
    let signatureBytes: Buffer;
    try {
      signatureBytes = this.photos.decodePngBase64(dto.signaturePng);
    } catch {
      throw new BadRequestException('A storekeeper signature is required');
    }
    const signaturePhotoKey = await this.photos.put(
      `receipts/${stop.id}/signature.png`,
      signatureBytes,
    );
    const results = stop.order.lines.map((line) => {
      const r = dto.lines.find((l) => l.orderLineId === line.id);
      const receivedQty = Math.min(r?.receivedQty ?? line.qty, line.qty);
      const issue = r?.issue ?? (receivedQty < line.qty ? 'missing' : undefined);
      return {
        itemId: line.itemId,
        chilled: line.chilled,
        orderLineId: line.id,
        name: line.name,
        orderedQty: line.qty,
        receivedQty,
        issue: issue ?? null,
      };
    });
    const partial = results.some((r) => r.issue);
    const now = this.clock.now();
    const lineResults = results.map(({ itemId: _i, chilled: _c, ...r }) => r);
    const warm = dto.chilledWasCold === false;

    await this.prisma.$transaction(async (tx) => {
      // Claim the stop first: of two quick taps on "Confirm receipt", only one gets past here.
      const claimed = await tx.tripStop.updateMany({
        where: { id: stop.id, status: { in: ['arrived', 'waiting'] } },
        data: { status: 'confirmed', storeConfirmedAt: now },
      });
      if (claimed.count === 0) {
        throw new DomainError('RECEIPT_NOT_READY', 'These goods have already been checked.');
      }
      await tx.storeReceipt.create({
        data: {
          stopId: stop.id,
          lineResults,
          chilledWasCold: dto.chilledWasCold ?? null,
          signaturePhotoKey,
          signedByUserId: me.id,
          signedAt: now,
        },
      });
      // Each problem line becomes a FieldFlag the driver accepts or disputes at acknowledgement.
      await tx.fieldFlag.createMany({
        data: results
          .filter((r) => r.issue)
          .map((r) => ({
            raisedAt: now,
            storeId: stop.order.storeId,
            orderId: stop.orderId,
            tripId: stop.tripId,
            itemId: r.itemId,
            // The short count is the problem; a damaged line with nothing short counts as all damaged.
            qtyFlagged: r.receivedQty < r.orderedQty ? r.orderedQty - r.receivedQty : r.orderedQty,
            reason: r.issue!,
            reasonDetail: `${r.name}: ${r.receivedQty} of ${r.orderedQty} received`,
            severity: r.chilled && warm ? ('high' as const) : ('medium' as const),
            resolveStatus: false,
          })),
      });
      await tx.order.update({
        where: { id: stop.orderId },
        data: { status: partial ? 'partial' : 'delivered' },
      });
    });

    // A receipt with problems is the store's report to dispatch.
    const problems = results.filter((r) => r.issue);
    if (problems.length > 0) {
      const store = await this.store(me);
      await this.notifyDispatchers(store.depotId, {
        title: 'Store report',
        body: `${store.displayName ?? store.id}: ${problems.length} ${problems.length === 1 ? 'line' : 'lines'} with issues on ${stop.trip.vehicle.numberPlate ?? stop.trip.vehicleId} (${problems
          .slice(0, 2)
          .map((r) => `${r.name} ${r.issue}`)
          .join(', ')}${problems.length > 2 ? ', …' : ''}).`,
        link: '/dispatch/board',
      });
    }

    // The trip's own driver; the vehicle's usual driver when the dispatcher assigned nobody.
    const driverId = stop.trip.assignedDriverId ?? stop.trip.vehicle.driverId;
    if (driverId) {
      const store = await this.store(me);
      const issues = results.filter((r) => r.issue).length;
      await this.notifier.notify({
        userId: driverId,
        title: `${store.displayName ?? store.id} checked the goods`,
        body: issues
          ? `${issues} line(s) with issues. Acknowledge to close the stop.`
          : 'All lines received. Acknowledge to close the stop.',
        link: '/drive',
      });
    }
    return this.delivery(me, stopId);
  }

  /**
   * Tells the store's managers that an order moved to a later day. Call it after the order is saved
   * as deferred (dispatcher deferral or breakdown recovery); the notice reads the saved reason and date.
   */
  async notifyDeferral(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { store: { include: { users: { where: { role: 'store' } } } } },
    });
    if (!order || order.status !== 'deferred') return;
    const when = order.deliveryDate.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    const reason = order.deferReason?.trim();
    const repeat = order.repeatSkip ? ' This store was also moved on the last run.' : '';
    for (const user of order.store.users) {
      await this.notifier.notify({
        userId: user.id,
        title: `Delivery moved to ${when}`,
        body: `${reason ? `Reason: ${reason}.` : 'The dispatcher moved this delivery.'}${repeat}`,
        link: '/store',
      });
    }
  }

  /** One notice per dispatcher at the store's depot (the bell on their live day). */
  private async notifyDispatchers(
    depotId: string,
    notice: { title: string; body: string; link: string },
  ): Promise<void> {
    const dispatchers = await this.prisma.user.findMany({
      where: { role: 'dispatcher', depotId },
      select: { id: true },
    });
    for (const d of dispatchers) await this.notifier.notify({ userId: d.id, ...notice });
  }

  async notices(me: AuthUser): Promise<StoreNotice[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markRead(me: AuthUser, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: me.id },
      data: { read: true },
    });
    return { ok: true };
  }

  private async store(me: AuthUser) {
    if (!me.storeId) throw new ForbiddenException('This account is not linked to a store');
    const store = await this.prisma.store.findUnique({
      where: { id: me.storeId },
      include: { phones: { orderBy: { label: 'asc' } } },
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  private async ownStop(me: AuthUser, stopId: string): Promise<DeliveryStop> {
    const stop = await this.prisma.tripStop.findUnique({
      where: { id: stopId },
      include: deliveryInclude,
    });
    if (!stop || stop.order.storeId !== me.storeId)
      throw new NotFoundException('Delivery not found');
    return stop;
  }
}
