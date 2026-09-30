import { describe, expect, it } from 'vitest';
import { parseHhMm } from '../src/clock';
import { lifoLoadOrder, loadOrder, sortStopsByWindow } from '../src/sequence';
import { stop } from './helpers';

describe('window sort and LIFO', () => {
  const early = stop({
    id: 'OUT-EARLY',
    windowOpenMin: parseHhMm('05:00'),
    windowCloseMin: parseHhMm('07:30'),
  });
  const mid = stop({
    id: 'OUT-MID',
    windowOpenMin: parseHhMm('05:30'),
    windowCloseMin: parseHhMm('08:00'),
  });
  const late = stop({
    id: 'OUT-LATE',
    windowOpenMin: parseHhMm('06:00'),
    windowCloseMin: parseHhMm('08:00'),
  });

  it('sorts delivery by window-open, then window-close, then outlet id', () => {
    const sorted = sortStopsByWindow([late, early, mid]);
    expect(sorted.map((row) => row.outlet.id)).toEqual(['OUT-EARLY', 'OUT-MID', 'OUT-LATE']);
  });

  it('loads in exact reverse of delivery order (LIFO)', () => {
    const delivery = sortStopsByWindow([late, early, mid]);
    const loading = loadOrder(delivery);
    expect(loading.map((row) => row.outlet.id)).toEqual(['OUT-LATE', 'OUT-MID', 'OUT-EARLY']);
  });

  it('lifoLoadOrder is sort-then-reverse in one call', () => {
    const loading = lifoLoadOrder([late, early, mid]);
    expect(loading[0]?.outlet.id).toBe('OUT-LATE');
    expect(loading[2]?.outlet.id).toBe('OUT-EARLY');
  });
});
