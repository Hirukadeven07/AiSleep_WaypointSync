import type { PlanOrder, PlanTrip } from '@waypoint/contracts';

const pad = (n: number) => String(n).padStart(2, '0');

/** 240 -> "04:00" (order rows). */
export const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** 420 -> "7:00" (stop rows). */
export const clock = (min: number) => `${Math.floor(min / 60)}:${pad(min % 60)}`;

/** 960 -> "4:00 PM". */
export function clock12(min: number) {
  const h = Math.floor(min / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(min % 60)} ${h < 12 ? 'AM' : 'PM'}`;
}

export const kgText = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
export const m3Text = (n: number) => n.toFixed(1);

export const orderWindow = (o: Pick<PlanOrder, 'windowOpenMin' | 'windowCloseMin'>) =>
  `${hhmm(o.windowOpenMin)}–${hhmm(o.windowCloseMin)}`;

export const stopWindow = (s: { windowOpenMin: number; windowCloseMin: number }) =>
  `${clock(s.windowOpenMin)}-${clock(s.windowCloseMin)}`;

/** "2026-10-01" -> "Wed, 1 Oct". */
export function dayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')}, ${get('day')} ${get('month')}`;
}

export function vehicleKind(t: Pick<PlanTrip, 'vehicleType' | 'vehicleTemp'>) {
  if (t.vehicleType === 'van') return 'Van';
  return t.vehicleTemp === 'reefer' ? 'Refrigerated' : 'Ambient';
}

export const stopCount = (n: number) => `${n} ${n === 1 ? 'stop' : 'stops'}`;

export const tripSubtitle = (t: PlanTrip) =>
  `${vehicleKind(t)} · ${t.brand} · ${t.district} · ${stopCount(t.stops.length)}`;

export type Section = 'fresh' | 'morning' | 'afternoon';

/** The queue is split by when the store's window opens. */
export const sectionOf = (o: Pick<PlanOrder, 'windowOpenMin'>): Section =>
  o.windowOpenMin < 8 * 60 ? 'fresh' : o.windowOpenMin < 12 * 60 ? 'morning' : 'afternoon';

export const SECTION_LABEL: Record<Section, string> = {
  fresh: 'FRESH RUN · 03:30–08:00',
  morning: 'MORNING · 08:00–12:00',
  afternoon: 'AFTERNOON · 12:00 ONWARDS',
};

/** A capacity bar goes amber from 90% and red above 100%. */
export const tone = (percent: number) =>
  percent > 100 ? 'danger' : percent >= 90 ? 'warning' : 'success';
