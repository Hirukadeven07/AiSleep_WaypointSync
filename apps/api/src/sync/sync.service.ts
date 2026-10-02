import { Inject, Injectable } from '@nestjs/common';
import { Prisma, SosSeverity } from '@prisma/client';
import {
  DRIVER_EVENT_TYPES,
  ROAD_ISSUE_KINDS,
  ROAD_ISSUE_LABEL,
  type DriverEventInput,
  type RoadIssuePayload,
  type DriverEventType,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncRejectReason,
} from '@waypoint/contracts';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  NOTIFIER,
  type NotificationInput,
  type Notifier,
} from '../notifications/notifier.interface';

const EVENT_TYPES = new Set<string>(DRIVER_EVENT_TYPES);
const SOS_SEVERITIES = new Set<string>(Object.values(SosSeverity));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Stop statuses an ARRIVED event moves to `waiting`. */
const ARRIVABLE = ['upcoming', 'arrived', 'at_risk'];

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

const ROAD_ISSUE_KIND_SET = new Set<string>(ROAD_ISSUE_KINDS);
/** About 1.5 MB of JPEG as a data URL; the phone shrinks photos well below this. */
const ROAD_PHOTO_MAX = 2_000_000;
const isCoord = (n: unknown, max: number) =>
  typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;

/** A ROAD_ISSUE payload the dispatcher can act on (see RoadIssuePayload). */
function isRoadIssue(p: Record<string, unknown>): p is Record<string, unknown> & RoadIssuePayload {
  if (p.status !== 'reported' && p.status !== 'resolved') return false;
  if (typeof p.kind !== 'string' || !ROAD_ISSUE_KIND_SET.has(p.kind)) return false;
  if (p.note != null && (typeof p.note !== 'string' || p.note.length > 500)) return false;
  if (
    p.photo != null &&
    (typeof p.photo !== 'string' ||
      !/^data:image\/(jpeg|png|webp);base64,/.test(p.photo) ||
      p.photo.length > ROAD_PHOTO_MAX)
  ) {
    return false;
  }
  if (p.location != null) {
    const l = p.location as Record<string, unknown>;
    if (typeof l !== 'object' || !isCoord(l.lat, 90) || !isCoord(l.lng, 180)) return false;
  }
  return true;
}
const iso = (value: Date | null) => value?.toISOString() ?? null;

class RejectedEvent extends Error {
  constructor(public readonly reason: SyncRejectReason) {
    super(reason);
  }
}

class DuplicateEvent extends Error {
  constructor() {
    super('duplicate');
  }
}

interface AppliedEvent {
  stale: boolean;
  /** Sent only after the event's transaction commits. */
  notifications: NotificationInput[];
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  async pull(me: AuthUser): Promise<SyncPullResponse> {
    const trip = await this.activeTripForDriver(me.id);
    const activeSos = await this.hasActiveSos(me.id);

    if (!trip) {
      return { tripId: null, planVersion: null, stops: [], activeSos };
    }

    const stops = await this.prisma.tripStop.findMany({
      where: { tripId: trip.id },
      orderBy: { sequence: 'asc' },
      select: {
        id: true,
        sequence: true,
        status: true,
        arrivedAt: true,
        storeConfirmedAt: true,
        driverAckAt: true,
      },
    });

    return {
      tripId: trip.id,
      planVersion: trip.planVersion,
      stops: stops.map((stop) => ({
        id: stop.id,
        sequence: stop.sequence,
        status: stop.status,
        arrivedAt: iso(stop.arrivedAt),
        storeConfirmedAt: iso(stop.storeConfirmedAt),
        driverAckAt: iso(stop.driverAckAt),
      })),
      activeSos,
    };
  }

  /** Events are processed in order; each one is applied, reported duplicate, or rejected on its own. */
  async push(me: AuthUser, events: unknown[]): Promise<SyncPushResponse> {
    const response: Required<SyncPushResponse> = {
      applied: [],
      duplicate: [],
      rejected: [],
      stale: [],
      rejectedReasons: {},
    };
    const reject = (clientId: string, reason: SyncRejectReason) => {
      response.rejected.push(clientId);
      response.rejectedReasons[clientId] = reason;
    };

    for (const [index, raw] of events.entries()) {
      if (!this.isValidEvent(raw)) {
        // Echo the clientId when there is one so the phone can drop that outbox row.
        const clientId = this.readClientId(raw) ?? `invalid:${index}`;
        reject(clientId, 'INVALID_EVENT');
        continue;
      }
      const event = raw;
      const { clientId } = event;

      if (event.driverId !== me.id) {
        reject(clientId, 'DRIVER_MISMATCH');
        continue;
      }

      const existing = await this.prisma.driverEvent.findUnique({ where: { clientId } });
      if (existing) {
        response.duplicate.push(clientId);
        continue;
      }

      let result: AppliedEvent;
      try {
        result = await this.prisma.$transaction((tx) => this.applyEvent(tx, me, event));
      } catch (error) {
        if (error instanceof RejectedEvent) {
          reject(clientId, error.reason);
          continue;
        }
        if (error instanceof DuplicateEvent || this.isUniqueViolation(error)) {
          response.duplicate.push(clientId);
          continue;
        }
        throw error;
      }

      response.applied.push(clientId);
      if (result.stale) response.stale.push(clientId);
      await this.deliver(result.notifications);
    }

    return response;
  }

  private isValidEvent(raw: unknown): raw is DriverEventInput {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const event = raw as Record<string, unknown>;
    return (
      this.readClientId(raw) !== null &&
      typeof event.driverId === 'string' &&
      event.driverId.length > 0 &&
      (event.tripId === null || event.tripId === undefined || typeof event.tripId === 'string') &&
      typeof event.type === 'string' &&
      EVENT_TYPES.has(event.type) &&
      typeof event.payload === 'object' &&
      event.payload !== null &&
      !Array.isArray(event.payload) &&
      typeof event.createdOnPhoneAt === 'string' &&
      !Number.isNaN(Date.parse(event.createdOnPhoneAt)) &&
      (event.seenPlanVersion === null ||
        event.seenPlanVersion === undefined ||
        Number.isInteger(event.seenPlanVersion))
    );
  }

  private readClientId(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const clientId = (raw as Record<string, unknown>).clientId;
    return typeof clientId === 'string' && UUID.test(clientId) ? clientId : null;
  }

  private async applyEvent(
    tx: Prisma.TransactionClient,
    me: AuthUser,
    event: DriverEventInput,
  ): Promise<AppliedEvent> {
    const payload = event.payload;
    const happenedAt = this.happenedAt(event);

    switch (event.type as DriverEventType) {
      case 'SOS_ALERT': {
        // An SOS is never dropped: a bad or foreign tripId falls back to the active trip, then to none.
        const trip =
          (await this.lookupTripForDriver(tx, me.id, event.tripId ?? null)) ??
          (await this.activeTripForDriver(me.id, tx));
        const tripId = trip?.id ?? null;
        const stale = await this.shouldMarkStale(tx, event, tripId);
        await this.recordEvent(tx, me, event, tripId);

        const location = payload.location as { lat?: unknown; lng?: unknown } | null | undefined;
        const lat = typeof location?.lat === 'number' ? location.lat : null;
        const lng = typeof location?.lng === 'number' ? location.lng : null;
        const severity =
          typeof payload.severity === 'string' && SOS_SEVERITIES.has(payload.severity)
            ? (payload.severity as SosSeverity)
            : SosSeverity.high;
        const message =
          typeof payload.message === 'string'
            ? payload.message
            : typeof payload.note === 'string'
              ? payload.note
              : null;

        const driver = await tx.driver.upsert({
          where: { userId: me.id },
          create: { userId: me.id },
          update: {},
        });
        const vehicle = await tx.vehicle.findUnique({
          where: { driverId: me.id },
          select: { id: true, depotId: true },
        });
        await tx.driverIncident.create({
          data: {
            driverId: driver.id,
            tripId,
            vehicleId: vehicle?.id ?? null,
            incidentType: 'sos',
            severity,
            message,
            lat,
            lng,
            raisedAt: happenedAt,
          },
        });

        const depotId = vehicle?.depotId ?? me.depotId;
        const dispatchers = await tx.user.findMany({
          where: { role: 'dispatcher', ...(depotId ? { depotId } : {}) },
          select: { id: true },
        });
        const body = `${me.name} raised an SOS${message ? `: ${message}` : '.'}`;
        return {
          stale,
          notifications: dispatchers.map((user) => ({
            userId: user.id,
            title: 'Driver SOS',
            body,
            link: '/dispatch/incidents',
          })),
        };
      }

      case 'ARRIVED': {
        const stop = await this.ownedStop(tx, me, payload);
        const stale = await this.shouldMarkStale(tx, event, stop.tripId);
        await this.recordEvent(tx, me, event, stop.tripId);
        if (!ARRIVABLE.includes(stop.status)) {
          return { stale, notifications: [] };
        }
        await tx.tripStop.update({
          where: { id: stop.id },
          // Keep the first arrival time; a repeat ARRIVED must not move it.
          data: { status: 'waiting', arrivedAt: stop.arrivedAt ?? happenedAt },
        });
        return { stale, notifications: await this.storeNotifications(tx, stop.orderId) };
      }

      case 'ACKNOWLEDGEMENT': {
        const stop = await this.ownedStop(tx, me, payload);
        if (!stop.storeConfirmedAt) throw new RejectedEvent('ACK_BEFORE_RECEIPT');
        const stale = await this.shouldMarkStale(tx, event, stop.tripId);
        await this.recordEvent(tx, me, event, stop.tripId);
        // The driver cannot acknowledge before the store confirmed receipt.
        const ackAt = happenedAt < stop.storeConfirmedAt ? stop.storeConfirmedAt : happenedAt;
        await tx.tripStop.update({
          where: { id: stop.id },
          data: { driverAckAt: stop.driverAckAt ?? ackAt },
        });
        return { stale, notifications: [] };
      }

      case 'ROAD_ISSUE': {
        if (!isRoadIssue(payload)) throw new RejectedEvent('INVALID_PAYLOAD');
        let tripId = event.tripId ?? null;
        if (tripId) {
          if (!(await this.lookupTripForDriver(tx, me.id, tripId))) {
            throw new RejectedEvent('FORBIDDEN_TRIP');
          }
        } else {
          const active = await this.activeTripForDriver(me.id, tx);
          if (!active) throw new RejectedEvent('NO_ACTIVE_TRIP');
          tripId = active.id;
        }
        const stale = await this.shouldMarkStale(tx, event, tripId);
        await this.recordEvent(tx, me, event, tripId);
        if (payload.status !== 'reported') return { stale, notifications: [] };
        // A new report pauses the trip, so the depot's dispatchers hear about it once.
        const vehicle = await tx.vehicle.findUnique({
          where: { driverId: me.id },
          select: { plate: true, id: true, depotId: true },
        });
        const depotId = vehicle?.depotId ?? me.depotId;
        const dispatchers = await tx.user.findMany({
          where: { role: 'dispatcher', ...(depotId ? { depotId } : {}) },
          select: { id: true },
        });
        const label = ROAD_ISSUE_LABEL[payload.kind];
        const body = `${me.name}${vehicle ? ` (${vehicle.plate ?? vehicle.id})` : ''} reported: ${label}${payload.note ? ` — ${payload.note}` : ''}. Next stop paused.`;
        return {
          stale,
          notifications: dispatchers.map((user) => ({
            userId: user.id,
            title: 'Road issue',
            body,
            link: '/dispatch/incidents',
          })),
        };
      }

      case 'FUEL_READING': {
        const remainingLitres = payload.remainingLitres;
        if (
          typeof remainingLitres !== 'number' ||
          !Number.isFinite(remainingLitres) ||
          remainingLitres < 0
        ) {
          throw new RejectedEvent('INVALID_PAYLOAD');
        }
        const vehicle = await tx.vehicle.findUnique({ where: { driverId: me.id } });
        if (!vehicle) throw new RejectedEvent('NO_VEHICLE');

        let tripId = event.tripId ?? null;
        if (tripId) {
          if (!(await this.lookupTripForDriver(tx, me.id, tripId))) {
            throw new RejectedEvent('FORBIDDEN_TRIP');
          }
        } else {
          tripId = (await this.activeTripForDriver(me.id, tx))?.id ?? null;
        }

        const stale = await this.shouldMarkStale(tx, event, tripId);
        // Readings can sync out of order: an older one is stored for history but never overwrites a newer one.
        const latest = await tx.driverEvent.findFirst({
          where: { driverId: me.id, type: 'FUEL_READING' },
          orderBy: { createdOnPhoneAt: 'desc' },
          select: { createdOnPhoneAt: true },
        });
        const isNewest =
          !latest || latest.createdOnPhoneAt.getTime() <= Date.parse(event.createdOnPhoneAt);
        await this.recordEvent(tx, me, event, tripId);

        if (isNewest) {
          await tx.vehicle.update({
            where: { id: vehicle.id },
            data: { lastConfirmedLitres: remainingLitres },
          });
          if (tripId) {
            await tx.trip.update({
              where: { id: tripId },
              data: { fuelLitresAtEnd: remainingLitres },
            });
          }
        }
        return { stale, notifications: [] };
      }

      default:
        throw new RejectedEvent('INVALID_EVENT');
    }
  }

  /** When the action happened on the phone, clamped so a skewed phone clock cannot write future times. */
  private happenedAt(event: DriverEventInput): Date {
    const onPhone = new Date(event.createdOnPhoneAt);
    const now = this.clock.now();
    return onPhone > now ? now : onPhone;
  }

  private async recordEvent(
    tx: Prisma.TransactionClient,
    me: AuthUser,
    event: DriverEventInput,
    tripId: string | null,
  ) {
    try {
      await tx.driverEvent.create({
        data: {
          clientId: event.clientId,
          driverId: me.id,
          tripId,
          type: event.type,
          payload: event.payload as Prisma.InputJsonValue,
          createdOnPhoneAt: new Date(event.createdOnPhoneAt),
          seenPlanVersion: event.seenPlanVersion ?? null,
          appliedAt: this.clock.now(),
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new DuplicateEvent();
      throw error;
    }
  }

  private async ownedStop(
    tx: Prisma.TransactionClient,
    me: AuthUser,
    payload: Record<string, unknown>,
  ) {
    const stopId = payload.stopId;
    if (typeof stopId !== 'string') throw new RejectedEvent('INVALID_PAYLOAD');
    const stop = await tx.tripStop.findUnique({
      where: { id: stopId },
      include: { trip: { include: { vehicle: true } } },
    });
    if (!stop || stop.trip.vehicle.driverId !== me.id) throw new RejectedEvent('FORBIDDEN_STOP');
    return stop;
  }

  private async storeNotifications(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<NotificationInput[]> {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { storeId: true } });
    if (!order) return [];
    const storeUsers = await tx.user.findMany({
      where: { storeId: order.storeId },
      select: { id: true },
    });
    return storeUsers.map((user) => ({
      userId: user.id,
      title: 'Driver arrival',
      body: 'A driver has arrived for this stop.',
      link: '/store',
    }));
  }

  /** Best effort: the event is already committed, so a failed notification must not fail the sync. */
  private async deliver(notifications: NotificationInput[]) {
    for (const notification of notifications) {
      try {
        await this.notifier.notify(notification);
      } catch {
        // best effort only
      }
    }
  }

  private async activeTripForDriver(
    driverId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string; planVersion: number } | null> {
    const vehicle = await tx.vehicle.findUnique({
      where: { driverId },
      include: {
        trips: {
          where: {
            serviceDate: asDate(this.clock.today()),
            status: { in: ['published', 'loading', 'ready', 'on_road'] },
          },
        },
      },
    });
    if (!vehicle || vehicle.trips.length === 0) return null;
    const onRoad = vehicle.trips.find((trip) => trip.status === 'on_road');
    const trip = onRoad ?? vehicle.trips.sort((a, b) => a.tripNumber - b.tripNumber)[0];
    if (!trip) return null;
    return { id: trip.id, planVersion: trip.planVersion };
  }

  private async lookupTripForDriver(
    tx: Prisma.TransactionClient,
    driverId: string,
    tripId: string | null,
  ): Promise<{ id: string; planVersion: number } | null> {
    if (!tripId) return null;
    const trip = await tx.trip.findUnique({
      where: { id: tripId },
      include: { vehicle: true },
    });
    if (!trip || trip.vehicle.driverId !== driverId) return null;
    return { id: trip.id, planVersion: trip.planVersion };
  }

  private async shouldMarkStale(
    tx: Prisma.TransactionClient,
    event: DriverEventInput,
    tripId: string | null,
  ): Promise<boolean> {
    if (!tripId || event.seenPlanVersion === null || event.seenPlanVersion === undefined) {
      return false;
    }
    const trip = await tx.trip.findUnique({
      where: { id: tripId },
      select: { planVersion: true },
    });
    return Boolean(trip && trip.planVersion !== event.seenPlanVersion);
  }

  /** An SOS stays active until dispatch resolves its incident (DriverIncident.resolvedAt). */
  private async hasActiveSos(userId: string): Promise<boolean> {
    const count = await this.prisma.driverIncident.count({
      where: { driver: { userId }, incidentType: 'sos', resolvedAt: null },
    });
    return count > 0;
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
