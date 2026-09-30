import { Injectable } from '@nestjs/common';

export const TIME_ZONE = 'Asia/Colombo';

@Injectable()
export class ClockService {
  /** Current instant. Honours DEMO_NOW (ISO string) when set. */
  now(): Date {
    const demo = process.env.DEMO_NOW;
    if (demo) {
      const parsed = new Date(demo);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }

  /** Today's date in Asia/Colombo as YYYY-MM-DD. */
  today(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(this.now());
  }

  /** Minutes since midnight in Asia/Colombo. */
  minutesNow(): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(this.now());
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return h * 60 + m;
  }
}
