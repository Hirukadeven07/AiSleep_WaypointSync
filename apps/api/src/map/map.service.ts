import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  LocateMap,
  LocateTrip,
  MapStore,
  Me,
  PlanMap,
  PlanMapPin,
  UnplacedStore,
} from '@waypoint/contracts';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { DEPART_MIN } from '../plan/plan.service';
import {
  depotPoint,
  fallbackDistricts,
  isOnRoad,
  lastVisited,
  locateLive,
  minutesLate,
  stopIsDone,
  stopKind,
} from './map.logic';

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const person = (name: string) => name.replace(/\s*\(.*\)\s*$/, '').trim();

function addDays(iso: string, days: number): string {
  const d = dateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

@Injectable()
export class MapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** Planning pins for the signed-in depot. Tomorrow unless a date is given. */
  async plan(me: Me, dateParam?: string): Promise<PlanMap> {
    if (dateParam !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const depotId = this.depotOf(me);
    const date = dateParam ?? addDays(this.clock.today(), 1);
    const [depot, districts, orders, stores] = await Promise.all([
      this.prisma.depot.findUnique({ where: { id: depotId } }),
      this.districts(),
      this.prisma.order.findMany({
        where: {
          deliveryDate: dateOnly(date),
          status: { in: ['waiting', 'planned'] },
          store: { depotId },
        },
        include: {
          store: { include: { district: true } },
          stop: { include: { trip: { include: { vehicle: true } } } },
        },
      }),
      this.storeMarkers(depotId, date),
    ]);

    let unplaced = 0;
    const pins: PlanMapPin[] = [];
    const unplacedStores: UnplacedStore[] = [];
    const seenUnplaced = new Set<string>();
    for (const order of orders) {
      const { lat, lng } = order.store;
      if (lat == null || lng == null) {
        unplaced += 1;
        if (!seenUnplaced.has(order.storeId)) {
          seenUnplaced.add(order.storeId);
          unplacedStores.push({
            orderId: order.id,
            storeId: order.storeId,
            storeName: order.store.displayName ?? order.store.id,
            district: order.store.district.name,
          });
        }
        continue;
      }
      const trip = order.stop?.trip;
      pins.push({
        orderId: order.id,
        storeId: order.storeId,
        storeName: order.store.displayName ?? order.store.id,
        brand: order.brand,
        district: order.store.district.name,
        lat,
        lng,
        chilled: order.temp === 'chilled',
        vanOnly: order.store.parkingConstraint === 'van_only',
        windowOpenMin: order.store.windowOpenMin,
        windowCloseMin: order.store.windowCloseMin,
        weightKg: order.weightKg,
        volumeM3: order.volumeM3,
        plate: trip
          ? {
              tripId: trip.id,
              tripNumber: trip.tripNumber,
              vehiclePlate: trip.vehicle.numberPlate,
            }
          : null,
      });
    }
    pins.sort(
      (a, b) =>
        a.district.localeCompare(b.district) ||
        a.windowOpenMin - b.windowOpenMin ||
        a.storeName.localeCompare(b.storeName),
    );

    return {
      date,
      depotId,
      depot: depot ? depotPoint(depot.id, depot.name, depot) : null,
      districts,
      pins,
      stores,
      unplaced,
      unplacedStores,
    };
  }

  /** Save a store coordinate the dispatcher picked on the map. */
  async placeStore(me: Me, storeId: string, lat: number, lng: number) {
    const depotId = this.depotOf(me);
    if (lat < 5.85 || lat > 9.95 || lng < 79.4 || lng > 82.05) {
      throw new BadRequestException('Pick a point on Sri Lanka');
    }
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.depotId !== depotId) throw new NotFoundException('Unknown store');
    await this.prisma.store.update({ where: { id: storeId }, data: { lat, lng } });
    return { storeId, lat, lng };
  }

  /**
   * Where today's drivers are, placed on the last store they arrived at.
   * `depot` switches the island highlight and the trip list. Defaults to the signed-in depot.
   */
  async locate(me: Me, depotParam?: string): Promise<LocateMap> {
    this.depotOf(me);
    const depotId = depotParam?.trim() || me.depotId!;
    const depot = await this.prisma.depot.findUnique({ where: { id: depotId } });
    if (!depot) throw new NotFoundException('Unknown depot');

    const date = this.clock.today();
    const day = dateOnly(date);
    const now = this.clock.now();

    const [districts, depots, stores, rows, events, pings] = await Promise.all([
      this.districts(),
      this.prisma.depot.findMany({ orderBy: { name: 'asc' } }),
      this.storeMarkers(depotId, date),
      this.prisma.trip.findMany({
        where: { depotId, serviceDate: day, status: { not: 'planning' } },
        include: {
          vehicle: { include: { driver: true } },
          assignedDriver: true,
          district: true,
          stops: {
            orderBy: { sequence: 'asc' },
            include: { order: { include: { store: { include: { district: true } } } } },
          },
        },
        orderBy: [{ vehicleId: 'asc' }, { tripNumber: 'asc' }],
      }),
      this.prisma.driverEvent.groupBy({
        by: ['tripId'],
        _max: { appliedAt: true },
        where: { trip: { depotId, serviceDate: day } },
      }),
      this.prisma.locationPing.groupBy({
        by: ['tripId'],
        _max: { receivedAt: true },
        where: { trip: { depotId, serviceDate: day } },
      }),
    ]);

    const lastSeen = new Map<string, Date>();
    for (const event of events) {
      if (event.tripId && event._max.appliedAt) lastSeen.set(event.tripId, event._max.appliedAt);
    }
    for (const ping of pings) {
      const seen = ping._max.receivedAt;
      const prev = lastSeen.get(ping.tripId);
      if (seen && (!prev || seen > prev)) lastSeen.set(ping.tripId, seen);
    }

    const trips: LocateTrip[] = [];
    let firstDepartMin: number | null = null;
    let firstDepartBrand: LocateMap['firstDepartBrand'] = null;

    for (const trip of rows) {
      const driver = trip.assignedDriver ?? trip.vehicle.driver;
      const done = trip.stops.filter((s) => stopIsDone(s.status));
      const lates = trip.stops.map((s) =>
        minutesLate(s.etaMin, s.order.store.windowCloseMin, stopIsDone(s.status)),
      );
      const lateMin = Math.max(0, ...lates.map((n) => n ?? 0));
      const seen = lastSeen.get(trip.id) ?? null;
      const staleMin = seen ? Math.floor((now.getTime() - seen.getTime()) / 60000) : null;
      const allDone = trip.stops.length > 0 && trip.stops.every((s) => stopIsDone(s.status));
      const live = locateLive({
        status: trip.status,
        broke: trip.status === 'breakdown',
        allDone,
        lateMin,
        staleMin,
      });

      if (!isOnRoad(live) && live !== 'completed') {
        const depart = DEPART_MIN[trip.brand];
        if (firstDepartMin === null || depart < firstDepartMin) {
          firstDepartMin = depart;
          firstDepartBrand = trip.brand;
        }
        continue;
      }

      const visited = lastVisited(trip.stops);
      const next = trip.stops.find((s) => !stopIsDone(s.status));
      trips.push({
        id: trip.id,
        vehicleId: trip.vehicleId,
        plate: trip.vehicle.numberPlate,
        tripNumber: trip.tripNumber,
        brand: trip.brand,
        district: trip.district.name,
        driverName: driver ? person(driver.name) : null,
        live,
        lateMin: live === 'late' ? lateMin : null,
        stopsDone: done.length,
        stopsTotal: trip.stops.length,
        lastStop: visited?.arrivedAt
          ? {
              stopId: visited.id,
              storeName: visited.order.store.displayName ?? visited.order.store.id,
              lat: visited.order.store.lat,
              lng: visited.order.store.lng,
              arrivedAt: visited.arrivedAt.toISOString(),
            }
          : null,
        stops: trip.stops.map((s) => ({
          id: s.id,
          sequence: s.sequence,
          storeName: s.order.store.displayName ?? s.order.store.id,
          district: s.order.store.district.name,
          lat: s.order.store.lat,
          lng: s.order.store.lng,
          status: s.status,
          kind: stopKind(
            s.status,
            minutesLate(s.etaMin, s.order.store.windowCloseMin, stopIsDone(s.status)),
            s.id === next?.id,
          ),
          arrivedAt: s.arrivedAt?.toISOString() ?? null,
          windowOpenMin: s.order.store.windowOpenMin,
          windowCloseMin: s.order.store.windowCloseMin,
          issueNote: s.status === 'partial' ? 'Partial delivery' : null,
        })),
      });
    }

    return {
      date,
      asOf: now.toISOString(),
      depotId,
      depots: depots.flatMap((d) => {
        const point = depotPoint(d.id, d.name, d);
        return point ? [point] : [];
      }),
      districts,
      stores,
      trips,
      firstDepartMin,
      firstDepartBrand,
    };
  }

  private depotOf(me: Me): string {
    if (!me.depotId) throw new ForbiddenException('This account has no depot');
    return me.depotId;
  }

  /** Every located store at the depot. Darker on the map when it has an order that day. */
  private async storeMarkers(depotId: string, date: string): Promise<MapStore[]> {
    const day = dateOnly(date);
    const [stores, orders] = await Promise.all([
      this.prisma.store.findMany({
        where: { depotId },
        select: {
          id: true,
          displayName: true,
          brand: true,
          lat: true,
          lng: true,
          district: { select: { name: true } },
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.order.findMany({
        where: { deliveryDate: day, store: { depotId } },
        select: { id: true, storeId: true, status: true },
      }),
    ]);
    const rank: Record<string, number> = {
      waiting: 0,
      planned: 1,
      partial: 2,
      delivered: 3,
      deferred: 4,
    };
    const best = new Map<string, { id: string; status: string }>();
    for (const order of orders) {
      const prev = best.get(order.storeId);
      if (!prev || (rank[order.status] ?? 9) < (rank[prev.status] ?? 9)) best.set(order.storeId, order);
    }
    const markers: MapStore[] = [];
    for (const store of stores) {
      if (store.lat == null || store.lng == null) continue;
      const order = best.get(store.id);
      markers.push({
        storeId: store.id,
        storeName: store.displayName ?? store.id,
        brand: store.brand,
        district: store.district.name,
        lat: store.lat,
        lng: store.lng,
        hasOrder: order != null,
        orderId: order?.id ?? null,
      });
    }
    return markers;
  }

  private async districts() {
    const rows = await this.prisma.district.findMany({
      select: { name: true, depotId: true, served: true },
      orderBy: { name: 'asc' },
    });
    return rows.length > 0 ? rows : fallbackDistricts();
  }
}
