/**
 * Time helpers. The live clock (Asia/Colombo + DEMO_NOW) lives in Nest.
 * Domain never calls Date.now().
 */

export function parseHhMm(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatMinutes(totalMin: number): string {
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** ISO week key YYYY-Www. Matches calendar.csv iso_year / iso_week. */
export function isoWeekKey(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
