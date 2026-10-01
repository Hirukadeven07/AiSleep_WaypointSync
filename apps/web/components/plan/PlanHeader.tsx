import type { PlanDay, PlanSummary } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { clock12, dayLabel } from './format';

function Pill({
  icon,
  children,
  onClick,
  primary = false,
  disabled = false,
}: {
  icon: 'sparkle' | 'plus' | 'send' | 'check';
  children: string;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex shrink-0 items-center gap-2 rounded-pill px-[18px] py-[11px] text-[14px] font-semibold leading-5 ${
        primary ? 'bg-primary text-bg' : 'border border-border bg-surface text-ink'
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
  onAutoAssign,
  onNewTrip,
  onPublish,
}: {
  plan: Pick<PlanDay, 'date' | 'depotId' | 'cutoffMin' | 'published'>;
  onAutoAssign: () => void;
  onNewTrip: () => void;
  onPublish: () => void;
}) {
  const published = plan.published !== null;
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
      <Pill icon="sparkle" onClick={onAutoAssign} disabled={published}>
        Auto-assign
      </Pill>
      <Pill icon="plus" onClick={onNewTrip} disabled={published}>
        New trip
      </Pill>
      {published ? (
        <Pill icon="check" primary disabled>
          Published
        </Pill>
      ) : (
        <Pill icon="send" primary onClick={onPublish}>
          Publish plan
        </Pill>
      )}
      <div aria-hidden className="h-7 w-px shrink-0 bg-border" />
      <div className="flex shrink-0 gap-1 rounded-pill bg-border p-1">
        <span className="flex items-center gap-[6px] rounded-pill bg-surface px-[14px] py-[9px] text-[13px] font-semibold leading-[18px] text-ink">
          <Icon name="list" size={15} />
          List
        </span>
        <button
          type="button"
          disabled
          className="flex items-center gap-[6px] rounded-pill px-[14px] py-[9px] text-[13px] font-semibold leading-[18px] text-muted"
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
