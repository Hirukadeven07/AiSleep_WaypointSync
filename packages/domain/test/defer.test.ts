import { describe, expect, it } from 'vitest';
import { deferOrder } from '../src/defer';
import { Reason } from '../src/reasons';
import { order, outlet } from './helpers';

describe('defer', () => {
  it('flags repeat skip when the store was deferred last run', () => {
    const result = deferOrder({
      order: order(),
      outlet: outlet({ id: 'OUT001' }),
      newDate: '2024-01-16',
      reason: 'No remaining volume',
      previouslyDeferredOutletIds: ['OUT001'],
    });
    expect(result.repeatSkip).toBe(true);
    expect(result.warnings[0]?.code).toBe(Reason.REPEAT_SKIP);
  });

  it('does not flag a first-time deferral', () => {
    const result = deferOrder({
      order: order(),
      outlet: outlet({ id: 'OUT002' }),
      newDate: '2024-01-16',
      reason: 'No remaining volume',
      previouslyDeferredOutletIds: ['OUT001'],
    });
    expect(result.repeatSkip).toBe(false);
    expect(result.warnings).toEqual([]);
  });
});
