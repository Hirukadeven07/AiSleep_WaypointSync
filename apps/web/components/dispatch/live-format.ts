import type { Brand, LiveStatus, LiveTrip } from '@waypoint/contracts';

/** "2026-10-01T05:12:00Z" -> "10:42" (Colombo time, no leading zero). */
export function timeOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Colombo',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${Number(get('hour')) % 24}:${get('minute')}`;
}

/** "10:45 AM" for the "Live since" line. */
export function time12(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Colombo',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function greeting(iso: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      hour: 'numeric',
      hour12: false,
    }).format(new Date(iso)),
  );
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export const firstName = (name: string) =>
  name
    .replace(/\s*\(.*\)\s*$/, '')
    .trim()
    .split(/\s+/)[0] ?? '';

/** "1h 5m" / "5h 15m" / "40m". */
export function untilText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const BRAND_TAG: Record<Brand, string> = {
  Fresh: 'bg-fresh-tint text-fresh',
  Style: 'bg-style-tint text-style',
  Tech: 'bg-tech-tint text-tech',
};

type Tone = { label: string; chip: string; fill: string };

/** The status chip and progress colour for a trip (Figma "Trips today"). */
export function toneOf(trip: Pick<LiveTrip, 'live' | 'lateMin'>): Tone {
  const t: Record<LiveStatus, Tone> = {
    on_time: { label: 'On time', chip: 'bg-success/[0.12] text-success', fill: 'bg-success' },
    late: {
      label: `Late ${trip.lateMin ?? 0} min`,
      chip: 'bg-warning/[0.12] text-warning',
      fill: 'bg-warning',
    },
    breakdown: { label: 'Breakdown', chip: 'bg-danger/[0.12] text-danger', fill: 'bg-danger' },
    not_synced: { label: 'Not synced', chip: 'bg-muted/[0.12] text-muted', fill: 'bg-faint' },
    completed: { label: 'Completed', chip: 'bg-info/[0.12] text-info', fill: 'bg-success' },
    loading: { label: 'Loading', chip: 'bg-info/[0.12] text-info', fill: 'bg-slate' },
    assigned: { label: 'Assigned', chip: 'bg-muted/[0.12] text-muted', fill: 'bg-faint' },
  };
  return t[trip.live];
}

/** "Kottawa · 10:42", "Last sync 9:58" or "Back at depot · 10:20". */
export function lastUpdate(t: LiveTrip): string {
  if (t.live === 'completed') return t.backAt ? `Back at depot · ${timeOf(t.backAt)}` : 'Completed';
  if (t.live === 'not_synced') return t.lastAt ? `Last sync ${timeOf(t.lastAt)}` : 'Not synced';
  if (t.lastPlace && t.lastAt) return `${t.lastPlace} · ${timeOf(t.lastAt)}`;
  if (t.lastAt) return timeOf(t.lastAt);
  return '';
}
