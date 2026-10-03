import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateTripRequest,
  Me,
  NewTripOptions,
  NewTripVehicle,
  PlanStore,
  PlanTrip,
  RemoveTripResult,
  TripSuggestion,
} from '@waypoint/contracts';
import { allDistricts, districtKey } from '@waypoint/contracts';
import { DomainError, evaluateNewTrip, formatMinutes, type Depot } from '@waypoint/domain';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PlanEditService } from './plan-edit.service';
import { DEPART_MIN, PlanService } from './plan.service';
import { orderInclude, toVehicle, tripInclude } from './plan.mapper';

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
const kg = (n: number) => n.toLocaleString('en-US');
const kind = (v: { type: string; temp: string }) =>
  v.type === 'van' ? 'Van' : v.temp === 'reefer' ? 'Refrigerated truck' : 'Ambient truck';

/** Creating a trip, and the orders that would fit on it. */
@Injectable()
export class PlanTripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edit: PlanEditService,
    private readonly plan: PlanService,
    private readonly clock: ClockService,
  ) {}

  private serviceDate(date?: string) {
    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    if (date) return date;
    const d = dateOnly(this.clock.today());
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  async options(me: Me, date?: string): Promise<NewTripOptions> {
    const depotId = this.edit.depotOf(me);
    const day = dateOnly(this.serviceDate(date));
    const [vehicles, trips, districts] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { depotId }, orderBy: { plate: 'asc' } }),
      this.prisma.trip.findMany({ where: { depotId, serviceDate: day } }),
      this.prisma.district.findMany({ where: { depotId, served: true }, orderBy: { name: 'asc' } }),
    ]);

    const forRun = (run: 1 | 2): NewTripVehicle[] =>
      vehicles.map((v) => {
        const mine = trips.filter((t) => t.vehicleId === v.id);
        const taken = mine.some((t) => t.tripNumber === run);
        const back =
          run === 2 && mine.length > 0
            ? mine[0].plannedMinutes != null
              ? ` · back at depot ${formatMinutes(DEPART_MIN[mine[0].brand] + mine[0].plannedMinutes)}`
              : ''
            : '';
        let unavailable: string | null = null;
        if (v.status === 'out_of_service') {
          unavailable = v.returnDate
            ? `Out of service until ${v.returnDate.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}`
            : 'Out of service';
        } else if (taken) {
          unavailable = `Already has trip ${run}`;
        } else if (mine.length >= 2) {
          unavailable = 'Already has two trips';
        }
        return {
          id: v.id,
          label: `${v.plate ?? v.id} · ${kind(v)}`,
          detail: `${kg(v.weightCapKg)} kg · ${v.volumeCapM3} m³${back}`,
          tag: unavailable ? 'Unavailable' : v.temp === 'reefer' ? 'Best for Fresh' : null,
          available: unavailable === null,
          unavailable,
        };
      });

    return {
      runs: [
        { tripNumber: 1, label: 'Trip 1 · morning' },
        { tripNumber: 2, label: 'Trip 2 · afternoon' },
      ],
      vehicles: { '1': forRun(1), '2': forRun(2) },
      // Every district of Sri Lanka; the depot's served ones keep their stored spelling.
      districts: allDistricts(districts.map((d) => d.name)),
    };
  }

  async create(me: Me, dto: CreateTripRequest & { date?: string }): Promise<PlanTrip> {
    const depotId = this.edit.depotOf(me);
    const day = dateOnly(this.serviceDate(dto.date));
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, depotId } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.status !== 'available') {
      throw new DomainError(
        'VEHICLE_UNAVAILABLE',
        `${vehicle.plate ?? vehicle.id} is not available.`,
      );
    }
    const districts = await this.resolveDistricts(dto.districts);

    const already = await this.prisma.trip.findMany({
      where: { vehicleId: vehicle.id, serviceDate: day },
    });
    const limit = evaluateNewTrip(toVehicle(vehicle), already.length);
    if (limit.length > 0) throw new DomainError(limit[0].code, limit[0].message);
    if (already.some((t) => t.tripNumber === dto.tripNumber)) {
      throw new DomainError(
        'VEHICLE_UNAVAILABLE',
        `${vehicle.plate ?? vehicle.id} already has trip ${dto.tripNumber}.`,
      );
    }

    const trip = await this.prisma.trip.create({
      data: {
        vehicleId: vehicle.id,
        depotId,
        brand: dto.brand,
        districtId: districts[0].id,
        extraDistricts: { connect: districts.slice(1).map((d) => ({ id: d.id })) },
        serviceDate: day,
        tripNumber: dto.tripNumber,
        status: 'planning',
      },
      include: tripInclude,
    });
    return this.plan.planTrip(trip, await this.plan.loadLookup(), depotId as Depot);
  }

  /**
   * Take a trip off the plan: its orders go back to the queue and the trip is deleted.
   * Only a trip still being planned can go; once sent, loaders and drivers are working from it.
   */
  async remove(me: Me, tripId: string): Promise<RemoveTripResult> {
    const trip = await this.edit.loadTrip(me, tripId);
    if (trip.status !== 'planning') {
      throw new DomainError(
        'PLAN_LOCKED',
        `${trip.vehicle.plate ?? trip.vehicleId} · Trip ${trip.tripNumber} has been sent to the dock and driver, so it cannot be removed.`,
      );
    }
    const orderIds = trip.stops.map((s) => s.orderId);
    await this.prisma.$transaction(async (tx) => {
      if (orderIds.length > 0) {
        await tx.order.updateMany({ where: { id: { in: orderIds } }, data: { status: 'waiting' } });
      }
      // Stops go with the trip (cascade).
      await tx.trip.delete({ where: { id: trip.id } });
    });
    return { tripId: trip.id, ordersReturned: orderIds.length };
  }

  /** The depot's stores in a district, optionally of one brand, A to Z. */
  async stores(me: Me, district: string, brand?: string): Promise<PlanStore[]> {
    if (!district?.trim()) throw new BadRequestException('district is required');
    if (brand && !['Fresh', 'Style', 'Tech'].includes(brand)) {
      throw new BadRequestException('brand must be Fresh, Style or Tech');
    }
    const rows = await this.prisma.store.findMany({
      where: {
        depotId: this.edit.depotOf(me),
        district: { name: { equals: district.trim(), mode: 'insensitive' } },
        ...(brand ? { brand: brand as PlanStore['brand'] } : {}),
      },
      include: { district: true },
    });
    return rows
      .map((s) => ({
        id: s.id,
        name: s.displayName ?? s.id,
        brand: s.brand,
        district: s.district.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * District rows for the picked names, in the order picked (the first is the trip's main district).
   * A district of Sri Lanka the depot does not serve yet is added as not served, without travel data.
   */
  private async resolveDistricts(names: string[]) {
    const keys = [...new Set(names.map(districtKey))];
    const rows = await this.prisma.district.findMany();
    const known = allDistricts(rows.map((r) => r.name));
    if (keys.length === 0 || keys.some((k) => !known.some((d) => districtKey(d) === k))) {
      throw new BadRequestException('Pick one or more districts of Sri Lanka');
    }
    return Promise.all(
      keys.map(
        (k) =>
          rows.find((r) => districtKey(r.name) === k) ??
          this.prisma.district.create({
            data: { name: known.find((d) => districtKey(d) === k)!, served: false },
          }),
      ),
    );
  }

  /** Waiting orders of the trip's brand and districts that the rules let onto it, oldest waits first. */
  async suggestions(me: Me, tripId: string): Promise<TripSuggestion[]> {
    const trip = await this.edit.loadTrip(me, tripId);
    const lookup = await this.plan.loadLookup();
    const today = this.clock.today();
    const rows = await this.prisma.order.findMany({
      where: {
        deliveryDate: trip.serviceDate,
        status: 'waiting',
        stop: null,
        brand: trip.brand,
        store: {
          depotId: trip.depotId,
          districtId: { in: [trip.districtId, ...trip.extraDistricts.map((d) => d.id)] },
        },
      },
      include: orderInclude,
    });

    const fits = rows.filter((o) => this.edit.evaluate(o, trip, lookup).blocks.length === 0);
    return fits
      .map((o) => ({ row: o, view: this.plan.planOrder(o, today) }))
      .sort(
        (a, b) =>
          Number(b.view.waitingSinceYesterday) - Number(a.view.waitingSinceYesterday) ||
          a.view.windowOpenMin - b.view.windowOpenMin,
      )
      .slice(0, 5)
      .map(({ view }) => ({
        orderId: view.id,
        storeName: view.storeName,
        waitingSinceYesterday: view.waitingSinceYesterday,
        windowOpenMin: view.windowOpenMin,
        windowCloseMin: view.windowCloseMin,
        weightKg: view.weightKg,
      }));
  }
}
