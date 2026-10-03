import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddVehicleRequest,
  FleetDay,
  FleetStatus,
  FleetTrip,
  FleetVehicle,
  LiveTrip,
  Me,
  OutOfServiceRequest,
  OutOfServiceResult,
} from '@waypoint/contracts';
import { estimateTripLitres, sortStopsByWindow } from '@waypoint/domain';
import { backAtLabel } from '../common/back-at';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { orderInclude, toStopView, toVehicle } from '../plan/plan.mapper';
import { PlanService } from '../plan/plan.service';

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoDateTime = (d: Date) => d.toISOString();
const driverName = (name: string) => name.replace(/\s*\(.*\)\s*$/, '').trim();
const STARTED = new Set(['loading', 'ready', 'on_road', 'breakdown', 'completed']);

const driverInclude = { include: { driverProfile: { include: { phones: true } } } } as const;

/** The depot's vehicles with what each one is doing today, and taking one out of service. */
@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly dispatch: DispatchService,
    private readonly plan: PlanService,
  ) {}

  private depotOf(me: Me): string {
    if (!me.depotId) throw new ForbiddenException('This account has no depot');
    return me.depotId;
  }

  async day(me: Me): Promise<FleetDay> {
    const depotId = this.depotOf(me);
    const date = this.clock.today();
    const day = dateOnly(date);

    // Monday to Sunday of this ISO week, for the fuel estimate.
    const weekStart = new Date(day);
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const [vehicles, trips, live, weekTrips, lookup] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { depotId },
        include: { driver: driverInclude },
        orderBy: { numberPlate: 'asc' },
      }),
      this.prisma.trip.findMany({
        where: { depotId, serviceDate: day },
        include: {
          district: true,
          assignedDriver: driverInclude,
          stops: { select: { status: true } },
          loadingJob: { select: { bay: true } },
        },
        orderBy: [{ vehicleId: 'asc' }, { tripNumber: 'asc' }],
      }),
      this.dispatch.live(me),
      this.prisma.trip.findMany({
        where: { depotId, serviceDate: { gte: weekStart, lt: weekEnd } },
        include: {
          stops: { orderBy: { sequence: 'asc' }, include: { order: { include: orderInclude } } },
        },
      }),
      this.plan.loadLookup(),
    ]);

    const liveById = new Map<string, LiveTrip>(live.trips.map((t) => [t.id, t]));
    const out = vehicles.map((v): FleetVehicle => {
      const mine = trips.filter((t) => t.vehicleId === v.id);
      const fleetTrips: FleetTrip[] = mine.map((t) => {
        const l = liveById.get(t.id);
        const done = l?.stopsDone ?? 0;
        const total = t.stops.length;
        if (l) {
          const label =
            l.live === 'late'
              ? `Late ${l.lateMin} min`
              : {
                  on_time: 'On time',
                  breakdown: 'Breakdown',
                  not_synced: 'Not synced',
                  completed: 'Completed',
                  loading: 'Loading',
                  assigned: 'Assigned',
                  planned: 'Planned',
                }[l.live];
          const tone =
            l.live === 'loading' || l.live === 'assigned' || l.live === 'planned'
              ? 'planned'
              : l.live;
          return {
            id: t.id,
            tripNumber: t.tripNumber,
            brand: t.brand,
            district: t.district.name,
            status: t.status,
            label,
            tone,
            stopsDone: done,
            stopsTotal: total,
          };
        }
        return {
          id: t.id,
          tripNumber: t.tripNumber,
          brand: t.brand,
          district: t.district.name,
          status: t.status,
          label: 'Planned',
          tone: 'planned',
          stopsDone: 0,
          stopsTotal: total,
        };
      });

      const unstarted = mine.filter((t) => !STARTED.has(t.status) && t.stops.length > 0);
      const running = fleetTrips.find(
        (t) =>
          t.tone === 'on_time' ||
          t.tone === 'late' ||
          t.tone === 'not_synced' ||
          t.tone === 'breakdown',
      );
      const loading = mine.find((t) => t.status === 'loading' || t.status === 'ready');
      const doneTrips = fleetTrips.filter((t) => t.tone === 'completed');

      let status: FleetStatus = 'at_depot';
      let today: string;
      if (v.status === 'out_of_service') {
        status = 'out_of_service';
        const reason = (v.outOfServiceReason ?? 'Out of service').split(' — ')[0];
        today = `${reason}${v.returnDate ? ` · back ${backAtLabel(v.returnDate)}` : ''}`;
      } else if (running) {
        status = running.tone === 'breakdown' ? 'breakdown' : 'on_road';
        const of = mine.length > 1 ? ` of ${mine.length}` : '';
        const remaining = running.stopsTotal - running.stopsDone;
        today =
          running.tone === 'breakdown'
            ? `Stopped · ${remaining} ${remaining === 1 ? 'stop' : 'stops'} left`
            : running.tone === 'late'
              ? `Trip ${running.tripNumber}${of} · running ${running.label.replace(/^Late /, '')} late`
              : `Trip ${running.tripNumber}${of} · ${running.stopsDone}/${running.stopsTotal} delivered`;
      } else if (loading) {
        const dock = loading.loadingJob?.bay?.replace(/^\D*/, '');
        today =
          doneTrips.length > 0
            ? `Trip ${doneTrips[doneTrips.length - 1].tripNumber} done · Trip ${loading.tripNumber} loading`
            : `Trip ${loading.tripNumber} loading${dock ? ` at dock ${dock}` : ''}`;
      } else if (unstarted.length > 0) {
        today = `Trip ${unstarted[0].tripNumber} waiting to load`;
      } else if (doneTrips.length > 0) {
        today = `Trip ${doneTrips[doneTrips.length - 1].tripNumber} done`;
      } else {
        today = 'No trips today';
      }

      const driver = mine.find((t) => t.assignedDriver)?.assignedDriver ?? v.driver;
      const phone = driver?.driverProfile?.phones[0]?.phoneNumber ?? driver?.phone ?? null;

      // Fuel this week: the estimate from each planned route (the board does not total real fills).
      let usedL = 0;
      for (const t of weekTrips.filter((w) => w.vehicleId === v.id && w.stops.length > 0)) {
        const stops = sortStopsByWindow(t.stops.map((s) => toStopView(s.order)));
        usedL += estimateTripLitres(stops, lookup, toVehicle(v)) ?? t.plannedLitres ?? 0;
      }
      const quota = v.weeklyFuelQuotaL ?? 0;

      return {
        id: v.id,
        plate: v.numberPlate ?? v.id,
        driverName: driver ? driverName(driver.name) : null,
        driverPhone: phone,
        type: v.type,
        temp: v.temp === 'reefer' ? 'reefer' : 'ambient',
        weightCapKg: v.weightCapKg,
        volumeCapM3: v.volumeCapM3,
        homeDepot: v.depotId,
        status,
        today,
        outOfServiceReason:
          v.status === 'out_of_service' ? (v.outOfServiceReason ?? 'Out of service') : null,
        returnDate: v.status === 'out_of_service' && v.returnDate ? isoDateTime(v.returnDate) : null,
        trips: fleetTrips,
        plannedTrips: unstarted.map((t) => ({ tripNumber: t.tripNumber, stops: t.stops.length })),
        fuel:
          quota > 0
            ? {
                usedL: Math.round(usedL),
                quotaL: Math.round(quota),
                pct: Math.round((usedL / quota) * 100),
              }
            : null,
      };
    });

    return {
      date,
      depotId,
      vehicles: out,
      counts: {
        all: out.length,
        onRoad: out.filter((v) => v.status === 'on_road' || v.status === 'breakdown').length,
        atDepot: out.filter((v) => v.status === 'at_depot').length,
        outOfService: out.filter((v) => v.status === 'out_of_service').length,
      },
    };
  }

  private async one(me: Me, id: string): Promise<FleetVehicle> {
    const vehicle = (await this.day(me)).vehicles.find((v) => v.id === id);
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  /** Takes a vehicle out of service. Trips that have not started go back to the plan; a trip on the road carries on. */
  async markOutOfService(
    me: Me,
    id: string,
    dto: OutOfServiceRequest,
  ): Promise<OutOfServiceResult> {
    const depotId = this.depotOf(me);
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, depotId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.status === 'out_of_service')
      throw new BadRequestException('This vehicle is already out of service');
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Say why the vehicle is out of service');
    let returnDate: Date | null = null;
    if (dto.returnDate) {
      returnDate = new Date(dto.returnDate);
      if (Number.isNaN(returnDate.getTime()))
        throw new BadRequestException('Return time is not a valid date');
    }

    const today = dateOnly(this.clock.today());
    let tripsReturned = 0;
    let ordersReturned = 0;
    await this.prisma.$transaction(async (tx) => {
      const trips = await tx.trip.findMany({
        where: {
          vehicleId: id,
          serviceDate: { gte: today },
          status: { in: ['planning', 'published'] },
        },
        include: { stops: true },
      });
      for (const t of trips) {
        const orderIds = t.stops.map((s) => s.orderId);
        if (orderIds.length > 0) {
          await tx.order.updateMany({
            where: { id: { in: orderIds } },
            data: { status: 'waiting' },
          });
        }
        ordersReturned += orderIds.length;
        await tx.trip.delete({ where: { id: t.id } });
        tripsReturned += 1;
      }
      await tx.vehicle.update({
        where: { id },
        data: {
          status: 'out_of_service',
          outOfServiceReason: dto.note?.trim() ? `${reason} — ${dto.note.trim()}` : reason,
          returnDate,
        },
      });
    });
    return { vehicle: await this.one(me, id), tripsReturned, ordersReturned };
  }

  /** A new vehicle at the dispatcher's depot, free from today. The plate (upper case) is its id. */
  async addVehicle(me: Me, dto: AddVehicleRequest): Promise<FleetVehicle> {
    const plate = dto.plate.trim().replace(/\s+/g, ' ').toUpperCase();
    const taken = await this.prisma.vehicle.findFirst({
      where: { OR: [{ id: plate }, { numberPlate: plate }] },
    });
    if (taken) throw new ConflictException(`A vehicle with plate ${plate} already exists.`);
    await this.prisma.vehicle.create({
      data: {
        id: plate,
        numberPlate: plate,
        depotId: this.depotOf(me),
        type: dto.type,
        temp: dto.temp,
        weightCapKg: dto.weightCapKg,
        volumeCapM3: dto.volumeCapM3,
        kmPerL: dto.kmPerL ?? null,
        weeklyFuelQuotaL: dto.weeklyFuelQuotaL ?? null,
        status: 'available',
      },
    });
    return this.one(me, plate);
  }

  async backInService(me: Me, id: string): Promise<FleetVehicle> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, depotId: this.depotOf(me) },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    await this.prisma.vehicle.update({
      where: { id },
      data: { status: 'available', outOfServiceReason: null, returnDate: null },
    });
    return this.one(me, id);
  }
}
