/**
 * HARD: one brand and one district per trip. First stop locks both.
 */
import { Reason } from '../reasons';
import type { RuleIssue, StopView } from '../types';

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
      message: `Trip is ${first.outlet.brand}; ${candidate.outlet.id} is ${candidate.outlet.brand}.`,
    });
  }

  if (candidate.outlet.district !== first.outlet.district) {
    issues.push({
      code: Reason.DISTRICT_MISMATCH,
      severity: 'block',
      message: `Trip is ${first.outlet.district}; ${candidate.outlet.id} is ${candidate.outlet.district}.`,
    });
  }

  return issues;
}
