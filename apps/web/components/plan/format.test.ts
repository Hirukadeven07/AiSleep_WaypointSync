import { describe, expect, it } from 'vitest';
import {
  clock,
  clock12,
  dayLabel,
  hhmm,
  kgText,
  sectionOf,
  stopCount,
  stopWindow,
  tone,
  vehicleKind,
} from './format';

describe('plan board formatting', () => {
  it('writes times the way the Figma does', () => {
    expect(hhmm(240)).toBe('04:00');
    expect(clock(420)).toBe('7:00');
    expect(stopWindow({ windowOpenMin: 450, windowCloseMin: 600 })).toBe('7:30-10:00');
    expect(clock12(960)).toBe('4:00 PM');
    expect(clock12(0)).toBe('12:00 AM');
  });

  it('labels the day and the amounts', () => {
    expect(dayLabel('2026-10-01')).toBe('Thu, 1 Oct');
    expect(kgText(2400)).toBe('2,400');
    expect(stopCount(1)).toBe('1 stop');
    expect(stopCount(4)).toBe('4 stops');
  });

  it('names the vehicle kind', () => {
    expect(vehicleKind({ vehicleType: 'van', vehicleTemp: 'ambient' })).toBe('Van');
    expect(vehicleKind({ vehicleType: 'truck', vehicleTemp: 'reefer' })).toBe('Refrigerated');
    expect(vehicleKind({ vehicleType: 'truck', vehicleTemp: 'ambient' })).toBe('Ambient');
  });

  it('splits the queue by when the window opens', () => {
    expect(sectionOf({ windowOpenMin: 240 })).toBe('fresh');
    expect(sectionOf({ windowOpenMin: 480 })).toBe('morning');
    expect(sectionOf({ windowOpenMin: 720 })).toBe('afternoon');
  });

  it('turns a bar amber from 90% and red above 100%', () => {
    expect(tone(80)).toBe('success');
    expect(tone(90)).toBe('warning');
    expect(tone(100)).toBe('warning');
    expect(tone(115)).toBe('danger');
  });
});
