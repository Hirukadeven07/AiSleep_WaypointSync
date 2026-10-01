import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The next operating day after `from`, as YYYY-MM-DD. Skips days the calendar marks as closed;
 * a day with no calendar row counts as open. Falls back to the next day after a week of closures.
 */
export async function nextOperatingDay(
  db: PrismaService | Prisma.TransactionClient,
  from: Date,
): Promise<string> {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + i);
    const cal = await db.calendarDay.findUnique({ where: { id: d } });
    if (!cal || cal.isOperating) return iso(d);
  }
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}
