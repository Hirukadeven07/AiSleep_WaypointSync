/**
 * Publish gate.
 * Brand, depot, van-only, chilled, and a large time overrun still block.
 * District mismatch, ambient-on-reefer, a small time overrun, window-at-risk, and fuel-quota are warnings.
 */
import { checkFuelQuota, estimateTripLitres } from './fuel';
import { capacityIssues } from './rules/capacity';
import { canAddStop, evaluateDrop } from './rules/index';
import { sortStopsByWindow } from './sequence';
import { stopEtas, windowRiskIssues } from './time';
import type { Lookup, RuleIssue, StopView, Vehicle } from './types';

export type PublishInput = {
  vehicle: Vehicle;
  stops: StopView[];
  lookup: Lookup;
  departAtMin: number;
  otherLitresThisWeek: number;
};

export type PublishResult = {
  ok: boolean;
  deliveryOrder: StopView[];
  blocks: RuleIssue[];
  warnings: RuleIssue[];
};

function dropIssuesOnTrip(vehicle: Vehicle, stops: StopView[], lookup: Lookup): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const built: StopView[] = [];
  for (const stop of stops) {
    issues.push(...evaluateDrop({ vehicle, currentStops: built, candidate: stop, lookup }));
    built.push(stop);
  }
  return issues;
}

export function evaluatePublish(input: PublishInput): PublishResult {
  const deliveryOrder = sortStopsByWindow(input.stops);
  const dropIssues = dropIssuesOnTrip(input.vehicle, deliveryOrder, input.lookup);
  const blocks: RuleIssue[] = [
    ...dropIssues.filter((issue) => issue.severity === 'block'),
    ...capacityIssues(input.vehicle, deliveryOrder, true),
  ];

  const etas = stopEtas(deliveryOrder, input.lookup, input.vehicle.depot, input.departAtMin) ?? [];
  const litres = estimateTripLitres(deliveryOrder, input.lookup, input.vehicle) ?? 0;
  const warnings: RuleIssue[] = [
    ...dropIssues.filter((issue) => issue.severity === 'warn'),
    ...windowRiskIssues(etas),
    ...checkFuelQuota(
      deliveryOrder[0]?.order.serviceDate ?? '',
      litres + input.otherLitresThisWeek,
      input.vehicle,
    ),
  ];

  return {
    ok: blocks.length === 0,
    deliveryOrder,
    blocks,
    warnings,
  };
}

export function evaluatePlanPreview(input: {
  vehicle: Vehicle;
  currentStops: StopView[];
  candidate: StopView;
  lookup: Lookup;
}): { canDrop: boolean; capacityWarnings: RuleIssue[] } {
  const proposed = [...input.currentStops, input.candidate];
  return {
    canDrop: canAddStop(input),
    capacityWarnings: capacityIssues(input.vehicle, proposed, false),
  };
}
