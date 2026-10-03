import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  IncidentDetail,
  IncidentKind,
  IncidentList,
  IncidentState,
  IncidentStop,
  IncidentSummary,
  Me,
  ReplacementOption,
  ResolveRequest,
} from '@waypoint/contracts';
import {
  sortStopsByWindow,
  stopEtas,
  type Depot,
  type Lookup,
  type StopEta,
} from '@waypoint/domain';
import { backAtLabel } from '../common/back-at';
import { ClockService, TIME_ZONE } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { NOTIFIER, type Notifier } from '../notifications/notifier.interface';
import { orderInclude, toStopView } from '../plan/plan.mapper';
import { PlanService } from '../plan/plan.service';

const DONE = new Set(['confirmed', 'delivered', 'partial', 'deferred']);
const person = (name: string) => name.replace(/\s*\(.*\)\s*$/, '').trim();
const shortName = (name: string) => {
  const parts = person(name).split(' ');
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};
const clockText = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const timeOf = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(/^0(?=\d:)/, '');
const minuteOfDay = (d: Date) => {
  const [h, m] = timeOf(d).split(':').map(Number);
  return h * 60 + m;
};
const kg = (n: number) => `${Math.round(n).toLocaleString('en-US')} kg`;
/** A date-only value as the store reads it: "Sun 4 Oct". */
const dayText = (d: Date) =>
  d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
/** Trips that can break down: loaded or on the road. */
const BREAKABLE = ['loading', 'ready', 'on_road'];

const KIND_TITLE: Record<IncidentKind, string> = {
  breakdown: 'broke down',
  delay: 'is running late',
  quiet_driver: 'has gone quiet',
  wait_timeout: 'has waited too long at a store',
  missing_items: 'is short of items',
};
const KIND_REASON: Record<IncidentKind, string> = {
  breakdown: 'a breakdown',
  delay: 'a delay',
  quiet_driver: 'a driver who has gone quiet',
  wait_timeout: 'a long wait at a store',
  missing_items: 'missing items',
};
const KIND_HEAD: Record<IncidentKind, string> = {
  breakdown: 'Breakdown',
  delay: 'Delay',
  quiet_driver: 'Driver gone quiet',
  wait_timeout: 'Long wait at a store',
  missing_items: 'Missing items',
};

/** What is kept in Incident.timeline: plain log lines, plus one `resolution` entry once resolved. */
type Entry = {
  at: string;
  text: string;
  /** Set on the first entry when dispatch (not the driver) logged the incident. */
  by?: 'dispatcher';
  resolution?: {
    title: string;
    text: string;
    line: string;
    outcome: string;
    /** The goods the trip still carried when it broke down, for the Details box. */
    goods: string;
    tripId: string | null;
    stops: IncidentStop[];
  };
};
const lastResolution = (log: Entry[]) => [...log].reverse().find((e) => e.resolution);
const entries = (json: unknown): Entry[] => (Array.isArray(json) ? (json as Entry[]) : []);

const driverInclude = { include: { driverProfile: { include: { phones: true } } } } as const;
const tripInclude = {
  vehicle: { include: { driver: driverInclude } },
  assignedDriver: driverInclude,
  district: true,
  loadingJob: { select: { bay: true } },
  stops: { orderBy: { sequence: 'asc' }, include: { order: { include: orderInclude } } },
} satisfies Prisma.TripInclude;
type TripRow = Prisma.TripGetPayload<{ include: typeof tripInclude }>;
type IncidentRow = Prisma.IncidentGetPayload<{
  include: { trip: { include: typeof tripInclude } };
}>;
type Missing = {
  trip: TripRow;
  flags: (Prisma.LoadFlagGetPayload<object> & { stop: TripRow['stops'][number] })[];
};

const stateOf = (status: string): IncidentState =>
  status === 'resolved' || status === 'closed'
    ? 'resolved'
    : status === 'acknowledged'
      ? 'acknowledged'
      : 'open';

type Candidate = {
  option: ReplacementOption;
  etas: StopEta[];
  tripNumber: number;
  travelMin: number;
};

/** Incidents: what went wrong on a trip, and how the dispatcher recovers from a breakdown. */
@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly plan: PlanService,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  private depotOf(me: Me): string {
    if (!me.depotId) throw new ForbiddenException('This account has no depot');
    return me.depotId;
  }

  private driverOf(t: TripRow) {
    const user = t.assignedDriver ?? t.vehicle.driver;
    if (!user) return null;
    return {
      name: person(user.name),
      phone: user.driverProfile?.phones[0]?.phoneNumber ?? user.phone ?? null,
    };
  }

  private minutesSince(d: Date) {
    return Math.max(0, Math.round((this.clock.now().getTime() - d.getTime()) / 60000));
  }

  private summary(i: IncidentRow): IncidentSummary {
    const t = i.trip;
    const kind = i.type as IncidentKind;
    const state = stateOf(i.status);
    const driver = this.driverOf(t);
    const resolution = lastResolution(entries(i.timeline));
    const remaining = t.stops.filter((s) => !DONE.has(s.status)).length;
    const byDispatch = entries(i.timeline)[0]?.by === 'dispatcher';
    const reporter = byDispatch
      ? 'dispatch'
      : driver
        ? `${shortName(driver.name)} (driver)`
        : 'the driver';
    return {
      id: i.id,
      kind,
      title: `${t.vehicle.numberPlate ?? t.vehicleId} ${KIND_TITLE[kind]}`,
      line:
        state === 'resolved'
          ? `${resolution?.resolution?.line ?? 'Resolved'} · ${timeOf(new Date(resolution?.at ?? i.createdAt))}`
          : `Reported by ${reporter} · ${timeOf(i.createdAt)} · ${this.minutesSince(i.createdAt)} min ago`,
      brand: t.brand,
      state,
      stopsAffected: state !== 'resolved' && remaining > 0 ? remaining : null,
      outcome: state === 'resolved' ? (resolution?.resolution?.outcome ?? 'Resolved') : null,
      createdAt: i.createdAt.toISOString(),
    };
  }

  /** Missing goods the loader flagged on a trip that has not left the depot yet. */
  private async missingItems(depotId: string, day: Date): Promise<Missing[]> {
    const flags = await this.prisma.loadFlag.findMany({
      where: {
        type: 'missing',
        stop: {
          trip: { depotId, serviceDate: day, status: { in: ['published', 'loading', 'ready'] } },
        },
      },
      include: {
        stop: { include: { order: { include: orderInclude } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (flags.length === 0) return [];
    const trips = await this.prisma.trip.findMany({
      where: { id: { in: [...new Set(flags.map((f) => f.stop.tripId))] } },
      include: tripInclude,
    });
    return trips.map((trip) => ({
      trip,
      flags: flags.filter((f) => f.stop.tripId === trip.id),
    }));
  }

  private missingSummary(m: Missing): IncidentSummary {
    const qty = m.flags.reduce((n, f) => n + (f.qty ?? 1), 0);
    const bay = m.trip.loadingJob?.bay?.replace(/^\D*/, '');
    return {
      id: `missing:${m.trip.id}`,
      kind: 'missing_items',
      title: `${qty} ${qty === 1 ? 'item' : 'items'} short on ${m.trip.vehicle.numberPlate ?? m.trip.vehicleId}`,
      line: `Reported by loader${bay ? ` at dock ${bay}` : ''} · ${timeOf(m.flags[0].createdAt)}`,
      brand: m.trip.brand,
      state: 'open',
      stopsAffected: null,
      outcome: null,
      createdAt: m.flags[0].createdAt.toISOString(),
    };
  }

  async list(me: Me): Promise<IncidentList> {
    const depotId = this.depotOf(me);
    const day = new Date(`${this.clock.today()}T00:00:00Z`);
    const since = new Date(day);
    since.setUTCDate(since.getUTCDate() - 7);
    const [rows, missing] = await Promise.all([
      this.prisma.incident.findMany({
        where: { trip: { depotId }, createdAt: { gte: since } },
        include: { trip: { include: tripInclude } },
        orderBy: { createdAt: 'desc' },
      }),
      this.missingItems(depotId, day),
    ]);
    const all = rows.map((r) => this.summary(r));
    // A breakdown comes first, then the newest.
    const newest = (a: IncidentSummary, b: IncidentSummary) =>
      Number(b.kind === 'breakdown') - Number(a.kind === 'breakdown') ||
      b.createdAt.localeCompare(a.createdAt);
    const resolved = all.filter((i) => i.state === 'resolved').sort(newest);
    return {
      date: this.clock.today(),
      active: [
        ...all.filter((i) => i.state !== 'resolved'),
        ...missing.map((m) => this.missingSummary(m)),
      ].sort(newest),
      resolved,
      resolvedThisWeek: resolved.length,
    };
  }

  private async load(me: Me, id: string): Promise<IncidentRow> {
    const row = await this.prisma.incident.findFirst({
      where: { id, trip: { depotId: this.depotOf(me) } },
      include: { trip: { include: tripInclude } },
    });
    if (!row) throw new NotFoundException('Incident not found');
    return row;
  }

  private windowText(s: TripRow['stops'][number]) {
    return `${clockText(s.order.store.windowOpenMin)}-${clockText(s.order.store.windowCloseMin)}`;
  }

  /** The stops still to deliver; the ones already done are not part of the incident. */
  private stopRows(t: TripRow): IncidentStop[] {
    const now = this.clock.minutesNow();
    return t.stops
      .filter((s) => !DONE.has(s.status))
      .map((s) => ({
        id: s.id,
        storeName: s.order.store.displayName ?? s.order.store.id,
        windowText: this.windowText(s),
        chip: 'At risk',
        tone: s.order.store.windowCloseMin - now < 300 ? ('danger' as const) : ('warning' as const),
        note: null,
      }));
  }

  /** Vehicles that could take the remaining stops, best first, with what each would manage. */
  private async candidates(
    me: Me,
    trip: TripRow,
    remaining: TripRow['stops'],
    lookup: Lookup,
  ): Promise<Candidate[]> {
    const depotId = this.depotOf(me);
    const nowMin = this.clock.minutesNow();
    const [vehicles, today] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { depotId } }),
      this.prisma.trip.findMany({ where: { depotId, serviceDate: trip.serviceDate } }),
    ]);
    const views = sortStopsByWindow(remaining.map((s) => toStopView(s.order)));
    const weight = remaining.reduce((n, s) => n + s.order.weightKg, 0);
    const volume = remaining.reduce((n, s) => n + s.order.volumeM3, 0);
    const chilled = remaining.some((s) => s.order.temp === 'chilled');
    const travel = lookup.travel.find(
      (l) => l.depot === depotId && l.district === trip.district.name,
    );
    const away = travel
      ? `about ${travel.depotToDistrictFreeflowMin} min away`
      : 'distance unknown';

    const out: Candidate[] = [];
    for (const v of vehicles) {
      if (v.id === trip.vehicleId) continue;
      const mine = today.filter((x) => x.vehicleId === v.id);
      if (mine.some((x) => ['loading', 'ready', 'on_road', 'breakdown'].includes(x.status)))
        continue;
      const kind =
        v.type === 'van' ? 'Van' : v.temp === 'reefer' ? 'Refrigerated truck' : 'Ambient truck';
      const back = mine
        .filter((x) => x.status === 'completed' && x.endingTime)
        .map((x) => x.endingTime as Date)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const detail = `${back ? `Back at depot ${timeOf(back)}` : 'At depot'} · ${v.weightCapKg.toLocaleString('en-US')} kg · ${away}`;
      const tripNumber = [1, 2].find((n) => !mine.some((x) => x.tripNumber === n));
      const base = { vehicleId: v.id, label: `${v.numberPlate ?? v.id} · ${kind}`, detail };
      const no = (verdict: string, d = detail): Candidate => ({
        option: { ...base, detail: d, verdict, tone: 'bad', available: false },
        etas: [],
        tripNumber: 0,
        travelMin: 9999,
      });

      if (v.status === 'out_of_service') {
        const until = v.returnDate ? ` until ${backAtLabel(v.returnDate)}` : '';
        out.push(no('Unavailable', `Out of service${until}`));
      } else if (tripNumber === undefined) {
        out.push(no('Unavailable', 'Already has two trips today'));
      } else if (chilled && v.temp !== 'reefer') {
        out.push(no('Chilled goods need a refrigerated truck'));
      } else if (weight > v.weightCapKg || volume > v.volumeCapM3) {
        out.push(no(`Over capacity, ${kg(weight)} of ${kg(v.weightCapKg)}`));
      } else {
        const departMin = Math.max(nowMin, back ? minuteOfDay(back) : 0);
        const etas = stopEtas(views, lookup, depotId as Depot, departMin);
        if (!etas) {
          out.push(no('No travel time on file for this district'));
          continue;
        }
        const late = etas.filter((e) => e.atRisk);
        const lateStop = late[0] && remaining.find((s) => s.orderId === late[0].orderId);
        const lateName = lateStop
          ? (lateStop.order.store.displayName ?? lateStop.order.store.id)
          : '';
        out.push({
          option: {
            ...base,
            verdict: late.length
              ? `${lateName} window tight`
              : v.weightCapKg < weight * 1.5
                ? `Fits, ${kg(weight)} of ${kg(v.weightCapKg)}`
                : `All ${views.length} windows met`,
            tone: late.length ? 'warn' : 'good',
            available: true,
          },
          etas,
          tripNumber,
          travelMin: travel?.depotToDistrictFreeflowMin ?? 9999,
        });
      }
    }
    const rank = (c: Candidate) => (!c.option.available ? 2 : c.option.tone === 'good' ? 0 : 1);
    return out.sort((a, b) => rank(a) - rank(b) || a.travelMin - b.travelMin);
  }

  async detail(me: Me, id: string): Promise<IncidentDetail> {
    if (id.startsWith('missing:')) return this.missingDetail(me, id.slice('missing:'.length));
    const row = await this.load(me, id);
    const t = row.trip;
    const s = this.summary(row);
    const driver = this.driverOf(t);
    const log = entries(row.timeline);
    const done = lastResolution(log);
    const remaining = t.stops.filter((x) => !DONE.has(x.status));
    const recoverable = row.type === 'breakdown' && s.state !== 'resolved' && remaining.length > 0;
    const replacements =
      recoverable && remaining.length > 0
        ? (await this.candidates(me, t, remaining, await this.plan.loadLookup())).map(
            (c) => c.option,
          )
        : [];
    const goods = remaining.reduce((n, x) => n + x.order.weightKg, 0);
    const minutes = done
      ? Math.round((new Date(done.at).getTime() - row.createdAt.getTime()) / 60000)
      : this.minutesSince(row.createdAt);
    const kind =
      t.vehicle.type === 'van' ? 'Van' : t.vehicle.temp === 'reefer' ? 'Refrigerated' : 'Ambient';
    const byDispatch = log[0]?.by === 'dispatcher';
    return {
      ...s,
      subtitle: `${KIND_HEAD[s.kind]}  ·  reported ${timeOf(row.createdAt)}${byDispatch ? ' by dispatch' : driver ? ` by ${driver.name} (driver)` : ''}`,
      status: `${s.state === 'resolved' ? 'Resolved' : 'Active'} · ${minutes} min`,
      stops:
        done?.resolution && (s.state === 'resolved' || remaining.length === 0)
          ? done.resolution.stops
          : this.stopRows(t),
      replacements,
      details: {
        vehicle: `${t.vehicle.numberPlate ?? t.vehicleId} · ${kind}`,
        trip: `Trip ${t.tripNumber} · ${t.brand} · ${t.district.name}`,
        goods:
          done?.resolution?.goods ??
          `${kg(goods)} · ${remaining.length} ${remaining.length === 1 ? 'stop' : 'stops'}`,
        driver,
      },
      timeline: [
        ...(byDispatch
          ? []
          : [
              {
                at: row.createdAt.toISOString(),
                text: `${driver ? shortName(driver.name) : 'The driver'} reported it`,
              },
            ]),
        ...log.filter((e) => !e.resolution).map((e) => ({ at: e.at, text: e.text })),
      ],
      resolution: done?.resolution
        ? {
            title: done.resolution.title,
            text: done.resolution.text,
            tripId: done.resolution.tripId,
          }
        : null,
      recoverable,
    };
  }

  /** The loader's missing-items report, shown for information. */
  private async missingDetail(me: Me, tripId: string): Promise<IncidentDetail> {
    const depotId = this.depotOf(me);
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, depotId } });
    const m =
      trip &&
      (await this.missingItems(depotId, trip.serviceDate)).find((x) => x.trip.id === tripId);
    if (!m) throw new NotFoundException('Incident not found');
    const s = this.missingSummary(m);
    const t = m.trip;
    return {
      ...s,
      subtitle: `${KIND_HEAD.missing_items}  ·  reported ${timeOf(m.flags[0].createdAt)} by the loader`,
      status: `Active · ${this.minutesSince(m.flags[0].createdAt)} min`,
      stops: m.flags.map((f) => ({
        id: f.id,
        storeName: f.stop.order.store.displayName ?? f.stop.order.store.id,
        windowText: this.windowText(f.stop),
        chip: `${f.qty ?? 1} short`,
        tone: 'warning' as const,
        note: f.note,
      })),
      replacements: [],
      details: {
        vehicle: `${t.vehicle.numberPlate ?? t.vehicleId} · ${t.vehicle.type === 'van' ? 'Van' : t.vehicle.temp === 'reefer' ? 'Refrigerated' : 'Ambient'}`,
        trip: `Trip ${t.tripNumber} · ${t.brand} · ${t.district.name}`,
        goods: `${t.stops.length} ${t.stops.length === 1 ? 'stop' : 'stops'}`,
        driver: this.driverOf(t),
      },
      timeline: m.flags.map((f) => ({
        at: f.createdAt.toISOString(),
        text: `Loader flagged ${f.qty ?? 1} missing${f.note ? `: ${f.note}` : ''}`,
      })),
      resolution: null,
      recoverable: false,
    };
  }

  private async save(id: string, current: unknown, add: Entry[], status?: string) {
    await this.prisma.incident.update({
      where: { id },
      data: {
        timeline: [...entries(current), ...add] as unknown as Prisma.InputJsonValue,
        ...(status ? { status } : {}),
      },
    });
  }

  private async tellStore(storeId: string, title: string, body: string) {
    const users = await this.prisma.user.findMany({ where: { storeId, role: 'store' } });
    for (const u of users) {
      try {
        await this.notifier.notify({ userId: u.id, title, body, link: '/store' });
      } catch {
        // best effort: the recovery is already saved
      }
    }
  }

  /**
   * Dispatch logs that a truck broke down: the trip stops (status "breakdown") and a breakdown
   * incident opens, so the remaining stops can be recovered from the incidents screen.
   * Logging the same trip twice returns the open incident.
   */
  async reportBreakdown(me: Me, tripId: string, note?: string): Promise<IncidentDetail> {
    const depotId = this.depotOf(me);
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, depotId } });
    if (!trip) throw new NotFoundException('Trip not found');
    const open = await this.prisma.incident.findFirst({
      where: { tripId, type: 'breakdown', status: { notIn: ['resolved', 'closed'] } },
    });
    if (open) return this.detail(me, open.id);
    if (!BREAKABLE.includes(trip.status)) {
      throw new BadRequestException(`A ${trip.status.replace('_', ' ')} trip cannot break down`);
    }
    const now = this.clock.now();
    const text = note?.trim()
      ? `Dispatch logged the breakdown: ${note.trim()}`
      : 'Dispatch logged the breakdown';
    const [, created] = await this.prisma.$transaction([
      this.prisma.trip.update({ where: { id: tripId }, data: { status: 'breakdown' } }),
      this.prisma.incident.create({
        data: {
          type: 'breakdown',
          tripId,
          status: 'open',
          createdAt: now,
          timeline: [
            { at: now.toISOString(), text, by: 'dispatcher' },
          ] as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    return this.detail(me, created.id);
  }

  async acknowledge(me: Me, id: string): Promise<IncidentDetail> {
    if (id.startsWith('missing:')) return this.detail(me, id);
    const row = await this.load(me, id);
    if (stateOf(row.status) === 'open') {
      await this.save(
        id,
        row.timeline,
        [{ at: this.clock.now().toISOString(), text: 'You opened the incident' }],
        'acknowledged',
      );
    }
    return this.detail(me, id);
  }

  /** Close an incident that has nothing left to recover (or never had stops to move). */
  async close(me: Me, id: string): Promise<IncidentDetail> {
    if (id.startsWith('missing:')) {
      throw new BadRequestException("This clears once the loader's flag is dealt with");
    }
    const row = await this.load(me, id);
    if (stateOf(row.status) === 'resolved') {
      throw new BadRequestException('This incident is already resolved');
    }
    const t = row.trip;
    const remaining = t.stops.filter((s) => !DONE.has(s.status));
    if (row.type === 'breakdown' && remaining.length > 0) {
      throw new BadRequestException('Choose how to recover the remaining stops first');
    }
    const before = lastResolution(entries(row.timeline))?.resolution;
    const now = this.clock.now().toISOString();
    await this.save(
      id,
      row.timeline,
      [
        { at: now, text: 'You marked the incident resolved' },
        {
          at: now,
          text: 'Resolved',
          resolution: {
            title: `Marked resolved at ${timeOf(this.clock.now())}`,
            text: before?.text ?? 'You closed the incident. It stays logged here.',
            line: before?.line ?? 'Closed by the dispatcher',
            outcome: before?.outcome ?? 'Closed',
            goods:
              before?.goods ??
              `${kg(remaining.reduce((n, s) => n + s.order.weightKg, 0))} · ${remaining.length} ${remaining.length === 1 ? 'stop' : 'stops'}`,
            tripId: before?.tripId ?? null,
            stops: before?.stops ?? this.stopRows(t),
          },
        },
      ],
      'resolved',
    );
    return this.detail(me, id);
  }

  async reopen(me: Me, id: string): Promise<IncidentDetail> {
    const row = await this.load(me, id);
    if (stateOf(row.status) !== 'resolved') {
      throw new BadRequestException('This incident is not resolved');
    }
    await this.save(
      id,
      row.timeline,
      [{ at: this.clock.now().toISOString(), text: 'You reopened the incident' }],
      'open',
    );
    return this.detail(me, id);
  }

  /** Tell the stores still waiting on the trip to expect a delay; the incident stays open. */
  async notifyStores(me: Me, id: string): Promise<IncidentDetail> {
    const row = await this.load(me, id);
    if (stateOf(row.status) === 'resolved') {
      throw new BadRequestException('This incident is already resolved');
    }
    const t = row.trip;
    const stores = [
      ...new Set(t.stops.filter((s) => !DONE.has(s.status)).map((s) => s.order.storeId)),
    ];
    for (const storeId of stores) {
      await this.tellStore(
        storeId,
        'Delivery delayed',
        `Your delivery on ${t.vehicle.numberPlate ?? t.vehicleId} is delayed by ${KIND_REASON[row.type as IncidentKind]}. We will send the new time as soon as it is sorted.`,
      );
    }
    await this.save(id, row.timeline, [
      {
        at: this.clock.now().toISOString(),
        text: `${stores.length} store ${stores.length === 1 ? 'manager' : 'managers'} told to expect a delay`,
      },
    ]);
    return this.detail(me, id);
  }

  private async nextOperatingDay(from: Date): Promise<Date> {
    for (let i = 1; i <= 7; i++) {
      const d = new Date(from);
      d.setUTCDate(d.getUTCDate() + i);
      const cal = await this.prisma.calendarDay.findUnique({ where: { id: d } });
      if (!cal || cal.isOperating) return d;
    }
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  /** Recover from a breakdown: a replacement takes the stops, they move to the next day, or both. */
  async resolve(me: Me, id: string, dto: ResolveRequest): Promise<IncidentDetail> {
    const row = await this.load(me, id);
    if (row.type !== 'breakdown') {
      throw new BadRequestException('Only a breakdown can be recovered from here');
    }
    if (stateOf(row.status) === 'resolved') {
      throw new BadRequestException('This incident is already resolved');
    }
    const t = row.trip;
    const plate = t.vehicle.numberPlate ?? t.vehicleId;
    const remaining = t.stops.filter((s) => !DONE.has(s.status));
    const now = this.clock.now();

    let carry: TripRow['stops'] = [];
    let defer: TripRow['stops'] = [];
    let chosen: Candidate | undefined;
    if (dto.action === 'tomorrow') {
      defer = remaining;
    } else {
      if (!dto.vehicleId) throw new BadRequestException('Pick a replacement vehicle');
      // defer_one: the dispatcher's chosen store moves to the next day; the replacement takes the rest.
      const deferred =
        dto.action === 'defer_one' ? remaining.find((s) => s.id === dto.deferStopId) : undefined;
      if (dto.action === 'defer_one') {
        if (!deferred) throw new BadRequestException('Pick the store to move to the next day');
        if (remaining.length < 2) {
          throw new BadRequestException('Only one stop is left; move it to tomorrow instead');
        }
      }
      const taking = deferred ? remaining.filter((s) => s.id !== deferred.id) : remaining;
      const lookup = await this.plan.loadLookup();
      chosen = (await this.candidates(me, t, taking, lookup)).find(
        (c) => c.option.vehicleId === dto.vehicleId,
      );
      if (!chosen || !chosen.option.available) {
        throw new BadRequestException('That vehicle cannot take these stops');
      }
      const order = sortStopsByWindow(taking.map((s) => toStopView(s.order)));
      const sorted = order.map((v) => taking.find((s) => s.orderId === v.order.id)!);
      if (deferred) {
        carry = sorted;
        defer = [deferred];
      } else if (dto.action === 'split') {
        const late = new Set(chosen.etas.filter((e) => e.atRisk).map((e) => e.orderId));
        carry = sorted.filter((s) => !late.has(s.orderId));
        defer = sorted.filter((s) => late.has(s.orderId));
        if (carry.length === 0 || defer.length === 0) {
          throw new BadRequestException(
            'That vehicle makes every window, or none; choose replacement or tomorrow instead',
          );
        }
      } else {
        carry = sorted;
      }
    }

    const goodsLeft = `${kg(remaining.reduce((n, s) => n + s.order.weightKg, 0))} · ${remaining.length} ${remaining.length === 1 ? 'stop' : 'stops'}`;
    const etaOf = new Map((chosen?.etas ?? []).map((e) => [e.orderId, e.arriveMin]));
    const newDate = defer.length > 0 ? await this.nextOperatingDay(t.serviceDate) : null;
    const reason = dto.reason?.trim() || `${plate} broke down`;
    const newDay = newDate ? dayText(newDate) : '';
    const made: { id: string; plate: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      if (chosen && carry.length > 0) {
        const vehicle = await tx.vehicle.findUniqueOrThrow({
          where: { id: chosen.option.vehicleId },
        });
        const created = await tx.trip.create({
          data: {
            vehicleId: vehicle.id,
            assignedDriverId: vehicle.driverId,
            depotId: t.depotId,
            brand: t.brand,
            districtId: t.districtId,
            serviceDate: t.serviceDate,
            tripNumber: chosen.tripNumber,
            status: 'published',
            publishedAt: now,
          },
        });
        made.push({ id: created.id, plate: vehicle.numberPlate ?? vehicle.id });
        // orderId is unique, so each stop moves by update rather than delete and create.
        for (const [i, s] of carry.entries()) {
          await tx.tripStop.update({
            where: { id: s.id },
            data: { tripId: created.id, sequence: i + 1, etaMin: etaOf.get(s.orderId) ?? null },
          });
        }
      }
      for (const s of defer) {
        await tx.tripStop.delete({ where: { id: s.id } });
        await tx.order.update({
          where: { id: s.orderId },
          data: {
            status: 'deferred',
            movedFromDate: s.order.deliveryDate,
            deliveryDate: newDate as Date,
            deferReason: reason,
            deferredById: me.id,
          },
        });
      }
      // Nothing is left on the broken-down trip; the vehicle goes to the workshop.
      await tx.trip.update({ where: { id: t.id }, data: { status: 'completed', endingTime: now } });
      await tx.vehicle.update({
        where: { id: t.vehicleId },
        data: { status: 'out_of_service', outOfServiceReason: 'Breakdown, towing to the workshop' },
      });
    });

    const replacement = made[0] ?? null;
    const stamp = now.toISOString();
    const lateOrders = new Set((chosen?.etas ?? []).filter((e) => e.atRisk).map((e) => e.orderId));
    const told = new Set<string>();
    const stops: IncidentStop[] = t.stops
      .filter((s) => DONE.has(s.status))
      .map((s) => ({
        id: s.id,
        storeName: s.order.store.displayName ?? s.order.store.id,
        windowText: this.windowText(s),
        chip: 'Done',
        tone: 'success' as const,
        note: s.arrivedAt ? `Delivered ${timeOf(s.arrivedAt)}` : null,
      }));
    for (const s of carry) {
      const eta = etaOf.get(s.orderId);
      const store = s.order.store;
      await this.tellStore(
        store.id,
        'Delivery rescheduled',
        `Your delivery is now on ${replacement?.plate}${eta ? `, new ETA ${clockText(eta)}` : ''}. Sorry for the wait.`,
      );
      told.add(store.id);
      stops.push({
        id: s.id,
        storeName: store.displayName ?? store.id,
        windowText: this.windowText(s),
        chip: eta ? `New ETA ${clockText(eta)}` : `Now on ${replacement?.plate}`,
        tone: lateOrders.has(s.orderId) ? 'warning' : 'success',
        note: null,
      });
    }
    for (const s of defer) {
      const store = s.order.store;
      await this.tellStore(
        store.id,
        `Delivery moved to ${newDay}`,
        `Reason: ${reason}. Your order now arrives on ${newDay}, first in line. Sorry for the delay.`,
      );
      told.add(store.id);
      stops.push({
        id: s.id,
        storeName: store.displayName ?? store.id,
        windowText: this.windowText(s),
        chip: `Moved to ${newDay}`,
        tone: 'warning',
        note: null,
      });
    }

    const count = (n: number) => `${n} ${n === 1 ? 'stop' : 'stops'}`;
    const managers = `${told.size} store ${told.size === 1 ? 'manager' : 'managers'}`;
    const clock = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    const sentTo = replacement
      ? await this.prisma.vehicle.findUnique({
          where: { id: chosen!.option.vehicleId },
          include: { driver: true },
        })
      : null;
    const firstEta = carry.length ? etaOf.get(carry[0].orderId) : undefined;
    const lastEta = carry.length ? etaOf.get(carry[carry.length - 1].orderId) : undefined;
    const towing = `${plate} is marked for towing to the workshop.`;
    const heading = sentTo?.driver
      ? `${person(sentTo.driver.name)} is heading to ${t.district.name}`
      : `${replacement?.plate} is heading to ${t.district.name}`;
    const moved = defer.length
      ? ` ${count(defer.length)[0].toUpperCase()}${count(defer.length).slice(1)} moved to ${newDay} and ${defer.length === 1 ? 'is' : 'are'} first in line.`
      : '';
    const result =
      dto.action === 'tomorrow'
        ? {
            title: `${count(defer.length)[0].toUpperCase()}${count(defer.length).slice(1)} moved to ${newDay} at ${clock}`,
            text: `Store managers were told their delivery arrives on ${newDay}, first in line. ${towing}`,
            line: `${count(defer.length)} moved to ${newDay}`,
            outcome: 'Moved',
          }
        : {
            title: `${dto.action === 'replacement' ? 'Replacement' : 'Split'} ${replacement?.plate} sent at ${clock}`,
            text: `${heading} to pick up the ${count(carry.length)} that fit${firstEta ? `. ETA ${clockText(firstEta)}${lastEta && lastEta !== firstEta ? ` to ${clockText(lastEta)}` : ''}` : ''}.${moved} Store managers got the new plan automatically, and ${towing}`,
            line: `${replacement?.plate} sent to ${t.district.name}`,
            outcome: dto.action === 'replacement' ? 'Replaced' : 'Split',
          };
    await this.save(
      id,
      row.timeline,
      [
        {
          at: stamp,
          text: replacement
            ? `You sent replacement ${replacement.plate}`
            : `You moved ${count(defer.length)} to ${newDay}`,
        },
        ...(replacement && defer.length
          ? [{ at: stamp, text: `${count(defer.length)} moved to ${newDay}` }]
          : []),
        { at: stamp, text: `New ETAs sent to ${managers}` },
        {
          at: stamp,
          text: 'Resolved',
          resolution: {
            title: result.title,
            text: result.text,
            line: result.line,
            outcome: result.outcome,
            goods: goodsLeft,
            tripId: replacement?.id ?? null,
            stops,
          },
        },
      ],
      'resolved',
    );
    return this.detail(me, id);
  }
}
