import {
  BadRequestException,
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
  type StoreHome,
  type StoreNotice,
  type StoreOrderView,
} from '@waypoint/contracts';
import { DomainError } from '@waypoint/domain';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ClockService } from '../common/clock/clock.service';
import { nextOperatingDay } from '../common/clock/operating-day';
import { PrismaService } from '../common/prisma/prisma.service';
import { NOTIFIER, type Notifier } from '../notifications/notifier.interface';
import { CATALOGUE, buildLines } from './catalogue';
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
  trip: { include: { assignedDriver: true, vehicle: { include: { driver: true } } } },
  receipt: true,
} satisfies Prisma.TripStopInclude;

type DeliveryStop = Prisma.TripStopGetPayload<{ include: typeof deliveryInclude }>;

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
  };
}

function deliveryView(s: DeliveryStop): StoreDelivery {
  return {
    stopId: s.id,
    orderId: s.orderId,
    serviceDate: isoDay(s.trip.serviceDate),
    status: s.status,
    etaMin: s.etaMin,
    plate: s.trip.vehicle.plate ?? s.trip.vehicle.id,
    driverName: (s.trip.assignedDriver ?? s.trip.vehicle.driver)?.name ?? null,
    chilled: s.order.temp === 'chilled',
    arrivedAt: s.arrivedAt?.toISOString() ?? null,
    storeConfirmedAt: s.storeConfirmedAt?.toISOString() ?? null,
    driverAckAt: s.driverAckAt?.toISOString() ?? null,
    signaturePhotoKey: s.receipt?.signaturePhotoKey ?? null,
    signedAt: s.receipt?.signedAt?.toISOString() ?? null,
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
      })),
  };
}

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
    const [deliveries, upcoming, deferral, unreadNotices] = await Promise.all([
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
    ]);
    return {
      storeId: store.id,
      storeName: store.displayName ?? store.id,
      brand: store.brand,
      windowOpenMin: store.windowOpenMin,
      windowCloseMin: store.windowCloseMin,
      cutoffMin: ORDER_CUTOFF_MIN,
      nowMin: this.clock.minutesNow(),
      today,
      // The open delivery first; otherwise the last one of the day.
      delivery: deliveries.find((d) => !d.driverAckAt) ?? deliveries.at(-1) ?? null,
      nextOrder: upcoming ? orderView(upcoming) : null,
      deferral: deferral ? orderView(deferral) : null,
      unreadNotices,
      phones: store.phones.map((p) => ({ label: p.label, phoneNo: p.phoneNo })),
    };
  }

  async catalogue(me: AuthUser): Promise<CatalogueItem[]> {
    const store = await this.store(me);
    return CATALOGUE[store.brand];
  }

  async orders(me: AuthUser): Promise<StoreOrderView[]> {
    const store = await this.store(me);
    const orders = await this.prisma.order.findMany({
      where: { storeId: store.id, deliveryDate: { gte: asDate(this.clock.today()) } },
      orderBy: [{ deliveryDate: 'asc' }, { createdAt: 'asc' }],
    });
    return orders.map(orderView);
  }

  /** Orders are for the next operating day and close at 16:00 Asia/Colombo. */
  async placeOrder(me: AuthUser, dto: PlaceOrderDto): Promise<StoreOrderView> {
    const store = await this.store(me);
    if (this.clock.minutesNow() >= ORDER_CUTOFF_MIN) {
      throw new DomainError(
        'AFTER_CUTOFF',
        'Orders for tomorrow close at 16:00. Order again tomorrow morning.',
      );
    }
    let built: ReturnType<typeof buildLines>;
    try {
      built = buildLines(store.brand, dto.lines);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const order = await this.prisma.order.create({
      data: {
        storeId: store.id,
        brand: store.brand,
        deliveryDate: asDate(await nextOperatingDay(this.prisma, asDate(this.clock.today()))),
        temp: built.chilled ? 'chilled' : 'ambient',
        status: 'waiting',
        units: built.units,
        weightKg: built.weightKg,
        volumeM3: built.volumeM3,
        lines: { create: built.lines },
      },
    });
    return orderView(order);
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

    await this.prisma.$transaction([
      this.prisma.storeReceipt.create({
        data: {
          stopId: stop.id,
          lineResults,
          chilledWasCold: dto.chilledWasCold ?? null,
          signaturePhotoKey,
          signedByUserId: me.id,
          signedAt: now,
        },
      }),
      // Each problem line becomes a FieldFlag the driver accepts or disputes at acknowledgement.
      this.prisma.fieldFlag.createMany({
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
          })),
      }),
      this.prisma.tripStop.update({
        where: { id: stop.id },
        data: { status: 'confirmed', storeConfirmedAt: now },
      }),
      this.prisma.order.update({
        where: { id: stop.orderId },
        data: { status: partial ? 'partial' : 'delivered' },
      }),
    ]);

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
