/** Horizontal fill bar. `percent` is 0-100+; above 100 the bar turns to the danger token. */
export function CapacityBar({ label, percent }: { label: string; percent: number }) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const tone = percent > 100 ? 'bg-danger' : percent >= 90 ? 'bg-warning' : 'bg-success';
  return (
    <div>
      <div className="mb-xs flex justify-between text-caption font-semibold text-muted">
        <span>{label}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
        <div className={`h-full ${tone}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
