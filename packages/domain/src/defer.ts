/**
 * Defer an order that cannot fit today. Repeat-skip if this store was deferred last run.
 * Domain does not write the database.
 */
import { Reason } from './reasons';
import type { Order, Outlet, RuleIssue } from './types';
import { outletName } from './names';

export type DeferInput = {
  order: Order;
  outlet: Outlet;
  newDate: string;
  reason: string;
  previouslyDeferredOutletIds: string[];
};

export type DeferResult = {
  orderId: string;
  outletId: string;
  newDate: string;
  reason: string;
  repeatSkip: boolean;
  warnings: RuleIssue[];
};

export function deferOrder(input: DeferInput): DeferResult {
  const repeatSkip = input.previouslyDeferredOutletIds.includes(input.outlet.id);
  const warnings: RuleIssue[] = [];

  if (repeatSkip) {
    warnings.push({
      code: Reason.REPEAT_SKIP,
      severity: 'warn',
      message: `${outletName(input.outlet)} was moved to a later day on the previous run too.`,
    });
  }

  return {
    orderId: input.order.id,
    outletId: input.outlet.id,
    newDate: input.newDate,
    reason: input.reason,
    repeatSkip,
    warnings,
  };
}
