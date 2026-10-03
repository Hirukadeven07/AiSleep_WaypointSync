/** BREAK_START / BREAK_END events, oldest first, folded into the driver's break state. */
export function foldBreaks(events: { type: string; at: Date }[]): {
  onBreakSince: Date | null;
  usedMin: number;
} {
  let since: Date | null = null;
  let usedMs = 0;
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (e.type === 'BREAK_START') {
      // A second start while on a break keeps the first one.
      since ??= e.at;
    } else if (e.type === 'BREAK_END' && since) {
      usedMs += Math.max(0, e.at.getTime() - since.getTime());
      since = null;
    }
  }
  return { onBreakSince: since, usedMin: Math.round(usedMs / 60_000) };
}

export const BREAK_EVENT_TYPES = ['BREAK_START', 'BREAK_END'];
