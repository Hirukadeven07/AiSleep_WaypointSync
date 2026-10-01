import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetOutboxForTests,
  enqueueAction,
  getPendingActions,
  getPendingCount,
  markActionSynced,
  purgeSynced,
  toSyncEvent,
} from './outbox';

const kasun = { driverId: 'user_kasun' };

beforeEach(async () => {
  await __resetOutboxForTests();
});

describe('outbox', () => {
  it('queues a PENDING action shaped like DriverEvent', async () => {
    const a = await enqueueAction('SOS_ALERT', { location: null }, 'trip_1', 3, kasun);
    expect(a).toMatchObject({
      driverId: 'user_kasun',
      tripId: 'trip_1',
      type: 'SOS_ALERT',
      payload: { location: null },
      seenPlanVersion: 3,
      status: 'PENDING',
    });
    expect(a.clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(a.createdOnPhoneAt))).toBe(false);
    expect(await getPendingCount()).toBe(1);
  });

  it('gives every action its own clientId and returns them oldest first', async () => {
    const first = await enqueueAction('ARRIVED', {}, 't1', 1, kasun);
    const second = await enqueueAction('ACKNOWLEDGEMENT', {}, 't1', 1, kasun);
    expect(first.clientId).not.toBe(second.clientId);
    expect((await getPendingActions()).map((a) => a.type)).toEqual(['ARRIVED', 'ACKNOWLEDGEMENT']);
  });

  it('markActionSynced removes it from pending, and is safe to repeat', async () => {
    const a = await enqueueAction('ARRIVED', {}, 't1', 1, kasun);
    const b = await enqueueAction('WAITING', {}, 't1', 1, kasun);
    expect(await markActionSynced(a.clientId)).toBe(true);
    expect(await markActionSynced(a.clientId)).toBe(true);
    expect(await markActionSynced('no-such-id')).toBe(false);
    expect((await getPendingActions()).map((x) => x.clientId)).toEqual([b.clientId]);
    expect(await getPendingCount()).toBe(1);
  });

  it('purgeSynced deletes only synced rows', async () => {
    const a = await enqueueAction('ARRIVED', {}, 't1', 1, kasun);
    await enqueueAction('WAITING', {}, 't1', 1, kasun);
    await markActionSynced(a.clientId);
    expect(await purgeSynced()).toBe(1);
    expect(await getPendingCount()).toBe(1);
  });

  it('accepts a null trip for SOS with no active trip', async () => {
    const a = await enqueueAction('SOS_ALERT', { location: null }, null, null, kasun);
    expect(a.tripId).toBeNull();
    expect(a.seenPlanVersion).toBeNull();
  });

  it('refuses to queue when no driver is signed in', async () => {
    await expect(enqueueAction('ARRIVED', {}, 't1', 1)).rejects.toThrow(/no signed-in driver/);
  });

  it('toSyncEvent strips local-only fields', async () => {
    const a = await enqueueAction('ROAD_ISSUE', { kind: 'flood' }, 't1', 2, kasun);
    const event = toSyncEvent(a);
    expect(event).not.toHaveProperty('id');
    expect(event).not.toHaveProperty('status');
    expect(event.clientId).toBe(a.clientId);
  });
});
