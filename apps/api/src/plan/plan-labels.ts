/** Text the plan board and the store notices share, written the way the Figma writes it. */

/** "2026-10-02" (or a date) -> "Fri, 2 Oct". */
export function dayLabel(day: string | Date): string {
  const d = typeof day === 'string' ? new Date(`${day}T00:00:00Z`) : day;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('day')} ${get('month')}`;
}

/** 480 -> "8:00". */
export function clockText(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}
