import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ORDER_CUTOFF_MIN,
  type AttentionItem,
  type LiveDay,
  type LiveStatus,
  type LiveStop,
  type LiveTrip,
  type Me,
} from '@waypoint/contracts';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';

/** A trip counts as late from this many minutes past a stop's window. */
const LATE_MIN = 5;
/** A trip on the road that has not synced for this long is shown as "Not synced". */
const SYNC_STALE_MIN = 20;
const DONE = new Set(['delivered', 'confirmed', 'partial', 'deferred']);

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);
const person = (name: string) => name.replace(/\s*\(.*\)\s*$/, '').trim();

const driverInclude = { include: { driverProfile: { include: { phones: true } } } } as const;

type ReceiptLine = { name: string; orderedQty: number; receivedQty: number; issue: string | null };

/** The live day: every trip that has been published, with where it is and what needs attention. */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async live(me: Me): Promise<LiveDay> {
    if (!me.depotId) throw new ForbiddenException('This account has no depot');
    const depotId = me.depotId;
    const date = this.clock.today();
    const day = dateOnly(date);
    const nextDay = new Date(day);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const now = this.clock.now();

    const [rows, events, pings, carry, tomorrowOrders] = await Promise.all([
      this.prisma.trip.findMany({
        where: { depotId, serviceDate: day, status: { not: 'planning' } },
        include: {
          vehicle: { include: { driver: driverInclude } },
          assignedDriver: driverInclude,
          district: true,
          stops: {
            orderBy: { sequence: 'asc' },
            include: { order: { include: { store: true } }, receipt: true, flags: true },
          },
          loadingJob: true,
          loadSession: true,
          incidents: true,
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
      this.prisma.order.findMany({
        where: { deliveryDate: day, movedFromDate: { not: null }, store: { depotId } },
        select: { status: true, stop: { select: { id: true } } },
      }),
      this.prisma.order.count({
        where: {
          deliveryDate: nextDay,
          status: { in: ['waiting', 'planned'] },
          store: { depotId },
        },
      }),
    ]);

    const lastSeen = new Map<string, Date>();
    for (const e of events)
      if (e.tripId && e._max.appliedAt) lastSeen.set(e.tripId, e._max.appliedAt);
    for (const p of pings) {
      const seen = p._max.receivedAt;
      if (seen && (!lastSeen.has(p.tripId) || seen > lastSeen.get(p.tripId)!))
        lastSeen.set(p.tripId, seen);
    }

    const perVehicle = new Map<string, number>();
    for (const t of rows) perVehicle.set(t.vehicleId, (perVehicle.get(t.vehicleId) ?? 0) + 1);

    const attention: AttentionItem[] = [];
    const trips: LiveTrip[] = rows.map((t) => {
      const driver = t.assignedDriver ?? t.vehicle.driver;
      const phone = driver?.driverProfile?.phones[0]?.phoneNumber ?? driver?.phone ?? null;
      const plate = t.vehicle.plate ?? t.vehicleId;

      const stops: LiveStop[] = t.stops.map((s) => {
        const lines = (Array.isArray(s.receipt?.lineResults)
          ? s.receipt?.lineResults
          : []) as unknown as ReceiptLine[];
        const issues = lines.filter((l) => l.issue);
        const open = !DONE.has(s.status);
        const miss = open && s.etaMin != null ? s.etaMin - s.order.store.windowCloseMin : 0;
        return {
          id: s.id,
          sequence: s.sequence,
          storeName: s.order.store.displayName ?? s.order.store.id,
          status: s.status,
          windowOpenMin: s.order.store.windowOpenMin,
          windowCloseMin: s.order.store.windowCloseMin,
          etaMin: s.etaMin,
          arrivedAt: s.arrivedAt?.toISOString() ?? null,
          confirmed: s.storeConfirmedAt !== null,
          issueNote: issues.length
            ? `${issues.length} ${issues.length === 1 ? 'item' : 'items'} ${issues[0].issue}`
            : null,
          missBy: miss > 0 ? miss : null,
        };
      });

      const done = t.stops.filter((s) => DONE.has(s.status));
      const lateMin = Math.max(0, ...stops.map((s) => s.missBy ?? 0));
      const seen = lastSeen.get(t.id) ?? null;
      const staleMin = seen ? Math.floor((now.getTime() - seen.getTime()) / 60000) : null;
      const onRoad = t.status === 'on_road';
      const broke =
        t.status === 'breakdown' ||
        t.incidents.some(
          (i) => i.type === 'breakdown' && i.status !== 'resolved' && i.status !== 'closed',
        );
      const notSynced = onRoad && staleMin !== null && staleMin >= SYNC_STALE_MIN;
      const missing = t.stops.flatMap((s) => s.flags).filter((f) => f.type === 'missing');
      const missingCount = missing.reduce((sum, f) => sum + (f.qty ?? 1), 0);

      let live: LiveStatus;
      if (t.status === 'completed') live = 'completed';
      else if (broke) live = 'breakdown';
      else if (notSynced) live = 'not_synced';
      else if (onRoad) live = lateMin >= LATE_MIN ? 'late' : 'on_time';
      else if (t.status === 'published') live = 'assigned';
      else live = 'loading';

      const last = [...t.stops]
        .filter((s) => s.arrivedAt)
        .sort((a, b) => b.arrivedAt!.getTime() - a.arrivedAt!.getTime())[0];
      const remaining = t.stops.length - done.length;

      if (broke) {
        const reported = t.incidents.find((i) => i.type === 'breakdown')?.createdAt ?? seen;
        attention.push({
          id: `breakdown-${t.id}`,
          kind: 'breakdown',
          title: `${plate} broke down`,
          text: `${remaining} ${t.brand} ${remaining === 1 ? 'stop' : 'stops'} still to deliver.${reported ? ` Driver reported at ${clockText(reported)}.` : ''}`,
          tripId: t.id,
          phone,
        });
      }
      for (const s of t.stops) {
        const lines = (Array.isArray(s.receipt?.lineResults)
          ? s.receipt?.lineResults
          : []) as unknown as ReceiptLine[];
        const bad = lines.find((l) => l.issue === 'damaged');
        if (bad) {
          attention.push({
            id: `damaged-${s.id}`,
            kind: 'damaged',
            title: `1 item damaged on ${plate} (store report)`,
            text: `${s.order.store.displayName ?? s.order.store.id} · ${bad.name} · ${Math.max(1, bad.orderedQty - bad.receivedQty)} of ${bad.orderedQty} damaged`,
            tripId: t.id,
            phone: null,
          });
        }
      }
      if (missingCount > 0) {
        const store = t.stops.find((s) => s.flags.some((f) => f.type === 'missing'))?.order.store;
        attention.push({
          id: `missing-${t.id}`,
          kind: 'missing',
          title: `${missingCount} ${missingCount === 1 ? 'carton' : 'cartons'} short on ${plate} · Trip ${t.tripNumber}`,
          text: `Loader flagged missing items${store ? ` for ${store.displayName ?? store.id}` : ''} before departure.`,
          tripId: t.id,
          phone: null,
        });
      }
      if (notSynced) {
        attention.push({
          id: `sync-${t.id}`,
          kind: 'not_synced',
          title: `${plate} hasn't synced for ${staleMin} min`,
          text: 'Likely a no-signal area. Deliveries will sync when the phone reconnects.',
          tripId: t.id,
          phone,
        });
      }

      return {
        id: t.id,
        vehicleId: t.vehicleId,
        plate: t.vehicle.plate,
        tripNumber: t.tripNumber,
        tripsToday: perVehicle.get(t.vehicleId) ?? 1,
        brand: t.brand,
        district: t.district.name,
        vehicleType: t.vehicle.type,
        vehicleTemp: t.vehicle.temp,
        driverName: driver ? person(driver.name) : null,
        driverPhone: phone,
        status: t.status,
        live,
        lateMin: live === 'late' ? lateMin : null,
        notSyncedMin: notSynced ? staleMin : null,
        stopsDone: done.length,
        stopsTotal: t.stops.length,
        weightKg: t.stops.reduce((sum, s) => sum + s.order.weightKg, 0),
        lastPlace: last ? (last.order.store.displayName ?? last.order.store.id) : null,
        // A trip that stopped syncing shows when it last did; otherwise when it last served a store.
        lastAt: (notSynced ? seen : (last?.arrivedAt ?? seen))?.toISOString() ?? null,
        backAt: t.status === 'completed' ? (t.endingTime?.toISOString() ?? null) : null,
        bay: t.loadingJob?.bay ?? null,
        missingCount,
        hasIssue: broke || notSynced || missingCount > 0 || stops.some((s) => s.issueNote !== null),
        stops,
      };
    });

    const departures = rows
      .map((t) => t.loadSession?.departedAt ?? t.startingTime)
      .filter((d): d is Date => d !== null && d !== undefined)
      .sort((a, b) => a.getTime() - b.getTime());

    const late = trips.filter((t) => t.live === 'late');
    const breakdowns = trips.filter((t) => t.live === 'breakdown').length;
    const missingTrips = trips.filter((t) => t.missingCount > 0).length;
    const dispatched = trips.filter((t) =>
      ['on_road', 'breakdown', 'completed'].includes(t.status),
    ).length;
    const incidentParts = [
      breakdowns > 0 ? `${breakdowns} ${breakdowns === 1 ? 'breakdown' : 'breakdowns'}` : null,
      missingTrips > 0 ? `${missingTrips} missing ${missingTrips === 1 ? 'item' : 'items'}` : null,
    ].filter(Boolean);

    const minutesNow = this.clock.minutesNow();
    return {
      date,
      depotId,
      asOf: now.toISOString(),
      liveSince: departures[0]?.toISOString() ?? null,
      kpis: {
        tripsOnRoad: trips.filter((t) => t.status === 'on_road' || t.status === 'breakdown').length,
        dispatched,
        deliveriesDone: trips.reduce((sum, t) => sum + t.stopsDone, 0),
        deliveriesTotal: trips.reduce((sum, t) => sum + t.stopsTotal, 0),
        late: late.length,
        avgLateMin: late.length
          ? Math.round(late.reduce((sum, t) => sum + (t.lateMin ?? 0), 0) / late.length)
          : 0,
        openIncidents: breakdowns + missingTrips,
        incidentsText: incidentParts.join(' · '),
      },
      counts: {
        all: trips.length,
        onTime: trips.filter((t) => t.live === 'on_time').length,
        late: late.length,
        issue: trips.filter((t) => t.hasIssue).length,
        done: trips.filter((t) => t.live === 'completed').length,
      },
      trips,
      attention,
      carryovers: {
        total: carry.length,
        onTrips: carry.filter((o) => o.stop !== null).length,
        delivered: carry.filter((o) => o.status === 'delivered' || o.status === 'partial').length,
      },
      tomorrow: {
        date: nextDay.toISOString().slice(0, 10),
        ordersReceived: tomorrowOrders,
        cutoffMin: ORDER_CUTOFF_MIN,
        minutesToCutoff: Math.max(0, ORDER_CUTOFF_MIN - minutesNow),
      },
    };
  }
}

/** "10:12" in Colombo time. */
function clockText(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
