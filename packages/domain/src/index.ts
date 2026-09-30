/**
 * @waypoint/domain — the only place planning rules live.
 * Owner: Sithil.
 * Nest plan.service + trips.service import from here. Pages must not re-check chilled/capacity/windows.
 */
export * from './errors';
export { Reason } from './reasons';
export { TIME_BUDGET_MIN, MAX_TRIPS_PER_VEHICLE_PER_DAY } from './constants';
export { parseHhMm, formatMinutes, isoWeekKey } from './clock';
export { findTravel, findAllowance } from './lookups';

export type {
  Brand,
  Depot,
  VehicleType,
  TempClass,
  DockType,
  ParkingConstraint,
  TravelLeg,
  ServiceAllowance,
  Lookup,
  Vehicle,
  Outlet,
  Order,
  StopView,
  PlannedTrip,
  TripView,
  RuleIssue,
} from './types';

export {
  evaluateDrop,
  canAddStop,
  evaluateNewTrip,
  checkBrandDistrict,
  checkChilled,
  checkHomeDepot,
  checkVanOnly,
  checkTripLimit,
  checkTimeBudget,
  capacityIssues,
  measureCapacity,
} from './rules/index';
export type { DropInput } from './rules/index';

export { tripMinutes, computeTripMinutes, stopEtas, windowRiskIssues } from './time';
export type { StopEta } from './time';

export { tripKm, tripLitres, estimateTripLitres, fuelWeekStatus, checkFuelQuota } from './fuel';
export type { FuelWeekStatus } from './fuel';

export { sortStopsByWindow, loadOrder, lifoLoadOrder } from './sequence';

export { rankVehiclesForOrder } from './fit';
export type { FitOption, RankInput } from './fit';

export { evaluatePublish, evaluatePlanPreview } from './publish';
export type { PublishInput, PublishResult } from './publish';

export { deferOrder } from './defer';
export type { DeferInput, DeferResult } from './defer';

export { capacitySummary } from './summary';
export type { CapacitySummary, ResourceName } from './summary';

export { proposeAssignments } from './assign';
export type { Assignment, AssignInput } from './assign';
