import { describe, expect, it } from 'vitest';
import { rejectedText } from './sync-rejected';

describe('rejectedText', () => {
  it('names the action and says why in plain words', () => {
    expect(rejectedText({ clientId: 'c1', type: 'ARRIVED', reason: 'ACK_PENDING', at: '' })).toBe(
      `"I've arrived" was not saved: the store result at an earlier stop was not acknowledged.`,
    );
  });

  it('falls back for an unknown reason', () => {
    expect(rejectedText({ clientId: 'c2', type: 'FUEL_READING', reason: 'UNKNOWN', at: '' })).toBe(
      'Your fuel reading was not saved: the server refused it.',
    );
  });
});
