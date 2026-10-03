import { foldBreaks } from './driver-breaks';

const at = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00+05:30`);

describe('foldBreaks', () => {
  it('is off a break with nothing used when there are no events', () => {
    expect(foldBreaks([])).toEqual({ onBreakSince: null, usedMin: 0 });
  });

  it('adds up finished breaks and reports the running one', () => {
    const state = foldBreaks([
      { type: 'BREAK_START', at: at('10:00') },
      { type: 'BREAK_END', at: at('10:20') },
      { type: 'BREAK_START', at: at('12:00') },
    ]);
    expect(state).toEqual({ onBreakSince: at('12:00'), usedMin: 20 });
  });

  it('sorts by time, keeps the first start and ignores an end without a start', () => {
    const state = foldBreaks([
      { type: 'BREAK_END', at: at('09:00') },
      { type: 'BREAK_END', at: at('11:15') },
      { type: 'BREAK_START', at: at('11:05') },
      { type: 'BREAK_START', at: at('11:00') },
    ]);
    expect(state).toEqual({ onBreakSince: null, usedMin: 15 });
  });
});
