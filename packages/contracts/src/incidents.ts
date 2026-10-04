import type { Brand } from './status';

export type IncidentKind =
  'breakdown' | 'delay' | 'quiet_driver' | 'wait_timeout' | 'missing_items';
export type IncidentState = 'open' | 'acknowledged' | 'resolved';

/** POST /incidents: an incident the dispatcher logs by hand on one of the depot's trips. */
export interface LogIncidentRequest {
  tripId: string;
  type: 'breakdown' | 'delay' | 'quiet_driver' | 'wait_timeout';
  note?: string;
}

export interface IncidentSummary {
  id: string;
  kind: IncidentKind;
  title: string;
  /** "Reported by Ruwan S. (driver) · 10:12 · 33 min ago", or the resolution for a resolved one. */
  line: string;
  brand: Brand;
  state: IncidentState;
  /** "3 stops affected" for a trip that still has stops to deliver. */
  stopsAffected: number | null;
  /** The label on a resolved incident ("Rerouted", "Replaced"). */
  outcome: string | null;
  createdAt: string; // ISO
}

export interface IncidentList {
  /** Today at the depot, YYYY-MM-DD: the "resolved today" cut-off. */
  date: string;
  active: IncidentSummary[];
  /** Resolved today and earlier this week, newest first. */
  resolved: IncidentSummary[];
  resolvedThisWeek: number;
}

export interface IncidentStop {
  id: string;
  storeName: string;
  windowText: string;
  /** "At risk", "Done", "Moved to tomorrow", "Now on WP-2240 · ETA 11:40". */
  chip: string;
  tone: 'danger' | 'warning' | 'success' | 'neutral';
  /** "Delivered 9:40" for a stop that was already done. */
  note: string | null;
}

export interface ReplacementOption {
  vehicleId: string;
  label: string; // "WP-2240 · Ambient truck"
  detail: string; // "At depot · 3,000 kg · about 55 min away"
  verdict: string; // "All 3 windows met"
  tone: 'good' | 'warn' | 'bad';
  /** Can be picked. */
  available: boolean;
}

/** defer_one: the dispatcher picks one store to move to the next delivery day; the rest go on the replacement. */
export type RecoveryAction = 'replacement' | 'tomorrow' | 'split' | 'defer_one';

export interface IncidentDetail extends IncidentSummary {
  /** "Engine overheating  ·  reported 10:12 by Ruwan Silva (driver)". */
  subtitle: string;
  /** "Active · 33 min" / "Resolved · 36 min". */
  status: string;
  stops: IncidentStop[];
  /** Only for an active breakdown. */
  replacements: ReplacementOption[];
  details: {
    vehicle: string;
    trip: string;
    goods: string;
    driver: { name: string; phone: string | null } | null;
  };
  timeline: { at: string; text: string }[];
  /** Set once resolved: what was done. */
  resolution: { title: string; text: string; tripId: string | null } | null;
  /** Whether a resolution can be chosen (a breakdown that is not resolved). */
  recoverable: boolean;
  /** What "Notify store managers" sends, and to how many stores, shown before sending. */
  notify: { message: string; stores: number } | null;
  /** The dispatcher pressed Acknowledge (the trip carries on as it is). */
  acknowledged: boolean;
}

export interface ResolveRequest {
  action: RecoveryAction;
  /** The replacement vehicle, for "replacement", "split" and "defer_one". */
  vehicleId?: string;
  /** The stop to move to the next delivery day, for "defer_one". */
  deferStopId?: string;
  /** Why the store's delivery moved; shown to the store. Defaults to "<plate> broke down". */
  reason?: string;
}

/** A dispatcher logs that a truck broke down (POST /api/incidents/breakdown). */
export interface BreakdownRequest {
  tripId: string;
  note?: string;
}
