type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'chilled' | 'primary';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface text-muted border-border',
  success: 'text-success border-success',
  warning: 'text-warning border-warning',
  danger: 'text-danger border-danger',
  chilled: 'text-chilled border-chilled',
  primary: 'text-primary border-primary',
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
      className={`inline-flex items-center rounded-full border px-sm py-xs text-caption font-medium ${tones[tone ?? toneFor(status)]}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
