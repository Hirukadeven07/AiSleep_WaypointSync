import type { LoadJob } from '@waypoint/contracts';
import { formatTime } from '@/lib/clock';

/** The dispatcher's loading job: bay, load-by time and instructions. Hidden when there is none. */
export function JobNote({ job, compact = false }: { job: LoadJob | null; compact?: boolean }) {
  if (!job || (!job.bay && !job.loadByTime && !job.instructions)) return null;
  const meta = [
    job.bay,
    job.loadByTime ? `load by ${formatTime(job.loadByTime)}` : null,
    job.priority > 0 ? 'Priority' : null,
  ].filter(Boolean);

  return (
    <div className="space-y-xs rounded-input bg-info-tint px-md py-sm">
      {meta.length > 0 && <p className="text-label font-semibold text-slate">{meta.join(' · ')}</p>}
      {job.instructions && (
        <p className={`text-caption text-ink ${compact ? 'line-clamp-2' : ''}`}>
          {job.instructions}
        </p>
      )}
    </div>
  );
}
