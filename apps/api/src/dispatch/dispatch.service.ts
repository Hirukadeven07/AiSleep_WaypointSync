import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ORDER_CUTOFF_MIN,
  ROAD_ISSUE_LABEL,
  WAIT_ALERT_MIN,
  type AttentionItem,
  type LiveDay,
  type LiveStatus,
  type LiveStop,
  type LiveTrip,
  type Me,
  type NotifyPreview,
  type DispatcherNotices,
  type NoticeCategory,
  type NotifyResult,
  type RoadIssuePayload,
} from '@waypoint/contracts';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { BREAK_EVENT_TYPES, foldBreaks } from '../driver/driver-breaks';
import { alertLongWaits } from '../driver/driver-notices';
import { NoticeHub } from '../notifications/notice-hub';
import { NOTIFIER, type Notifier } from '../notifications/notifier.interface';
import { tripAreaLabel } from '../plan/plan.mapper';

/** A trip counts as late from this many minutes past a stop's window. */
const LATE_MIN = 5;
/** A trip on the road that has not synced for this long is shown as "Not synced". */
const SYNC_STALE_MIN = 20;
/** A stop is "at risk" when its ETA is within this many minutes of the end of its window. */
const AT_RISK_MIN = 15;
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
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    private readonly hub: NoticeHub,
  ) {}

  /** The stores a delay would reach (their ETA misses the window or is within 15 minutes of it) and the message they would get. */
  async notifyPreview(me: Me, tripId: string): Promise<NotifyPreview> {
    const day = await this.live(me);
    const trip = day.trips.find((t) => t.id === tripId);
    if (!trip) throw new NotFoundException('Trip not found');
    const plate = trip.plate ?? trip.vehicleId;
    const minutes = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    const affected = trip.stops.filter(
      (s) =>
        !DONE.has(s.status) &&
        s.etaMin !== null &&
        (s.missBy !== null || s.windowCloseMin - s.etaMin <= AT_RISK_MIN),
    );
    const late = trip.lateMin ?? Math.max(0, ...trip.stops.map((s) => s.missBy ?? 0));
    return {
      tripId,
      subtitle: `${plate} · Trip ${trip.tripNumber}  ·  running about ${late} min late`,
      recipients: affected.map((s) => ({
        stopId: s.id,
        storeName: s.storeName,
        detail:
          s.missBy !== null
            ? `New ETA ${minutes(s.etaMin!)} · window was ${minutes(s.windowOpenMin)}-${minutes(s.windowCloseMin)}`
            : `New ETA ${minutes(s.etaMin!)} · window ${minutes(s.windowOpenMin)}-${minutes(s.windowCloseMin)}`,
      })),
      message: `Hi, your ${trip.brand} delivery on ${plate} is running about ${late} min late. New ETA is shown in your app. Sorry for the wait.`,
    };
  }

  /** Tells the stores of the chosen stops, in their app. */
  async notify(me: Me, tripId: string, stopIds: string[], message: string): Promise<NotifyResult> {
    if (!me.depotId) throw new ForbiddenException('This account has no depot');
    const text = message.trim();
    if (!text || stopIds.length === 0)
      throw new BadRequestException('Choose at least one store and write a message');
    const stops = await this.prisma.tripStop.findMany({
      where: { id: { in: stopIds }, tripId, trip: { depotId: me.depotId } },
      include: { order: true },
    });
    if (stops.length !== new Set(stopIds).size)
      throw new NotFoundException('Stop not found on this trip');
    const stores = [...new Set(stops.map((s) => s.order.storeId))];
    for (const storeId of stores) {
      const users = await this.prisma.user.findMany({ where: { storeId, role: 'store' } });
      for (const u of users) {
        await this.notifier.notify({
          userId: u.id,
          title: 'Delivery running late',
          body: text,
          link: '/store',
        });
      }
    }
    return { sent: stores.length };
  }

  /** Dispatch has dealt with a driver's SOS. Clears the alert on the board and on the driver's phone. */
  async resolveSos(me: Me, id: string, note?: string): Promise<{ ok: true }> {
    if (!me.depotId) throw new ForbiddenException('This account has no depot');
    const sos = await this.prisma.driverIncident.findFirst({
      where: {
        id,
        incidentType: 'sos',
        OR: [{ trip: { depotId: me.depotId } }, { vehicle: { depotId: me.depotId } }],
      },
    });
    if (!sos) throw new NotFoundException('SOS not found');
    if (!sos.resolvedAt) {
      const now = this.clock.now();
      await this.prisma.driverIncident.update({
        where: { id },
        data: {
          resolvedAt: now,
          acknowledgedAt: sos.acknowledgedAt ?? now,
          acknowledgedBy: sos.acknowledgedBy ?? me.id,
          resolution: note?.trim() || 'Handled by dispatch',
        },
      });
    }
    return { ok: true };
  }

  /** The dispatcher's unseen notifications, newest first, grouped by where they lead. */
  async notices(me: Me): Promise<DispatcherNotices> {
    const rows = await this.prisma.notification.findMany({
      where: { userId: me.id, read: false },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const notices = rows.map((n) => ({
      id: n.id,
      category: noticeCategory(n.link),
      title: n.title,
      body: n.body,
      link: n.link,
      createdAt: n.createdAt.toISOString(),
    }));
    const count = (c: NoticeCategory) => notices.filter((n) => n.category === c).length;
    return {
      notices,
      counts: {
        all: notices.length,
        incidents: count('incidents'),
        stores: count('stores'),
        planning: count('planning'),
      },
    };
  }

  async markNoticeRead(me: Me, id: string): Promise<{ ok: true }> {
    await this.prisma.notification.updateMany({
      where: { id, userId: me.id },
      data: { read: true },
    });
    return { ok: true };
  }

  async live(me: Me): Promise<LiveDay> {
    if (!me.depotId) throw new ForbiddenException('This account has no depot');
    const depotId = me.depotId;
    const date = this.clock.today();
    const day = dateOnly(date);
    const nextDay = new Date(day);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const now = this.clock.now();

    const [rows, events, pings, carry, tomorrowOrders, sosRows] = await Promise.all([
      this.prisma.trip.findMany({
        // Trips still being planned show too ("planned"), so a trip is visible as soon as it exists.
        where: { depotId, serviceDate: day },
        include: {
          vehicle: { include: { driver: driverInclude } },
          assignedDriver: driverInclude,
          district: true,
          extraDistricts: { orderBy: { name: 'asc' } },
          stops: {
            orderBy: { sequence: 'asc' },
            include: {
              order: { include: { store: { include: { phones: true } } } },
              receipt: true,
              flags: true,
            },
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
      // Today's driver SOS alerts that are still open: an old one nobody closed does not haunt
      // every later day.
      this.prisma.driverIncident.findMany({
        where: {
          incidentType: 'sos',
          resolvedAt: null,
          raisedAt: { gte: new Date(`${date}T00:00:00+05:30`) },
          OR: [{ trip: { depotId } }, { vehicle: { depotId } }],
        },
        include: { driver: { include: { user: true, phones: true } }, vehicle: true },
        orderBy: { raisedAt: 'asc' },
      }),
    ]);

    // Dispatch is alerted once per long wait, whether the board or the driver's phone notices first.
    this.hub.publishAll(
      await alertLongWaits(
        this.prisma,
        now,
        rows.map((t) => t.id),
      ),
    );

    // A driver on a break shows on their trip's card.
    const breakEvents = await this.prisma.driverEvent.findMany({
      where: { type: { in: BREAK_EVENT_TYPES }, tripId: { in: rows.map((t) => t.id) } },
      select: { tripId: true, type: true, createdOnPhoneAt: true },
    });
    const onBreak = new Map<string, Date>();
    for (const id of new Set(breakEvents.map((e) => e.tripId))) {
      const since = foldBreaks(
        breakEvents
          .filter((e) => e.tripId === id)
          .map((e) => ({ type: e.type, at: e.createdOnPhoneAt })),
      ).onBreakSince;
      if (id && since) onBreak.set(id, since);
    }

    // The latest road issue per trip; a "reported" one that was not resolved pauses the trip.
    const roadEvents = await this.prisma.driverEvent.findMany({
      where: { type: 'ROAD_ISSUE', tripId: { in: rows.map((t) => t.id) } },
      orderBy: { appliedAt: 'asc' },
      select: { tripId: true, payload: true, createdOnPhoneAt: true },
    });
    const openIssue = new Map<string, { payload: RoadIssuePayload; at: Date }>();
    for (const e of roadEvents) {
      const payload = e.payload as unknown as RoadIssuePayload;
      if (!e.tripId) continue;
      if (payload.status === 'reported')
        openIssue.set(e.tripId, { payload, at: e.createdOnPhoneAt });
      else openIssue.delete(e.tripId);
    }

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
      const phone = driver?.driverProfile?.phones[0]?.phoneNumber ?? null;
      const plate = t.vehicle.numberPlate ?? t.vehicleId;

      const onRoad = t.status === 'on_road';

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
      const departedAt = t.loadSession?.departedAt ?? t.startingTime ?? null;
      // Quiet since the last sync, or since departure when the driver has not synced at all.
      const quietSince = seen ?? departedAt;
      const staleMin = quietSince
        ? Math.floor((now.getTime() - quietSince.getTime()) / 60000)
        : null;
      const sos = sosRows.filter((d) => d.tripId === t.id);
      const broke =
        t.status === 'breakdown' ||
        t.incidents.some(
          (i) => i.type === 'breakdown' && i.status !== 'resolved' && i.status !== 'closed',
        );
      const notSynced = onRoad && staleMin !== null && staleMin >= SYNC_STALE_MIN;
      const missing = t.stops.flatMap((s) => s.flags).filter((f) => f.type === 'missing');
      const missingCount = missing.reduce((sum, f) => sum + (f.qty ?? 1), 0);

      // Every stop finished (or moved to another day): the trip is done even before it is closed.
      const allDone = t.stops.length > 0 && t.stops.every((s) => DONE.has(s.status));

      let live: LiveStatus;
      if (t.status === 'completed' || (onRoad && allDone && !broke)) live = 'completed';
      else if (broke) live = 'breakdown';
      else if (notSynced) live = 'not_synced';
      else if (onRoad) live = lateMin >= LATE_MIN ? 'late' : 'on_time';
      else if (t.status === 'planning') live = 'planned';
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
      for (const d of sos) {
        attention.push({
          id: `sos-${d.id}`,
          kind: 'sos',
          title: `SOS from ${person(d.driver.user.name)} on ${plate}`,
          text: `${d.message ?? 'No message'} · raised ${clockText(d.raisedAt)}.`,
          tripId: t.id,
          phone,
          incidentId: d.id,
        });
      }
      // A driver at a store that has not checked the goods for WAIT_ALERT_MIN minutes: one alert per stop.
      for (const s of t.stops) {
        if (!['arrived', 'waiting'].includes(s.status) || !s.arrivedAt || s.storeConfirmedAt)
          continue;
        const waited = Math.floor((now.getTime() - s.arrivedAt.getTime()) / 60000);
        if (waited < WAIT_ALERT_MIN) continue;
        const store = s.order.store.displayName ?? s.order.store.id;
        const outletPhone =
          s.order.store.phones.find((p) => p.label === 'shop') ?? s.order.store.phones[0];
        attention.push({
          id: `waiting-${s.id}`,
          kind: 'waiting',
          title: `${plate} waiting ${waited} min at ${store}`,
          text: `Arrived ${clockText(s.arrivedAt)}. The store has not checked the goods yet; the driver was asked to call them${outletPhone ? ` on ${outletPhone.phoneNo}` : ''}.`,
          tripId: t.id,
          phone,
        });
      }
      const issue = openIssue.get(t.id);
      if (issue) {
        const { payload } = issue;
        attention.push({
          id: `road-${t.id}`,
          kind: 'road_issue',
          title: `${ROAD_ISSUE_LABEL[payload.kind] ?? 'Road issue'} · ${plate} paused`,
          text: `${payload.note ? `${payload.note} · ` : ''}Reported ${clockText(issue.at)}. The next stop waits until the driver resumes.`,
          tripId: t.id,
          phone,
          photo: payload.photo ?? null,
          mapUrl: payload.location
            ? `https://www.google.com/maps/search/?api=1&query=${payload.location.lat},${payload.location.lng}`
            : null,
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
        plate: t.vehicle.numberPlate,
        tripNumber: t.tripNumber,
        tripsToday: perVehicle.get(t.vehicleId) ?? 1,
        brand: t.brand,
        district: tripAreaLabel(t),
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
        lastSyncAt: seen?.toISOString() ?? null,
        departedAt: departedAt?.toISOString() ?? null,
        openSos: sos.length,
        onBreakSince: onBreak.get(t.id)?.toISOString() ?? null,
        backAt: t.status === 'completed' ? (t.endingTime?.toISOString() ?? null) : null,
        bay: t.loadingJob?.bay ?? null,
        missingCount,
        previousTrip: previous(rows, t),
        nextTrip: next(rows, t),
        hasIssue:
          broke ||
          notSynced ||
          openIssue.has(t.id) ||
          sos.length > 0 ||
          missingCount > 0 ||
          stops.some((s) => s.issueNote !== null),
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
    // An SOS without a trip today still needs dispatch, so it counts and shows too.
    const tripIds = new Set(rows.map((t) => t.id));
    for (const d of sosRows.filter((x) => !x.tripId || !tripIds.has(x.tripId))) {
      attention.push({
        id: `sos-${d.id}`,
        kind: 'sos',
        title: `SOS from ${person(d.driver.user.name)}${d.vehicle ? ` on ${d.vehicle.numberPlate ?? d.vehicle.id}` : ''}`,
        text: `${d.message ?? 'No message'} · raised ${clockText(d.raisedAt)}.`,
        tripId: d.tripId ?? '',
        phone: d.driver.phones[0]?.phoneNumber ?? null,
        incidentId: d.id,
      });
    }
    const sosOpen = sosRows.length;
    const incidentParts = [
      sosOpen > 0 ? `${sosOpen} SOS` : null,
      breakdowns > 0 ? `${breakdowns} ${breakdowns === 1 ? 'breakdown' : 'breakdowns'}` : null,
      missingTrips > 0 ? `${missingTrips} missing ${missingTrips === 1 ? 'item' : 'items'}` : null,
    ].filter(Boolean);

    const minutesNow = this.clock.minutesNow();
    return {
      date,
      depotId,
      asOf: now.toISOString(),
      liveSince: departures[0]?.toISOString() ?? null,
      vehiclesWorking: new Set(
        trips.filter((t) => t.live !== 'completed' && t.live !== 'planned').map((t) => t.vehicleId),
      ).size,
      kpis: {
        tripsOnRoad: trips.filter((t) => t.status === 'on_road' || t.status === 'breakdown').length,
        dispatched,
        deliveriesDone: trips.reduce((sum, t) => sum + t.stopsDone, 0),
        deliveriesTotal: trips.reduce((sum, t) => sum + t.stopsTotal, 0),
        late: late.length,
        avgLateMin: late.length
          ? Math.round(late.reduce((sum, t) => sum + (t.lateMin ?? 0), 0) / late.length)
          : 0,
        openIncidents: sosOpen + breakdowns + missingTrips,
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
      tomorrowTrips: await this.upcoming(depotId, nextDay),
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

  /**
   * Trips planned for a later day, shaped like live rows so the board can list them: nothing has
   * moved yet, so they are "planned" until sent to the dock and driver, then "assigned".
   */
  private async upcoming(depotId: string, day: Date): Promise<LiveTrip[]> {
    const rows = await this.prisma.trip.findMany({
      where: { depotId, serviceDate: day },
      include: {
        vehicle: { include: { driver: driverInclude } },
        assignedDriver: driverInclude,
        district: true,
        extraDistricts: { orderBy: { name: 'asc' } },
        stops: { orderBy: { sequence: 'asc' }, include: { order: { include: { store: true } } } },
      },
      orderBy: [{ vehicleId: 'asc' }, { tripNumber: 'asc' }],
    });
    const perVehicle = new Map<string, number>();
    for (const t of rows) perVehicle.set(t.vehicleId, (perVehicle.get(t.vehicleId) ?? 0) + 1);

    return rows.map((t) => {
      const driver = t.assignedDriver ?? t.vehicle.driver;
      const later = rows.find((r) => r.vehicleId === t.vehicleId && r.tripNumber > t.tripNumber);
      return {
        id: t.id,
        vehicleId: t.vehicleId,
        plate: t.vehicle.numberPlate,
        tripNumber: t.tripNumber,
        tripsToday: perVehicle.get(t.vehicleId) ?? 1,
        brand: t.brand,
        district: tripAreaLabel(t),
        vehicleType: t.vehicle.type,
        vehicleTemp: t.vehicle.temp,
        driverName: driver ? person(driver.name) : null,
        driverPhone: driver?.driverProfile?.phones[0]?.phoneNumber ?? null,
        status: t.status,
        live: t.status === 'planning' ? 'planned' : 'assigned',
        lateMin: null,
        notSyncedMin: null,
        stopsDone: 0,
        stopsTotal: t.stops.length,
        weightKg: t.stops.reduce((sum, s) => sum + s.order.weightKg, 0),
        lastPlace: null,
        lastAt: null,
        lastSyncAt: null,
        departedAt: null,
        openSos: 0,
        onBreakSince: null,
        backAt: null,
        bay: null,
        missingCount: 0,
        previousTrip: null,
        nextTrip: later ? { tripNumber: later.tripNumber, stops: later.stops.length } : null,
        hasIssue: false,
        stops: t.stops.map((s) => ({
          id: s.id,
          sequence: s.sequence,
          storeName: s.order.store.displayName ?? s.order.store.id,
          status: s.status,
          windowOpenMin: s.order.store.windowOpenMin,
          windowCloseMin: s.order.store.windowCloseMin,
          etaMin: s.etaMin,
          arrivedAt: null,
          confirmed: false,
          issueNote: null,
          missBy: null,
        })),
      };
    });
  }
}

/** Store reports lead to the board, new orders to planning; everything else is an incident. */
function noticeCategory(link: string | null): NoticeCategory {
  if (link?.startsWith('/dispatch/plan')) return 'planning';
  if (link?.startsWith('/dispatch/board')) return 'stores';
  return 'incidents';
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

type Row = {
  vehicleId: string;
  tripNumber: number;
  status: string;
  endingTime: Date | null;
  stops: { status: string }[];
};

/** The vehicle's earlier trip today, once it is done, for "Trip 1 done · back at depot 10:40". */
function previous(rows: Row[], t: Row) {
  const p = rows
    .filter(
      (r) => r.vehicleId === t.vehicleId && r.tripNumber < t.tripNumber && r.status === 'completed',
    )
    .pop();
  if (!p) return null;
  return {
    tripNumber: p.tripNumber,
    delivered: p.stops.filter((s) => DONE.has(s.status)).length,
    total: p.stops.length,
    backAt: p.endingTime?.toISOString() ?? null,
  };
}

/** The vehicle's later trip today, for "Next: Trip 2 · 6 stops". */
function next(rows: Row[], t: Row) {
  const n = rows.find((r) => r.vehicleId === t.vehicleId && r.tripNumber > t.tripNumber);
  return n ? { tripNumber: n.tripNumber, stops: n.stops.length } : null;
}
