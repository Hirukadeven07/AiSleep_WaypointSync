import { Injectable } from '@nestjs/common';
import { DEFER_REASONS, type AutoAssignProposal, type Me } from '@waypoint/contracts';
import {
  DomainError,
  proposeAssignments,
  sortStopsByWindow,
  type Assignment,
  type TripView,
} from '@waypoint/domain';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PlanDeferService } from './plan-defer.service';
import { PlanEditService } from './plan-edit.service';
import { PlanService } from './plan.service';
import { orderInclude, toOutlet, toStopView, toVehicle, tripInclude } from './plan.mapper';

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isProposal = (id: string | null) => id !== null && id.startsWith('proposal-');

/** Greedy auto-assign from the domain package: propose first, apply only when asked. */
@Injectable()
export class PlanAutoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edit: PlanEditService,
    private readonly plan: PlanService,
    private readonly defer: PlanDeferService,
    private readonly clock: ClockService,
  ) {}

  private serviceDate(date?: string) {
    if (date) return date;
    const d = dateOnly(this.clock.today());
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  private async run(me: Me, date?: string) {
    const depotId = this.edit.depotOf(me);
    const day = dateOnly(this.serviceDate(date));
    const [waiting, trips, vehicles, lookup] = await Promise.all([
      this.prisma.order.findMany({
        where: { deliveryDate: day, status: 'waiting', stop: null, store: { depotId } },
        include: orderInclude,
      }),
      this.prisma.trip.findMany({
        where: { depotId, serviceDate: day, status: 'planning' },
        include: tripInclude,
      }),
      this.prisma.vehicle.findMany({ where: { depotId, status: 'available' } }),
      this.plan.loadLookup(),
    ]);

    const views: TripView[] = trips.map((t) => ({
      trip: {
        id: t.id,
        vehicleId: t.vehicleId,
        serviceDate: this.serviceDate(date),
        tripNumber: t.tripNumber as 1 | 2,
      },
      vehicle: toVehicle(t.vehicle),
      stops: sortStopsByWindow(t.stops.map((s) => toStopView(s.order))),
    }));
    const taken: Record<string, number> = {};
    for (const t of trips) taken[t.vehicleId] = (taken[t.vehicleId] ?? 0) + 1;

    const assignments = proposeAssignments({
      orders: waiting.map((o) => toStopView(o).order),
      outlets: waiting.map((o) => toOutlet(o.store)),
      vehicles: vehicles.map(toVehicle),
      trips: views,
      tripsTakenToday: taken,
      lookup,
    });
    return { depotId, day, waiting, trips, vehicles, assignments, taken };
  }

  private reasonFor(row: { temp: string; store: { parkingConstraint: string } }) {
    if (row.temp === 'chilled') return DEFER_REASONS[0];
    if (row.store.parkingConstraint === 'van_only') return DEFER_REASONS[1];
    return DEFER_REASONS[2];
  }

  async propose(me: Me, date?: string): Promise<AutoAssignProposal> {
    const { waiting, trips, vehicles, assignments } = await this.run(me, date);
    const byId = new Map(waiting.map((o) => [o.id, o]));
    const placed = assignments.filter((a) => a.assigned);
    const missed = assignments.filter((a) => !a.assigned);

    // The first order on a brand-new trip comes back with no trip id; later ones name it `proposal-…`.
    const opening = placed.filter((a: Assignment) => a.tripId === null);
    const plateOf = new Map(vehicles.map((v) => [v.id, v.plate ?? v.id]));
    const taken = new Map<string, number>();
    for (const t of trips) taken.set(t.vehicleId, (taken.get(t.vehicleId) ?? 0) + 1);
    const newTrips = opening.map((a) => {
      const n = (taken.get(a.vehicleId) ?? 0) + 1;
      taken.set(a.vehicleId, n);
      return { label: `${plateOf.get(a.vehicleId)} · Trip ${n}`, run: (n === 1 ? 1 : 2) as 1 | 2 };
    });

    // Capacity used = planned weight against the vehicles that end up with a trip.
    const weight = new Map<string, number>();
    const capOf = new Map<string, number>();
    for (const t of trips) {
      capOf.set(t.vehicleId, t.vehicle.weightCapKg);
      weight.set(
        t.vehicleId,
        (weight.get(t.vehicleId) ?? 0) + t.stops.reduce((s, st) => s + st.order.weightKg, 0),
      );
    }
    for (const a of placed) {
      const v = vehicles.find((x) => x.id === a.vehicleId)!;
      capOf.set(v.id, v.weightCapKg);
      weight.set(v.id, (weight.get(v.id) ?? 0) + (byId.get(a.orderId)?.weightKg ?? 0));
    }
    const cap = [...capOf.values()].reduce((a, b) => a + b, 0);
    const used = [...weight.values()].reduce((a, b) => a + b, 0);

    return {
      tripsAfter: trips.length + newTrips.length,
      ordersPlaced: placed.length,
      movedToLater: missed.length,
      capacityUsedPct: cap > 0 ? Math.round((used / cap) * 100) : 0,
      addedToExisting: placed.filter((a) => a.tripId !== null && !isProposal(a.tripId)).length,
      newTrips,
      deferred: missed.map((a) => {
        const row = byId.get(a.orderId)!;
        return {
          orderId: a.orderId,
          storeName: row.store.displayName ?? row.store.id,
          reason: this.reasonFor(row),
        };
      }),
    };
  }

  /** Saves the proposal: creates the new trips, places the orders and moves the rest to later. */
  async apply(me: Me, date?: string): Promise<AutoAssignProposal> {
    const { depotId, day, waiting, assignments, taken } = await this.run(me, date);
    const proposal = await this.propose(me, date);
    const byId = new Map(waiting.map((o) => [o.id, o]));
    const made = new Map<string, string>(); // proposal trip id -> real trip id
    const count: Record<string, number> = { ...taken };

    for (const a of assignments) {
      const row = byId.get(a.orderId)!;
      if (!a.assigned) {
        await this.defer.defer(me, a.orderId, this.reasonFor(row));
        continue;
      }
      let tripId = a.tripId;
      if (tripId === null || isProposal(tripId)) {
        if (tripId === null) {
          const n = (count[a.vehicleId] ?? 0) + 1;
          count[a.vehicleId] = n;
          const trip = await this.prisma.trip.create({
            data: {
              vehicleId: a.vehicleId,
              depotId,
              brand: row.brand,
              districtId: row.store.districtId,
              serviceDate: day,
              tripNumber: n === 1 ? 1 : 2,
              status: 'planning',
            },
          });
          made.set(`proposal-${a.vehicleId}-${n}`, trip.id);
          tripId = trip.id;
        } else {
          tripId = made.get(tripId) ?? tripId;
        }
      }
      try {
        await this.edit.assign(me, a.orderId, tripId);
      } catch (e) {
        // A rule the proposal could not foresee: that order goes to a later day instead.
        if (!(e instanceof DomainError)) throw e;
        await this.defer.defer(me, a.orderId, this.reasonFor(row));
      }
    }
    return proposal;
  }
}
