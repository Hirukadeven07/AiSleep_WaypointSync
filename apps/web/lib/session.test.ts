import { describe, expect, it } from 'vitest';
import { loginPathFor } from './session';

describe('loginPathFor', () => {
  it('sends each role back to its own sign-in page, not the role chooser', () => {
    expect(loginPathFor('dispatcher')).toBe('/login/dispatcher');
    expect(loginPathFor('loader')).toBe('/login/loader');
    expect(loginPathFor('driver')).toBe('/login/driver');
    expect(loginPathFor('store')).toBe('/login/store');
  });
});
