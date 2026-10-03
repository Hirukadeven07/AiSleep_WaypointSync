/** Small formatting helpers for the driver screens. */

/** Dispatch number shown on the Figma SOS screen. Replace when the depot contact comes from the API. */
export const DISPATCH_PHONE = '011 234 5601';

/** "Today", "Tomorrow", else "Mon 5 Oct", for a YYYY-MM-DD day seen from `today`. */
export function dayText(iso: string, today?: string): string {
  if (today) {
    const diff = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
  }
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export const telHref = (number: string) => `tel:${number.replace(/\s+/g, '')}`;

/** Seeded names carry the role in brackets ("Kasun (Driver)"); drop it. */
export function displayName(name?: string | null): string {
  return (name ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

export function firstName(name?: string | null): string {
  return displayName(name).split(' ')[0] ?? '';
}

/** Greeting for the driver's local time (Colombo). */
export function greeting(date: Date = new Date(), timeZone = 'Asia/Colombo'): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone }).format(date),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Minutes since midnight to "7:00" or "13:30". Empty when unknown. */
export function clockText(minutes?: number | null): string {
  if (minutes == null || Number.isNaN(minutes)) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** "7:00-9:00" from a window in minutes since midnight. Empty when unknown. */
export function windowText(start?: number | null, end?: number | null): string {
  const a = clockText(start);
  const b = clockText(end);
  return a && b ? `${a}-${b}` : a || b;
}

/** "truck" / "van" from the API to the label shown on screen. */
export function vehicleLabel(type?: string | null): string {
  if (!type) return '';
  const word = type.replace(/_/g, ' ').toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Google Maps: directions to the store's pin, or a search for it when it has no coordinates. */
export function mapsUrl(stop: {
  navigateUrl?: string | null;
  outletName: string;
  address?: string | null;
}): string {
  if (stop.navigateUrl) return stop.navigateUrl;
  const place = [stop.outletName, stop.address, 'Sri Lanka'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}

/** Stops that no longer need the driver (delivered, confirmed, partial, or moved to another day). */
const DONE = new Set(['delivered', 'confirmed', 'partial', 'deferred']);
export const isStopDone = (status: string) => DONE.has(status.toLowerCase());
