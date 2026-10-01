import { Inject, Injectable } from '@nestjs/common';
import type { BringBackResult, DeferPreview, DeferResult, Me } from '@waypoint/contracts';
import { DomainError, deferOrder } from '@waypoint/domain';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { NOTIFIER, type Notifier } from '../notifications/notifier.interface';
import { PlanEditService } from './plan-edit.service';
import { clockText, dayLabel } from './plan-labels';
import { PlanService } from './plan.service';
import { orderInclude, toOutlet, toStopView } from './plan.mapper';

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Moving an order to a later day, and bringing it back. */
@Injectable()
export class PlanDeferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edit: PlanEditService,
    private readonly plan: PlanService,
    private readonly clock: ClockService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  /** The next operating day after `from` (skips days the calendar marks as closed). */
  private async nextOperatingDay(from: Date): Promise<string> {
    for (let i = 1; i <= 7; i++) {
      const d = new Date(from);
      d.setUTCDate(d.getUTCDate() + i);
      const cal = await this.prisma.calendarDay.findUnique({ where: { id: d } });
      if (!cal || cal.isOperating) return iso(d);
    }
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + 1);
    return iso(d);
  }

  async preview(me: Me, orderId: string, reason: string): Promise<DeferPreview> {
    const order = await this.edit.loadOrder(me, orderId);
    const view = this.plan.planOrder(order, this.clock.today());
    const newDate = await this.nextOperatingDay(order.deliveryDate);
    const result = deferOrder({
      order: toStopView(order).order,
      outlet: toOutlet(order.store),
      newDate,
      reason,
      previouslyDeferredOutletIds: view.movedCount > 0 ? [order.storeId] : [],
    });
    const code = `ORD-${order.id.slice(-5).toUpperCase()}`;
    return {
      orderId,
      storeName: view.storeName,
      times: view.movedCount + 1,
      newDate,
      repeatSkip: result.repeatSkip,
      storeMessage: `Your order ${code} now arrives ${dayLabel(newDate)}, ${clockText(view.windowOpenMin)}-${clockText(view.windowCloseMin)}. Sorry for the delay, you are first in line that day.`,
    };
  }

  async defer(me: Me, orderId: string, reason: string): Promise<DeferResult> {
    const lookup = await this.plan.loadLookup();
    const preview = await this.preview(me, orderId, reason);
    const depot = this.edit.depotOf(me) as Parameters<PlanEditService['resequence']>[3];

    const fromTripId = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (order.status === 'delivered' || order.status === 'partial') {
        throw new DomainError('PLAN_LOCKED', 'This order has already been delivered.');
      }
      const stop = await tx.tripStop.findUnique({ where: { orderId } });
      if (stop) {
        const trip = await this.edit.loadTrip(me, stop.tripId, tx);
        PlanEditService.assertEditable(trip);
        await tx.tripStop.delete({ where: { orderId } });
        await this.edit.resequence(tx, stop.tripId, lookup, depot);
      }
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'deferred',
          movedFromDate: order.deliveryDate,
          deliveryDate: new Date(`${preview.newDate}T00:00:00Z`),
          deferReason: reason,
          deferredById: me.id,
          repeatSkip: preview.repeatSkip,
        },
      });
      return stop?.tripId ?? null;
    });

    const order = await this.edit.loadOrder(me, orderId);
    const users = await this.prisma.user.findMany({
      where: { storeId: order.storeId, role: 'store' },
    });
    for (const u of users) {
      await this.notifier.notify({
        userId: u.id,
        title: `Delivery moved to ${dayLabel(preview.newDate)}`,
        body: preview.storeMessage,
        link: '/store',
      });
    }

    return {
      order: this.plan.planOrder(order, this.clock.today()),
      fromTrip: fromTripId ? await this.edit.tripView(me, fromTripId, lookup, depot) : null,
    };
  }

  /** A moved order comes back to the day it was moved from. */
  async bringBack(me: Me, orderId: string): Promise<BringBackResult> {
    const order = await this.edit.loadOrder(me, orderId);
    if (order.status !== 'deferred') {
      throw new DomainError('PLAN_LOCKED', 'Only a moved order can be brought back.');
    }
    const back = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'waiting',
        deliveryDate: order.movedFromDate ?? order.deliveryDate,
        deferReason: null,
      },
      include: orderInclude,
    });
    return { order: this.plan.planOrder(back, this.clock.today()) };
  }
}
