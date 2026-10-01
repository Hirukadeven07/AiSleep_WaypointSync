import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  DriverEventInput,
  DriverEventType,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '@waypoint/contracts';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { NOTIFIER, type Notifier } from '../notifications/notifier.interface';

const EVENT_TYPES = new Set<DriverEventType>([
  'SOS_ALERT',
  'ARRIVED',
  'ACKNOWLEDGEMENT',
  'ROAD_ISSUE',
  'FUEL_READING',
]);

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (value: Date | null) => value?.toISOString() ?? null;

class RejectedEvent extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

class DuplicateEvent extends Error {
  constructor() {
    super('duplicate');
  }
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

  async push(me: AuthUser, dto: SyncPushRequest): Promise<SyncPushResponse> {
    if (!dto || !Array.isArray(dto.events) || dto.events.length > 100) {
      throw new BadRequestException('Body must include an events array of up to 100 items.');
    }

    const response: SyncPushResponse = {
      applied: [],
      duplicate: [],
      rejected: [],
      stale: [],
      rejectedReasons: {},
    };

    for (const raw of dto.events) {
      let clientId: string | null = null;
      try {
        this.assertValidEventShape(raw);
      } catch {
        clientId =
          raw && typeof raw === 'object' && 'clientId' in raw && typeof raw.clientId === 'string'
            ? raw.clientId
            : null;
        const rejectedId = clientId ?? `invalid:${response.rejected.length + response.duplicate.length}`;
        response.rejected.push(rejectedId);
        response.rejectedReasons![rejectedId] = 'INVALID_EVENT';
        continue;
      }

      const event = raw as DriverEventInput;
      clientId = event.clientId;

      if (event.driverId !== me.id) {
        response.rejected.push(clientId);
        response.rejectedReasons![clientId] = 'DRIVER_MISMATCH';
        continue;
      }

      const existing = await this.prisma.driverEvent.findUnique({ where: { clientId } });
      if (existing) {
        response.duplicate.push(clientId);
        continue;
      }

      let staleEvent = false;
      try {
        await this.prisma.$transaction(async (tx) => {
          const result = await this.applyEvent(tx, me, event);
          if (!result.accepted) {
            throw new RejectedEvent(result.reason!);
          }
          staleEvent = !!result.stale;
        });
        response.applied.push(clientId);
        if (staleEvent) {
          response.stale!.push(clientId);
        }
      } catch (error) {
        if (error instanceof DuplicateEvent) {
          response.duplicate.push(clientId);
          continue;
        }
        if (error instanceof RejectedEvent) {
          response.rejected.push(clientId);
          response.rejectedReasons![clientId] = error.reason;
          continue;
        }
        if (this.isUniqueViolation(error)) {
          response.duplicate.push(clientId);
          continue;
        }
        throw error;
      }
    }

    return response;
  }

  private assertValidEventShape(raw: unknown): asserts raw is DriverEventInput {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException('Each sync event must be an object.');
    }

    const event = raw as Record<string, unknown>;
    if (typeof event.clientId !== 'string' || !this.isUuid(event.clientId)) {
      throw new BadRequestException('Each event needs a valid clientId UUID.');
    }
    if (typeof event.driverId !== 'string' || !event.driverId) {
      throw new BadRequestException('Each event needs a driverId string.');
    }
    if (event.tripId !== null && typeof event.tripId !== 'string') {
      throw new BadRequestException('tripId must be a string or null.');
    }
    if (typeof event.type !== 'string' || !EVENT_TYPES.has(event.type as DriverEventType)) {
      throw new BadRequestException('Unsupported driver event type.');
    }
    if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
      throw new BadRequestException('Event payload must be an object.');
    }
    if (typeof event.createdOnPhoneAt !== 'string' || Number.isNaN(Date.parse(event.createdOnPhoneAt))) {
      throw new BadRequestException('createdOnPhoneAt must be an ISO timestamp string.');
    }
    if (
      event.seenPlanVersion !== null &&
      (typeof event.seenPlanVersion !== 'number' || !Number.isInteger(event.seenPlanVersion))
    ) {
      throw new BadRequestException('seenPlanVersion must be a finite number or null.');
    }
  }

  private async applyEvent(
    tx: Prisma.TransactionClient,
    me: AuthUser,
    event: DriverEventInput,
  ): Promise<{ accepted: boolean; stale?: boolean; reason?: string }> {
    const accepted = (valid: boolean, reason?: string) => ({ accepted: valid, stale: false, reason });

    if (event.type === 'SOS_ALERT') {
      const trip = await this.lookupTripForDriver(tx, me.id, event.tripId ?? null);
      const eventTripId = trip?.id ?? null;
      const stale = await this.shouldMarkStale(tx, event, eventTripId);
      try {
        await tx.driverEvent.create({
          data: {
            clientId: event.clientId,
            driverId: me.id,
            tripId: eventTripId,
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
      return { accepted: true, stale };
    }

    if (event.type === 'ARRIVED') {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const stopId = payload.stopId;
      if (typeof stopId !== 'string') return accepted(false, 'INVALID_PAYLOAD');
      const stop = await tx.tripStop.findUnique({
        where: { id: stopId },
        include: { trip: { include: { vehicle: true } } },
      });
      if (!stop || stop.trip.vehicle.driverId !== me.id) {
        return accepted(false, 'FORBIDDEN_STOP');
      }
      const stale = await this.shouldMarkStale(tx, event, stop.trip.id);
      const shouldSetWaiting = ['upcoming', 'arrived', 'at_risk'].includes(stop.status);
      const shouldNotify = shouldSetWaiting && stop.status !== 'waiting';
      const arrivedAt = shouldSetWaiting ? this.clock.now() : stop.arrivedAt;
      await tx.driverEvent.create({
        data: {
          clientId: event.clientId,
          driverId: me.id,
          tripId: stop.tripId,
          type: event.type,
          payload: event.payload as Prisma.InputJsonValue,
          createdOnPhoneAt: new Date(event.createdOnPhoneAt),
          seenPlanVersion: event.seenPlanVersion ?? null,
          appliedAt: this.clock.now(),
        },
      });
      await tx.tripStop.update({
        where: { id: stop.id },
        data: {
          status: shouldSetWaiting ? 'waiting' : stop.status,
          arrivedAt,
        },
      });
      if (shouldNotify) {
        await this.notifyStoreUsers(
          tx,
          stop.orderId,
          'Driver arrival',
          'A driver has arrived for this stop.',
          '/store',
        );
      }
      return { accepted: true, stale };
    }

    if (event.type === 'ACKNOWLEDGEMENT') {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const stopId = payload.stopId;
      if (typeof stopId !== 'string') return accepted(false, 'INVALID_PAYLOAD');
      const stop = await tx.tripStop.findUnique({
        where: { id: stopId },
        include: { trip: { include: { vehicle: true } } },
      });
      if (!stop || stop.trip.vehicle.driverId !== me.id) {
        return accepted(false, 'FORBIDDEN_STOP');
      }
      if (!stop.storeConfirmedAt) {
        return accepted(false, 'ACK_BEFORE_RECEIPT');
      }
      const stale = await this.shouldMarkStale(tx, event, stop.trip.id);
      await tx.driverEvent.create({
        data: {
          clientId: event.clientId,
          driverId: me.id,
          tripId: stop.tripId,
          type: event.type,
          payload: event.payload as Prisma.InputJsonValue,
          createdOnPhoneAt: new Date(event.createdOnPhoneAt),
          seenPlanVersion: event.seenPlanVersion ?? null,
          appliedAt: this.clock.now(),
        },
      });
      await tx.tripStop.update({
        where: { id: stop.id },
        data: { driverAckAt: stop.driverAckAt ?? this.clock.now() },
      });
      return { accepted: true, stale };
    }

    if (event.type === 'ROAD_ISSUE') {
      let tripId = event.tripId;
      if (tripId) {
        const trip = await this.lookupTripForDriver(tx, me.id, tripId);
        if (!trip) return accepted(false, 'FORBIDDEN_TRIP');
      } else {
        const trip = await this.activeTripForDriver(me.id, tx);
        if (!trip) return accepted(false, 'NO_ACTIVE_TRIP');
        tripId = trip.id;
      }
      const stale = await this.shouldMarkStale(tx, event, tripId);
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
      return { accepted: true, stale };
    }

    if (event.type === 'FUEL_READING') {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const remainingLitres = payload.remainingLitres;
      if (typeof remainingLitres !== 'number' || !Number.isFinite(remainingLitres) || remainingLitres < 0) {
        return accepted(false, 'INVALID_PAYLOAD');
      }
      const vehicle = await tx.vehicle.findUnique({ where: { driverId: me.id } });
      if (!vehicle) return accepted(false, 'NO_VEHICLE');

      let tripId: string | null = event.tripId ?? null;
      if (tripId) {
        const trip = await this.lookupTripForDriver(tx, me.id, tripId);
        if (!trip) return accepted(false, 'FORBIDDEN_TRIP');
      } else {
        const active = await this.activeTripForDriver(me.id, tx);
        if (active) tripId = active.id;
      }

      const stale = await this.shouldMarkStale(tx, event, tripId);
      const latest = await tx.driverEvent.findFirst({
        where: { driverId: me.id, type: 'FUEL_READING' },
        orderBy: { createdOnPhoneAt: 'desc' },
      });
      const latestTime = latest ? new Date(latest.createdOnPhoneAt).getTime() : null;
      const thisTime = Date.parse(event.createdOnPhoneAt);
      const skipUpdates = latestTime !== null && latestTime > thisTime;

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

      if (!skipUpdates) {
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
      return { accepted: true, stale };
    }

    return accepted(false, 'INVALID_PAYLOAD');
  }

  private async notifyStoreUsers(
    tx: Prisma.TransactionClient,
    orderId: string,
    title: string,
    body: string,
    link: string,
  ) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { store: { select: { displayName: true, id: true } } },
    });
    if (!order) return;
    const storeUsers = await tx.user.findMany({
      where: { storeId: order.storeId },
      select: { id: true },
    });
    for (const user of storeUsers) {
      try {
        await this.notifier.notify({
          userId: user.id,
          title,
          body,
          link,
        });
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

  private async hasActiveSos(driverId: string): Promise<boolean> {
    const start = `${this.clock.today()}T00:00:00+05:30`;
    const count = await this.prisma.driverEvent.count({
      where: {
        driverId,
        type: 'SOS_ALERT',
        appliedAt: { gte: start as unknown as Date },
      },
    });
    return count > 0;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002',
    );
  }
}
