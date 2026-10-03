import { Injectable } from '@nestjs/common';
import type {
  DriverDayResponse,
  DriverDayRoadIssue,
  DriverNotice,
  RoadIssuePayload,
} from '@waypoint/contracts';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { buildDriverDay, DRIVER_TRIP_STATUSES, pickActiveTripId } from './driver-day.mapper';
import { alertLongWaits } from './driver-notices';
import { ownTripWhere } from './driver-trips';

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** How many days ahead the driver sees published trips. */
const UPCOMING_DAYS = 3;

const vehicleSelect = { id: true, numberPlate: true, type: true } as const;

const tripSelect = {
  id: true,
  serviceDate: true,
  tripNumber: true,
  status: true,
  planVersion: true,
  vehicle: { select: vehicleSelect },
  stops: {
    orderBy: { sequence: 'asc' },
    select: {
      id: true,
      sequence: true,
      status: true,
      etaMin: true,
      arrivedAt: true,
      storeConfirmedAt: true,
      driverAckAt: true,
      order: {
        select: {
          id: true,
          urgentNote: true,
          store: {
            select: {
              id: true,
              displayName: true,
              windowOpenMin: true,
              windowCloseMin: true,
              lat: true,
              lng: true,
              dockType: true,
              parkingConstraint: true,
              mallWindow: true,
              district: { select: { name: true } },
              phones: { select: { label: true, phoneNo: true } },
            },
          },
        },
      },
      flags: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          qty: true,
          note: true,
          orderLine: { select: { name: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** Today's trips for this driver (see `ownTripWhere`), plus published trips on the next few days. */
  async day(me: AuthUser): Promise<DriverDayResponse> {
    const serviceDate = this.clock.today();
    const today = asDate(serviceDate);
    const until = asDate(serviceDate);
    until.setUTCDate(until.getUTCDate() + UPCOMING_DAYS);

    const [trips, upcoming, registered, unreadNotices] = await Promise.all([
      this.prisma.trip.findMany({
        where: {
          ...ownTripWhere(me.id),
          serviceDate: today,
          status: { in: DRIVER_TRIP_STATUSES },
        },
        orderBy: { tripNumber: 'asc' },
        select: tripSelect,
      }),
      this.prisma.trip.findMany({
        where: {
          ...ownTripWhere(me.id),
          serviceDate: { gt: today, lte: until },
          status: { in: ['published', 'loading', 'ready'] },
        },
        orderBy: [{ serviceDate: 'asc' }, { tripNumber: 'asc' }],
        select: tripSelect,
      }),
      this.prisma.vehicle.findUnique({ where: { driverId: me.id }, select: vehicleSelect }),
      this.prisma.notification.count({ where: { userId: me.id, read: false } }),
    ]);

    // The phone polls while the driver waits at a store, so this is where a long wait is noticed.
    await alertLongWaits(
      this.prisma,
      this.clock.now(),
      trips.map((t) => t.id),
    );

    // The truck the driver is on today; their own vehicle when they have no trip.
    const activeId = pickActiveTripId(trips);
    const vehicle = trips.find((t) => t.id === activeId)?.vehicle ?? registered;
    return buildDriverDay(serviceDate, vehicle ? { ...vehicle, trips } : null, {
      upcoming,
      unreadNotices,
      roadIssue: activeId ? await this.openRoadIssue(activeId) : null,
    });
  }

  /** The latest road issue on the trip, if it was reported and not resolved since. */
  private async openRoadIssue(tripId: string): Promise<DriverDayRoadIssue | null> {
    const last = await this.prisma.driverEvent.findFirst({
      where: { tripId, type: 'ROAD_ISSUE' },
      orderBy: [{ createdOnPhoneAt: 'desc' }, { appliedAt: 'desc' }, { id: 'desc' }],
      select: { payload: true, createdOnPhoneAt: true },
    });
    const payload = last?.payload as unknown as RoadIssuePayload | undefined;
    if (!last || payload?.status !== 'reported') return null;
    return {
      tripId,
      kind: payload.kind,
      note: payload.note ?? null,
      reportedAt: last.createdOnPhoneAt.toISOString(),
    };
  }

  async notices(me: AuthUser): Promise<DriverNotice[]> {
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

  async markNoticeRead(me: AuthUser, id: string): Promise<{ ok: true }> {
    await this.prisma.notification.updateMany({
      where: { id, userId: me.id },
      data: { read: true },
    });
    return { ok: true };
  }
}
