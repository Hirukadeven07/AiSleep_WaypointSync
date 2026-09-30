export const TIME_ZONE = 'Asia/Colombo';

/** Current instant; honours NEXT_PUBLIC_DEMO_NOW (ISO string) when set. */
export function now(): Date {
  const demo = process.env.NEXT_PUBLIC_DEMO_NOW;
  if (demo) {
    const d = new Date(demo);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Today's date in Asia/Colombo as YYYY-MM-DD. */
export function todayColombo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now());
}

/** Minutes since midnight, Asia/Colombo. */
export function minutesNowColombo(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/** 495 -> "08:15" */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Formats an ISO timestamp as HH:mm in Asia/Colombo. */
export function formatTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}
