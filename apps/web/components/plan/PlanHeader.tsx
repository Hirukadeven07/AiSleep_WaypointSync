import type { PlanDay, PlanSummary } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { clock12, dayLabel } from './format';

function Pill({
  icon,
  children,
  onClick,
  primary = false,
  disabled = false,
  title,
}: {
  icon: 'sparkle' | 'plus' | 'send' | 'check';
  children: string;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex shrink-0 items-center gap-2 rounded-pill px-[18px] py-[11px] text-[14px] font-semibold leading-5 ${
        primary ? 'bg-primary text-on-primary' : 'border border-border bg-surface text-ink'
      } ${disabled ? 'cursor-default' : ''}`}
    >
      <Icon name={icon} size={16} />
      {children}
    </button>
  );
}

/** Figma "Plan v2 / Default" header: title, date line, actions and the List / Map switch. */
export function PlanHeader({
  plan,
  view,
  onView,
  onAutoAssign,
  onNewTrip,
  onPublish,
}: {
  plan: Pick<PlanDay, 'date' | 'depotId' | 'cutoffMin' | 'trips'>;
  view: 'list' | 'map';
  onView: (view: 'list' | 'map') => void;
  onAutoAssign: () => void;
  onNewTrip: () => void;
  onPublish: () => void;
}) {
  // The header sends every trip still being planned. Sent trips stay on the board, and more can be added.
  const working = plan.trips.filter((t) => t.status === 'planning' && t.stops.length > 0).length;
  return (
    <header className="flex flex-wrap items-center gap-[10px]">
      <div className="flex min-w-px flex-[1_0_0] flex-col gap-1">
        <h1 className="whitespace-nowrap text-[34px] font-medium leading-10 text-ink">
          Plan tomorrow&apos;s trips
        </h1>
        <p className="whitespace-pre text-[14px] leading-5 text-muted">
          {`${dayLabel(plan.date)}  ·  ${plan.depotId} depot  ·  orders close ${clock12(plan.cutoffMin)}`}
        </p>
      </div>
      <Pill icon="sparkle" onClick={onAutoAssign}>
        Auto-assign
      </Pill>
      <Pill icon="plus" onClick={onNewTrip}>
        New trip
      </Pill>
      <Pill
        icon="send"
        primary
        onClick={onPublish}
        disabled={working === 0}
        title={working === 0 ? 'No trips in progress to publish' : undefined}
      >
        Publish trips
      </Pill>
      <div aria-hidden className="h-7 w-px shrink-0 bg-border" />
      <div className="flex shrink-0 gap-1 rounded-pill bg-border p-1">
        <button
          type="button"
          aria-pressed={view === 'list'}
          onClick={() => onView('list')}
          className={`flex items-center gap-[6px] rounded-pill px-[14px] py-[9px] text-[13px] font-semibold leading-[18px] ${
            view === 'list' ? 'bg-surface text-ink' : 'text-muted'
          }`}
        >
          <Icon name="list" size={15} />
          List
        </button>
        <button
          type="button"
          aria-pressed={view === 'map'}
          onClick={() => onView('map')}
          className={`flex items-center gap-[6px] rounded-pill px-[14px] py-[9px] text-[13px] font-semibold leading-[18px] ${
            view === 'map' ? 'bg-surface text-ink' : 'text-muted'
          }`}
        >
          <Icon name="map" size={15} />
          Map
        </button>
      </div>
    </header>
  );
}

function Stat({ value, label, warn = false }: { value: string; label: string; warn?: boolean }) {
  return (
    <p className="flex items-center gap-2 whitespace-nowrap">
      <span className={`text-[20px] font-bold leading-7 ${warn ? 'text-warning' : 'text-ink'}`}>
        {value}
      </span>
      <span className="text-[13px] font-medium leading-[18px] text-muted">{label}</span>
    </p>
  );
}

const OVER_LABEL = { volume: 'over volume', weight: 'over weight', both: 'over capacity' } as const;

const timeText = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Colombo',
  });

/** What runs out first on an overbooked day, in the dispatcher's words. */
const LIMIT: Record<
  Exclude<PlanSummary['limitingResource'], 'none'>,
  { short: string; why: string }
> = {
  weight: {
    short: 'weight',
    why: 'The orders weigh more than the free trucks can carry.',
  },
  volume: {
    short: 'space',
    why: 'The orders need more space than the free trucks have.',
  },
  chilled: {
    short: 'refrigerated trucks',
    why: 'There are more chilled orders than refrigerated trucks to carry them.',
  },
  vans: {
    short: 'vans',
    why: 'There are more van-only stores than vans.',
  },
};

/** The strip under the header: vehicles free, capacity used and the open-problems button. */
export function SummaryStrip({
  summary,
  published,
  onView,
}: {
  summary: PlanSummary;
  published: PlanDay['published'];
  onView: () => void;
}) {
  const used = Math.min(summary.capacityUsedPct, 100);
  return (
    <section className="flex items-center gap-6 rounded-[20px] bg-surface px-[18px] py-3">
      <Stat value={String(summary.orderCount)} label="orders" />
      <Stat value={String(summary.waitingSinceYesterday)} label="waiting since yesterday" warn />
      <p className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-[20px] font-bold leading-7 text-ink">
          {summary.vehiclesFree}/{summary.vehiclesTotal}
        </span>
        <span className="text-[13px] font-medium leading-[18px] text-muted">vehicles free</span>
      </p>
      <p className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-[20px] font-bold leading-7 text-ink">{summary.capacityUsedPct}%</span>
        <span className="text-[13px] font-medium leading-[18px] text-muted">capacity used</span>
        <span className="h-[6px] w-[70px] overflow-hidden rounded-[3px] bg-bg">
          <span
            className="block h-[6px] rounded-[3px] bg-slate"
            style={{ width: `${(used / 100) * 70}px` }}
          />
        </span>
      </p>
      <Stat value={String(summary.movedToLaterCount)} label="moved to later" warn />
      {summary.overbooked && summary.limitingResource !== 'none' && (
        <span
          role="status"
          title={`${LIMIT[summary.limitingResource].why} Not every order fits: move the ones that cannot to a later day, with a reason.`}
          className="flex items-center gap-2 whitespace-nowrap rounded-pill bg-warning-tint px-[14px] py-2 text-[13px] leading-[18px] text-ink"
        >
          <Icon name="alert" size={15} className="text-warning" />
          <span className="font-bold">Overbooked</span>
          <span className="font-semibold">limited by {LIMIT[summary.limitingResource].short}</span>
        </span>
      )}
      <span className="min-w-px flex-1" />
      {published ? (
        <span className="flex items-center gap-2 whitespace-nowrap rounded-pill bg-success-tint px-[14px] py-2 text-[13px] leading-[18px] text-success">
          <span className="font-bold">Published {timeText(published.at)}</span>
          <span className="font-semibold">All stores notified</span>
        </span>
      ) : summary.overCount > 0 && summary.overWhat ? (
        <button
          type="button"
          onClick={onView}
          className="flex items-center gap-2 whitespace-nowrap rounded-pill bg-danger-tint px-[14px] py-2 text-[13px] leading-[18px] text-danger"
        >
          <Icon name="alert" size={15} />
          <span className="font-bold">
            {summary.overCount} {OVER_LABEL[summary.overWhat]}
          </span>
          <span className="font-semibold">View</span>
        </button>
      ) : (
        <span className="flex items-center gap-2 whitespace-nowrap rounded-pill bg-success-tint px-[14px] py-2 text-[13px] font-bold leading-[18px] text-success">
          <Icon name="check" size={15} />
          No open issues
        </span>
      )}
    </section>
  );
}
