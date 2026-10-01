import Link from 'next/link';
import type { LoadSheet } from '@waypoint/contracts';
import { formatTime } from '@/lib/clock';
import { Icon } from '@/components/ui/Icon';

const FLAG_LABEL = {
  missing: 'Missing',
  damaged: 'Damaged',
  wrong_quantity: 'Wrong quantity',
} as const;

/** Shown once the trip has left the dock. */
export function LoadSummary({ sheet }: { sheet: LoadSheet }) {
  const lines = sheet.loadOrder.flatMap((s) =>
    s.lines.map((l) => ({ ...l, storeName: s.storeName })),
  );
  const lineName = new Map(lines.map((l) => [l.id, l.name]));
  const flags = sheet.loadOrder.flatMap((s) =>
    s.flags.map((f) => ({ ...f, storeName: s.storeName })),
  );

  return (
    <section className="space-y-md">
      <div className="flex items-center gap-md rounded-card bg-success-tint p-lg">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success text-white">
          <Icon name="check" />
        </span>
        <div>
          <p className="text-title text-ink">
            Departed{sheet.session?.departedAt ? ` at ${formatTime(sheet.session.departedAt)}` : ''}
          </p>
          <p className="text-body text-muted">
            {sheet.vehicle.plate ?? sheet.vehicle.id} · {sheet.loadOrder.length} stops ·{' '}
            {lines.length} lines
          </p>
        </div>
      </div>

      <div className="space-y-sm rounded-card bg-surface p-lg">
        <p className="text-title text-ink">Flags sent to dispatch</p>
        {flags.length === 0 ? (
          <p className="text-body text-muted">No problems flagged. Everything was loaded.</p>
        ) : (
          <ul className="space-y-sm">
            {flags.map((f) => (
              <li key={f.id} className="rounded-input bg-danger-tint px-md py-sm">
                <p className="text-body font-semibold text-danger">
                  {FLAG_LABEL[f.type]}
                  {f.qty !== null ? ` · ${f.qty}` : ''}
                </p>
                <p className="text-label text-ink">
                  {(f.orderLineId && lineName.get(f.orderLineId)) || 'Whole stop'} · {f.storeName}
                </p>
                {f.note && <p className="text-caption text-muted">{f.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href="/dock"
        className="flex min-h-[44px] items-center justify-center rounded-pill bg-primary px-md text-body font-semibold text-on-primary"
      >
        Back to the queue
      </Link>
    </section>
  );
}
