import { describe, expect, it } from 'vitest';
import { claimNotice, parseLiveNotice } from './live-notices';

describe('parseLiveNotice', () => {
  it('reads a notice and ignores anything else on the stream', () => {
    expect(
      parseLiveNotice(
        JSON.stringify({
          id: 'n1',
          title: 'New order',
          body: 'Colombo 07 asked for bread.',
          link: '/dispatch/plan',
          createdAt: '2026-10-03T12:00:00.000Z',
        }),
      ),
    ).toEqual({
      id: 'n1',
      title: 'New order',
      body: 'Colombo 07 asked for bread.',
      link: '/dispatch/plan',
      createdAt: '2026-10-03T12:00:00.000Z',
    });
    expect(parseLiveNotice('not json')).toBeNull();
    expect(parseLiveNotice('{}')).toBeNull();
  });

  it('claims each notice once', () => {
    const id = `claim-${Date.now()}`;
    expect(claimNotice(id)).toBe(true);
    expect(claimNotice(id)).toBe(false);
  });
});
