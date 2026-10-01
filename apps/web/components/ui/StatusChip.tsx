type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'chilled' | 'primary';

const tones: Record<Tone, string> = {
  neutral: 'bg-muted/10 text-muted',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  chilled: 'bg-chilled-tint text-chilled',
  primary: 'bg-info-tint text-slate',
};

/** Maps a status string (order/trip/stop/vehicle) to a tone. */
export function toneFor(status: string): Tone {
  switch (status) {
    case 'delivered':
    case 'confirmed':
    case 'completed':
    case 'ready':
    case 'available':
      return 'success';
    case 'at_risk':
    case 'waiting':
    case 'deferred':
    case 'partial':
      return 'warning';
    case 'breakdown':
    case 'out_of_service':
      return 'danger';
    case 'on_road':
    case 'loading':
    case 'arrived':
    case 'published':
      return 'primary';
    default:
      return 'neutral';
  }
}

export function StatusChip({ status, tone }: { status: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-semibold ${tones[tone ?? toneFor(status)]}`}
    >
      <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-current" />
      {status.replace(/_/g, ' ')}
    </span>
  );
}
