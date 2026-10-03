import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOutboxForTests, enqueueAction, getPendingActions } from './outbox';
import { flushOutbox } from './sync-runner';

const kasun = { driverId: 'user_kasun' };

beforeEach(async () => {
  await __resetOutboxForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const reply = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as Response);

describe('flushOutbox', () => {
  it('sends queued actions oldest first and drops every one the server answered', async () => {
    const arrived = await enqueueAction('ARRIVED', { stopId: 's1' }, 't1', 2, kasun);
    const bad = await enqueueAction('ACKNOWLEDGEMENT', { stopId: 's1' }, 't1', 2, kasun);
    const fetchMock = reply({ applied: [arrived.clientId], duplicate: [], rejected: [bad.clientId] });
    vi.stubGlobal('fetch', fetchMock);

    expect(await flushOutbox()).toBe(2);
    expect(await getPendingActions()).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/sync');
    const sent = JSON.parse(String(init.body)).events;
    expect(sent.map((e: { type: string }) => e.type)).toEqual(['ARRIVED', 'ACKNOWLEDGEMENT']);
    expect(sent[0]).toMatchObject({ payload: { stopId: 's1' }, tripId: 't1', seenPlanVersion: 2 });
    expect(sent[0]).not.toHaveProperty('status');
  });

  it('keeps everything queued when the server fails', async () => {
    await enqueueAction('ARRIVED', { stopId: 's1' }, 't1', 1, kasun);
    vi.stubGlobal('fetch', reply({}, false));
    expect(await flushOutbox()).toBe(0);
    expect(await getPendingActions()).toHaveLength(1);

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await flushOutbox()).toBe(0);
    expect(await getPendingActions()).toHaveLength(1);
  });

  it('does not call the server while the phone is offline', async () => {
    await enqueueAction('ARRIVED', { stopId: 's1' }, 't1', 1, kasun);
    const fetchMock = reply({ applied: [], duplicate: [], rejected: [] });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: false });
    expect(await flushOutbox()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
