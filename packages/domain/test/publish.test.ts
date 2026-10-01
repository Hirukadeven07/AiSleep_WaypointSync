import { describe, expect, it } from 'vitest';
import { parseHhMm } from '../src/clock';
import { evaluatePlanPreview, evaluatePublish } from '../src/publish';
import { Reason } from '../src/reasons';
import { lookup, stop, vehicle } from './helpers';

describe('publish', () => {
  const colomboStops = [1, 2, 3, 4].map((n) =>
    stop(
      {
        id: `C${n}`,
        brand: 'Fresh',
        district: 'Colombo',
        dockType: 'street',
        windowOpenMin: parseHhMm('05:00'),
        windowCloseMin: parseHhMm('08:00'),
      },
      { id: `OC${n}`, volumeM3: 1, weightKg: 100 },
    ),
  );

  it('blocks publish when volume is over the cap', () => {
    const tiny = vehicle({ volumeCapM3: 2, weightCapKg: 10_000 });
    const result = evaluatePublish({
      vehicle: tiny,
      stops: colomboStops,
      lookup,
      departAtMin: parseHhMm('03:30'),
      otherLitresThisWeek: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.blocks.map((issue) => issue.code)).toContain(Reason.OVER_VOLUME);
  });

  it('allows publish when the truck is inside cap and legal', () => {
    const result = evaluatePublish({
      vehicle: vehicle(),
      stops: colomboStops,
      lookup,
      departAtMin: parseHhMm('03:30'),
      otherLitresThisWeek: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.deliveryOrder.map((row) => row.outlet.id)).toEqual(['C1', 'C2', 'C3', 'C4']);
  });

  it('warns (does not block) when a stop ETA is after window close', () => {
    const lateStops = [
      stop(
        {
          id: 'C1',
          brand: 'Fresh',
          district: 'Colombo',
          dockType: 'street',
          windowOpenMin: parseHhMm('05:00'),
          windowCloseMin: parseHhMm('05:10'),
        },
        { id: 'OC1', volumeM3: 1, weightKg: 100 },
      ),
    ];
    const result = evaluatePublish({
      vehicle: vehicle(),
      stops: lateStops,
      lookup,
      departAtMin: parseHhMm('05:00'),
      otherLitresThisWeek: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toContain(Reason.WINDOW_AT_RISK);
  });

  it('still allows the drop while over volume — red flag, not a hard block', () => {
    const tiny = vehicle({ volumeCapM3: 1 });
    const preview = evaluatePlanPreview({
      vehicle: tiny,
      currentStops: colomboStops.slice(0, 1),
      candidate: colomboStops[1],
      lookup,
    });
    expect(preview.canDrop).toBe(true);
    expect(preview.capacityWarnings.map((issue) => issue.code)).toContain(Reason.OVER_VOLUME);
  });

  it('allows publish when the only issue is a district warning', () => {
    const mixed = [
      ...colomboStops.slice(0, 3),
      stop(
        {
          id: 'G1',
          brand: 'Fresh',
          district: 'Gampaha',
          dockType: 'street',
          windowOpenMin: parseHhMm('05:00'),
          windowCloseMin: parseHhMm('08:00'),
        },
        { id: 'OG1', volumeM3: 1, weightKg: 100 },
      ),
    ];
    const result = evaluatePublish({
      vehicle: vehicle(),
      stops: mixed,
      lookup,
      departAtMin: parseHhMm('03:30'),
      otherLitresThisWeek: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toContain(Reason.DISTRICT_MISMATCH);
    expect(result.blocks).toEqual([]);
  });
});
