'use client';

import type { Brand, IncidentKind, IncidentSummary } from '@waypoint/contracts';

const KIND_TAG: Record<IncidentKind, { label: string; text: string }> = {
  breakdown: { label: 'Breakdown', text: 'text-danger' },
  delay: { label: 'Delay', text: 'text-warning' },
  quiet_driver: { label: 'Driver quiet', text: 'text-warning' },
  wait_timeout: { label: 'Long wait', text: 'text-warning' },
  missing_items: { label: 'Missing items', text: 'text-warning' },
};
const BRAND_TEXT: Record<Brand, string> = {
  Fresh: 'text-fresh',
  Style: 'text-style',
  Tech: 'text-tech',
};

/** Card colours: an active breakdown is red, anything else active is amber, a resolved one is grey. */
export function toneOf(i: Pick<IncidentSummary, 'kind' | 'state'>) {
  if (i.state === 'resolved') {
    return { card: 'bg-bg', border: 'border-success', dot: 'bg-success', tint: 'bg-success-tint' };
  }
  return i.kind === 'breakdown'
    ? { card: 'bg-danger-tint', border: 'border-danger', dot: 'bg-danger', tint: 'bg-danger-tint' }
    : {
        card: 'bg-warning-tint',
        border: 'border-warning',
        dot: 'bg-warning',
        tint: 'bg-warning-tint',
      };
}

const Pill = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span
    className={`whitespace-nowrap rounded-pill bg-surface px-[10px] py-1 text-[12px] font-semibold leading-[15px] ${className}`}
  >
    {children}
  </span>
);

function Card({
  incident: i,
  selected,
  onSelect,
}: {
  incident: IncidentSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = toneOf(i);
  const resolved = i.state === 'resolved';
  const kind = KIND_TAG[i.kind];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full shrink-0 flex-col items-start gap-2 rounded-[18px] border-2 p-[14px] text-left ${tone.card} ${
        selected ? tone.border : 'border-transparent'
      } ${resolved && !selected ? 'opacity-70' : ''}`}
    >
      <span className="flex w-full items-center gap-2">
        <span aria-hidden className={`size-[9px] shrink-0 rounded-full ${tone.dot}`} />
        <span className="min-w-px flex-1 text-[14px] font-semibold leading-5 text-ink">
          {i.title}
        </span>
      </span>
      <span className="text-[12px] leading-[17px] text-muted">{i.line}</span>
      <span className="flex flex-wrap gap-[6px]">
        {resolved ? (
          <Pill className="text-success">{i.outcome}</Pill>
        ) : (
          <>
            <Pill className={kind.text}>{kind.label}</Pill>
            <Pill className={BRAND_TEXT[i.brand]}>{i.brand}</Pill>
            {i.stopsAffected != null && (
              <Pill className="text-ink">
                {i.stopsAffected} {i.stopsAffected === 1 ? 'stop' : 'stops'} affected
              </Pill>
            )}
          </>
        )}
      </span>
    </button>
  );
}

const Heading = ({ children }: { children: string }) => (
  <p className="shrink-0 text-[12px] font-bold leading-[15px] tracking-[0.8px] text-muted">
    {children}
  </p>
);

/** Figma "Incident list": active incidents first, then what was resolved. */
export function IncidentList({
  active,
  resolved,
  resolvedLabel,
  selectedId,
  onSelect,
}: {
  active: IncidentSummary[];
  resolved: IncidentSummary[];
  resolvedLabel: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section
      aria-label="Incidents"
      className="flex shrink-0 flex-col gap-[10px] overflow-y-auto rounded-card bg-surface p-4 [scrollbar-width:none] lg:w-[360px] [&::-webkit-scrollbar]:hidden"
    >
      {active.length > 0 && <Heading>ACTIVE</Heading>}
      {active.map((i) => (
        <Card
          key={i.id}
          incident={i}
          selected={i.id === selectedId}
          onSelect={() => onSelect(i.id)}
        />
      ))}
      {resolved.length > 0 && <Heading>{resolvedLabel}</Heading>}
      {resolved.map((i) => (
        <Card
          key={i.id}
          incident={i}
          selected={i.id === selectedId}
          onSelect={() => onSelect(i.id)}
        />
      ))}
      {active.length + resolved.length === 0 && (
        <p className="px-1 py-4 text-[13px] text-muted">No incidents in this view.</p>
      )}
    </section>
  );
}
