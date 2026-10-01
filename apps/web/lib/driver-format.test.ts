import { describe, expect, it } from 'vitest';
import {
  clockText,
  displayName,
  firstName,
  greeting,
  isStopDone,
  telHref,
  vehicleLabel,
  windowText,
} from './driver-format';

describe('driver-format', () => {
  it('drops the bracketed role from seeded names', () => {
    expect(displayName('Kasun (Driver)')).toBe('Kasun');
    expect(displayName('  Kasun   Rathnayake ')).toBe('Kasun Rathnayake');
    expect(firstName('Kasun Rathnayake')).toBe('Kasun');
    expect(firstName(undefined)).toBe('');
  });

  it('greets by Colombo time', () => {
    // 03:00 UTC = 08:30 in Colombo, 10:00 UTC = 15:30, 14:00 UTC = 19:30
    expect(greeting(new Date('2026-10-01T03:00:00Z'))).toBe('Good morning');
    expect(greeting(new Date('2026-10-01T10:00:00Z'))).toBe('Good afternoon');
    expect(greeting(new Date('2026-10-01T14:00:00Z'))).toBe('Good evening');
  });

  it('formats minutes since midnight', () => {
    expect(clockText(420)).toBe('7:00');
    expect(clockText(810)).toBe('13:30');
    expect(clockText(undefined)).toBe('');
    expect(windowText(420, 540)).toBe('7:00-9:00');
    expect(windowText(undefined, undefined)).toBe('');
  });

  it('labels vehicles and stop states', () => {
    expect(vehicleLabel('truck')).toBe('Truck');
    expect(vehicleLabel('van')).toBe('Van');
    expect(vehicleLabel(null)).toBe('');
    expect(isStopDone('delivered')).toBe(true);
    expect(isStopDone('Deferred')).toBe(true);
    expect(isStopDone('upcoming')).toBe(false);
    expect(isStopDone('waiting')).toBe(false);
  });

  it('builds tel links without spaces', () => {
    expect(telHref('011 234 5601')).toBe('tel:0112345601');
  });
});
