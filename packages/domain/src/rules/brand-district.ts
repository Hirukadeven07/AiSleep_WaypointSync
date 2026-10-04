/**
 * Brand is a block. District is a warning: the dispatcher may add a store
 * from another district on the same trip. Depot is checked separately.
 */
import { Reason } from '../reasons';
import type { RuleIssue, StopView } from '../types';
import { outletName } from '../names';

export function checkBrandDistrict(currentStops: StopView[], candidate: StopView): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const first = currentStops[0];
  if (!first) {
    return issues;
  }

  if (candidate.outlet.brand !== first.outlet.brand) {
    issues.push({
      code: Reason.BRAND_MISMATCH,
      severity: 'block',
      message: `This trip carries ${first.outlet.brand}; ${outletName(candidate.outlet)} is a ${candidate.outlet.brand} store.`,
    });
  }

  if (candidate.outlet.district !== first.outlet.district) {
    issues.push({
      code: Reason.DISTRICT_MISMATCH,
      severity: 'warn',
      message: `This trip serves ${first.outlet.district}; ${outletName(candidate.outlet)} is in ${candidate.outlet.district}.`,
    });
  }

  return issues;
}
