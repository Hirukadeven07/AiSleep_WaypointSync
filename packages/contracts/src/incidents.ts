import type { Brand } from './status';

export type IncidentKind =
  'breakdown' | 'delay' | 'quiet_driver' | 'wait_timeout' | 'missing_items';
export type IncidentState = 'open' | 'acknowledged' | 'resolved';

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

export type RecoveryAction = 'replacement' | 'tomorrow' | 'split';

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
}

export interface ResolveRequest {
  action: RecoveryAction;
  /** The replacement vehicle, for "replacement" and "split". */
  vehicleId?: string;
}
