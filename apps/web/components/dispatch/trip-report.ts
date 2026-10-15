import type { LiveStop, LiveTrip, StopStatus } from '@waypoint/contracts';
import type { PdfLine } from '../../lib/pdf';
import { clock } from '../plan/format';
import { timeOf, toneOf } from './live-format';

const STOP_LABEL: Record<StopStatus, string> = {
  upcoming: 'Not reached',
  arrived: 'Arrived',
  waiting: 'Waiting',
  confirmed: 'Delivered',
  delivered: 'Delivered',
  partial: 'Partial',
  deferred: 'Deferred',
  at_risk: 'At risk',
};

const COLS = { seq: 48, store: 72, window: 250, arrived: 330, result: 395, check: 470 };

/** "Sat 4 Oct 2026" in Colombo time. */
function dayOf(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** "2026-10-04" in Colombo time, for the file name. */
function isoDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(iso));
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function kind(t: LiveTrip): string {
  if (t.vehicleType === 'van') return 'Van';
  return t.vehicleTemp === 'reefer' ? 'Refrigerated truck' : 'Ambient truck';
}

function stopLines(s: LiveStop): PdfLine[] {
  const row: PdfLine = {
    cells: [
      { x: COLS.seq, text: String(s.sequence) },
      { x: COLS.store, text: clip(s.storeName, 30) },
      { x: COLS.window, text: `${clock(s.windowOpenMin)}-${clock(s.windowCloseMin)}` },
      { x: COLS.arrived, text: s.arrivedAt ? timeOf(s.arrivedAt) : '-' },
      { x: COLS.result, text: STOP_LABEL[s.status] },
      { x: COLS.check, text: s.confirmed ? 'Confirmed' : 'Not confirmed' },
    ],
    gap: 2,
  };
  return s.issueNote
    ? [row, { cells: [{ x: COLS.store, text: `Store reported: ${s.issueNote}` }], size: 9 }]
    : [row];
}

/** What the trip report PDF says, line by line. */
export function tripReportLines(trip: LiveTrip, now: Date = new Date()): PdfLine[] {
  const plate = trip.plate ?? trip.vehicleId;
  const day = trip.departedAt ?? trip.backAt ?? now.toISOString();
  const facts: [string, string][] = [
    ['Date', dayOf(day)],
    ['Vehicle', `${kind(trip)} · ${plate}`],
    ['Driver', trip.driverName ?? 'Not assigned'],
    ['Brand', trip.brand],
    ['District', trip.district],
    ['Status', toneOf(trip).label],
    ['Departed', trip.departedAt ? timeOf(trip.departedAt) : '-'],
    ['Back at depot', trip.backAt ? timeOf(trip.backAt) : '-'],
    ['Delivered', `${trip.stopsDone} of ${trip.stopsTotal} stops`],
    ['Load', `${Math.round(trip.weightKg).toLocaleString('en-US')} kg`],
  ];
  const confirmed = trip.stops.filter((s) => s.confirmed).length;
  const issues = trip.stops.filter((s) => s.issueNote).length;

  return [
    { cells: [{ x: 48, text: 'Trip report' }], size: 20, bold: true },
    {
      cells: [{ x: 48, text: `${plate} · Trip ${trip.tripNumber}` }],
      size: 14,
      bold: true,
      gap: 4,
      rule: true,
    },
    ...facts.map(([k, v], i): PdfLine => ({
      cells: [
        { x: 48, text: k },
        { x: 160, text: v },
      ],
      gap: i === 0 ? 12 : 1,
    })),
    { cells: [{ x: 48, text: 'Stops' }], size: 13, bold: true, gap: 16 },
    {
      cells: [
        { x: COLS.seq, text: '#' },
        { x: COLS.store, text: 'Store' },
        { x: COLS.window, text: 'Window' },
        { x: COLS.arrived, text: 'Arrived' },
        { x: COLS.result, text: 'Result' },
        { x: COLS.check, text: 'Store check' },
      ],
      bold: true,
      size: 9,
      gap: 6,
      rule: true,
    },
    ...(trip.stops.length > 0
      ? trip.stops.flatMap(stopLines)
      : [{ cells: [{ x: COLS.store, text: 'No stops on this trip.' }], gap: 2 }]),
    {
      cells: [
        {
          x: 48,
          text: `${confirmed} of ${trip.stopsTotal} confirmed by the store · ${issues} with a reported problem`,
        },
      ],
      size: 9,
      gap: 14,
    },
    {
      cells: [
        {
          x: 48,
          text: `Generated ${dayOf(now.toISOString())} ${timeOf(now.toISOString())} · WaypointSync`,
        },
      ],
      size: 8,
      gap: 4,
    },
  ];
}

/** "trip-report-WP-LQ-1035-trip-1-2026-10-04.pdf". */
export function tripReportFilename(trip: LiveTrip, now: Date = new Date()): string {
  const plate = (trip.plate ?? trip.vehicleId).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const day = isoDay(trip.departedAt ?? trip.backAt ?? now.toISOString());
  return `trip-report-${plate}-trip-${trip.tripNumber}-${day}.pdf`;
}

/** "Trip report · WP LQ-1035 · Trip 1", the new tab's title. */
export const tripReportTitle = (trip: LiveTrip) =>
  `Trip report · ${trip.plate ?? trip.vehicleId} · Trip ${trip.tripNumber}`;
