/**
 * IndexedDB outbox for the driver app.
 *
 * Every driver action is written here first, so it survives a refresh and dead signal.
 * Rows mirror the backend `DriverEvent` model. `clientId` is a UUID made on the phone;
 * the database's unique constraint on it stops the same action syncing twice.
 *
 * Tonight: storage + helpers. The push/pull loop (POST /api/sync) comes later and will
 * use getPendingActions() -> toSyncEvent() -> markActionSynced().
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { readCachedMe, type EntityId } from './driver-cache';

export const OUTBOX_DB_NAME = 'waypoint_driver_db';
const DB_VERSION = 1;
const STORE = 'outbox' as const;
const CHANGE_EVENT = 'waypoint:outbox-changed';
const CHANNEL_NAME = 'waypoint_driver_outbox';

export type DriverEventType =
  | 'ARRIVED'
  | 'WAITING'
  | 'ACKNOWLEDGEMENT'
  | 'ROAD_ISSUE'
  | 'SOS_ALERT';

export type OutboxStatus = 'PENDING' | 'SYNCED';

export interface OutboxAction {
  id: number; // local autoIncrement key (not the server's DriverEvent.id)
  clientId: string; // UUID, idempotency key
  driverId: EntityId; // User.id of the driver
  tripId: EntityId | null; // active trip; null only if the driver has none (e.g. SOS)
  type: DriverEventType;
  payload: Record<string, unknown>;
  createdOnPhoneAt: string; // ISO timestamp
  seenPlanVersion: number | null; // Trip.planVersion the driver was looking at
  status: OutboxStatus;
}

type OutboxRecord = Omit<OutboxAction, 'id'> & { id?: number };

/** What POST /api/sync receives per action: a DriverEvent without local-only fields. */
export type SyncEvent = Omit<OutboxAction, 'id' | 'status'>;

interface OutboxDB extends DBSchema {
  outbox: {
    key: number;
    value: OutboxRecord;
    indexes: { 'by-clientId': string; 'by-status': OutboxStatus };
  };
}

let dbPromise: Promise<IDBPDatabase<OutboxDB>> | null = null;

function getDb(): Promise<IDBPDatabase<OutboxDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OutboxDB>(OUTBOX_DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('by-clientId', 'clientId', { unique: true });
        store.createIndex('by-status', 'status');
      },
      terminated() {
        dbPromise = null; // browser killed the connection: reopen on next call
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/* ---------- change notifications (drives the header badge) ---------- */

function channel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
}

function notifyChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
  const c = channel(); // tell other open tabs too
  c?.postMessage('changed');
  c?.close();
}

/** Calls `cb` whenever the outbox changes in this tab or another. Returns an unsubscribe. */
export function subscribeOutbox(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, cb);
  const c = channel();
  if (c) c.onmessage = cb;
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    c?.close();
  };
}

/* ---------- helpers ---------- */

function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // randomUUID needs a secure context; this keeps plain-http dev hosts working
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Queue an action. Resolves once it is safely stored, and the pending badge updates.
 * driverId comes from the cached /api/me session unless passed in `opts`.
 */
export async function enqueueAction(
  type: DriverEventType,
  payload: Record<string, unknown>,
  tripId: EntityId | null,
  seenPlanVersion: number | null,
  opts: { driverId?: EntityId } = {},
): Promise<OutboxAction> {
  const driverId = opts.driverId ?? readCachedMe()?.id;
  if (driverId === undefined || driverId === null) {
    throw new Error('Cannot queue an action: no signed-in driver on this phone.');
  }
  const record: OutboxRecord = {
    clientId: newClientId(),
    driverId,
    tripId,
    type,
    payload,
    createdOnPhoneAt: new Date().toISOString(),
    seenPlanVersion,
    status: 'PENDING',
  };
  const db = await getDb();
  const id = await db.add(STORE, record);
  notifyChanged();
  return { ...record, id };
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  return db.countFromIndex(STORE, 'by-status', 'PENDING');
}

/** Unsynced actions, oldest first (order matters: ARRIVED must reach the server before ACKNOWLEDGEMENT). */
export async function getPendingActions(): Promise<OutboxAction[]> {
  const db = await getDb();
  // Index entries with equal keys come back in primary-key order, i.e. insertion order.
  return (await db.getAllFromIndex(STORE, 'by-status', 'PENDING')) as OutboxAction[];
}

/**
 * Mark an action as synced (kept for audit, excluded from pending). Safe to call twice.
 * Returns false if no action has that clientId.
 */
export async function markActionSynced(clientId: string): Promise<boolean> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const record = await tx.store.index('by-clientId').get(clientId);
  if (record && record.status !== 'SYNCED') await tx.store.put({ ...record, status: 'SYNCED' });
  await tx.done;
  if (record && record.status !== 'SYNCED') notifyChanged();
  return Boolean(record);
}

/** Delete synced rows to keep the store small. Pending rows are never touched. */
export async function purgeSynced(): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const keys = await tx.store.index('by-status').getAllKeys('SYNCED');
  await Promise.all(keys.map((k) => tx.store.delete(k)));
  await tx.done;
  return keys.length;
}

/** Shape one action for the POST /api/sync body. */
export function toSyncEvent(a: OutboxAction): SyncEvent {
  const { id: _id, status: _status, ...event } = a;
  return event;
}

/** Test helper: closes and deletes the database. */
export async function __resetOutboxForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(OUTBOX_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
