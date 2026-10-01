/**
 * Convenience map of the codes in @waypoint/contracts.
 * UI (Methuli / Sehara) should import ReasonCode from contracts;
 * domain uses these literals so a typo fails the typecheck.
 */
import type { ReasonCode } from '@waypoint/contracts';

export const Reason = {
  BRAND_MISMATCH: 'BRAND_MISMATCH',
  DISTRICT_MISMATCH: 'DISTRICT_MISMATCH',
  WRONG_DEPOT: 'WRONG_DEPOT',
  CHILLED_NEEDS_REEFER: 'CHILLED_NEEDS_REEFER',
  /** Warning only. Double cast until Yohan adds this code to @waypoint/contracts. */
  AMBIENT_ON_REEFER: 'AMBIENT_ON_REEFER' as unknown as ReasonCode,
  VAN_ONLY: 'VAN_ONLY',
  MAX_TRIPS: 'MAX_TRIPS',
  TIME_BUDGET: 'TIME_BUDGET',
  OVER_WEIGHT: 'OVER_WEIGHT',
  OVER_VOLUME: 'OVER_VOLUME',
  WINDOW_AT_RISK: 'WINDOW_AT_RISK',
  FUEL_QUOTA: 'FUEL_QUOTA',
  REPEAT_SKIP: 'REPEAT_SKIP',
  MISSING_TRAVEL_LEG: 'MISSING_TRAVEL_LEG',
  MISSING_SERVICE_ALLOWANCE: 'MISSING_SERVICE_ALLOWANCE',
} as const satisfies Record<string, ReasonCode>;
