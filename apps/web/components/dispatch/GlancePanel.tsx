import Link from 'next/link';
import type { AttentionItem, LiveDay } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { clock12 } from '@/components/plan/format';
import { untilText } from './live-format';

const BUTTON = 'rounded-pill bg-primary text-bg';

/** One card in "Needs attention": breakdown, store damage report, missing items or a trip that stopped syncing. */
function Attention({ item }: { item: AttentionItem }) {
  if (item.kind === 'breakdown') {
    return (
      <div className="flex flex-col gap-[6px] rounded-note bg-danger-tint p-[14px]">
        <p className="flex items-center gap-2 text-[13px] font-semibold leading-[18px] text-ink">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-danger" />
          {item.title}
        </p>
        <p className="text-[12px] leading-[17px] text-muted">{item.text}</p>
        <Link
          href="/dispatch/incidents"
          className={`self-start px-3 py-[6px] text-[12px] font-semibold leading-[17px] ${BUTTON}`}
        >
          Open incident
        </Link>
      </div>
    );
  }
  if (item.kind === 'damaged') {
    return (
      <div className="flex flex-col gap-2 rounded-note bg-warning-tint p-3">
        <p className="flex items-center gap-[6px] text-[13px] font-bold leading-[18px] text-ink">
          <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-warning" />
          {item.title}
        </p>
        <p className="text-[12px] font-medium leading-4 text-muted">{item.text}</p>
        <Link
          href="/dispatch/board"
          className={`self-start px-3 py-2 text-[12px] font-bold leading-4 ${BUTTON}`}
        >
          Review invoice
        </Link>
      </div>
    );
  }
  if (item.kind === 'missing') {
    return (
      <div className="flex flex-col gap-[6px] rounded-note bg-warning-tint p-[14px]">
        <p className="flex items-center gap-2 text-[13px] font-semibold leading-[18px] text-ink">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
          {item.title}
        </p>
        <p className="text-[12px] leading-[17px] text-muted">{item.text}</p>
        <Link
          href="/dispatch/board"
          className={`self-start px-3 py-[6px] text-[12px] font-semibold leading-[17px] ${BUTTON}`}
        >
          Review
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[6px] rounded-note bg-banner p-[14px]">
      <p className="flex items-center gap-2 text-[13px] font-semibold leading-[18px] text-ink">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted" />
        {item.title}
      </p>
      <p className="text-[12px] leading-[17px] text-muted">{item.text}</p>
      {item.phone ? (
        <a
          href={`tel:${item.phone}`}
          className={`self-start px-3 py-[6px] text-[12px] font-semibold leading-[17px] ${BUTTON}`}
        >
          Call driver
        </a>
      ) : null}
    </div>
  );
}

/** Figma "Right panel": today at a glance, what needs attention, carryovers and tomorrow's planning. */
export function GlancePanel({ day, className = '' }: { day: LiveDay; className?: string }) {
  const c = day.carryovers;
  const t = day.tomorrow;
  return (
    <aside
      className={`flex flex-col gap-[14px] overflow-y-auto rounded-hero bg-border p-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <div className="flex shrink-0 items-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-surface text-slate">
          <Icon name="bell" size={18} />
        </span>
        <span className="min-w-px flex-1" />
        <p className="whitespace-nowrap text-[13px] font-semibold leading-[18px] text-muted">
          Today at a glance
        </p>
      </div>

      <section className="flex shrink-0 flex-col gap-[10px] rounded-[20px] bg-surface p-4">
        <div className="flex items-center">
          <h2 className="min-w-px flex-1 text-[16px] font-semibold leading-[22px] text-ink">
            Needs attention
          </h2>
          <span className="rounded-pill bg-danger/[0.14] px-[10px] py-1 text-[12px] font-semibold leading-[15px] text-danger">
            {day.attention.length}
          </span>
        </div>
        {day.attention.length === 0 && (
          <p className="text-[12px] leading-[17px] text-muted">
            Nothing needs attention right now.
          </p>
        )}
        {day.attention.map((a) => (
          <Attention key={a.id} item={a} />
        ))}
      </section>

      <section className="flex shrink-0 flex-col gap-[6px] rounded-[20px] bg-surface p-4">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-[14px] bg-success-tint text-success">
            <Icon name="check" size={14} />
          </span>
          <h2 className="min-w-px flex-1 text-[14px] font-semibold leading-5 text-ink">
            Waiting since yesterday
          </h2>
        </div>
        <p className="text-[12px] leading-[17px] text-muted">
          {c.total === 0
            ? 'No orders were carried over from yesterday.'
            : c.onTrips === c.total
              ? `All ${c.total} orders from yesterday are on today's trips. ${c.delivered} delivered so far.`
              : `${c.total} orders from yesterday, ${c.total - c.onTrips} not on a trip yet. ${c.delivered} delivered so far.`}
        </p>
      </section>

      <span className="min-h-px flex-1" />

      <section className="flex shrink-0 flex-col gap-2 rounded-card bg-primary p-5">
        <p className="text-[12px] font-bold leading-[15px] text-sand">TOMORROW&apos;S PLANNING</p>
        <p className="whitespace-nowrap text-[26px] font-semibold leading-8 text-bg">
          {t.minutesToCutoff > 0
            ? `Cut-off in ${untilText(t.minutesToCutoff)}`
            : 'Orders are closed'}
        </p>
        <p className="text-[12px] leading-[17px] text-sand">
          {t.ordersReceived} orders received so far · planning opens {clock12(t.cutoffMin)}
        </p>
        <Link
          href="/dispatch/plan"
          className="flex justify-center whitespace-pre rounded-pill bg-bg px-[18px] py-[11px] text-[14px] font-semibold leading-5 text-primary"
        >
          {'Open planning  →'}
        </Link>
      </section>
    </aside>
  );
}
