# Backend gaps: API changes for S1, S3, L4 and P4

For the frontend owners (Hiruka, Methuli). This page lists the new and changed routes and fields so you can wire them up. All routes are under `/api` and use the session cookie as usual. Types live in `@waypoint/contracts`.

Errors use the usual shapes:

- Rule failures (`DomainError`) return **409** with `{ "reason": "<CODE>", "message": "..." }`. `reasonOf()` in `apps/web/lib/api-error.ts` reads `reason`.
- Validation failures return **400**. The profile routes also return `{ reason, message }` on their 400s (see P4).

---

## S1: stops-away tracking (store home card)

There are no new routes. `StoreDelivery` has two new fields, which appear in every response that returns one:
`GET /store/home` (`delivery`), `GET /store/deliveries`, `GET /store/deliveries/:stopId` and `POST /store/deliveries/:stopId/receipt`.

| Field       | Type               | Meaning                                                                                                                                                                                                                                                                     |
| ----------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stopsAway` | `number \| null`   | Stops on the same trip, earlier in the sequence, that the truck still has to serve (status is not `delivered`, `partial`, `deferred` or `confirmed`). `0` means this store is next. It is `null` unless the trip is `on_road` **and** this stop is `upcoming` or `at_risk`. |
| `track`     | `StoreTrackStop[]` | Every stop on the trip in sequence order: `{ sequence, status, isYou }`. Other stores' names and ids are never sent.                                                                                                                                                        |

```json
{
  "stopId": "ck...",
  "status": "upcoming",
  "stopsAway": 1,
  "track": [
    { "sequence": 1, "status": "delivered", "isYou": false },
    { "sequence": 2, "status": "upcoming", "isYou": false },
    { "sequence": 3, "status": "upcoming", "isYou": true }
  ]
}
```

Suggested copy: `null` → hide the counter. `0` → "You're next". `n` → "n stops away".

---

## S3: urgent flag from the store

### `POST /store/orders` (changed)

The body takes three new optional fields:

```json
{
  "lines": [{ "catalogueId": "F-MILK", "qty": 3 }],
  "urgent": true,
  "stockLevel": "out_of_stock",
  "urgentNote": "Milk shelf empty since noon"
}
```

- `stockLevel`: `'out_of_stock' | 'running_low'` (`StockLevel`). It is **required when `urgent` is true**, otherwise the API returns 400.
- `urgentNote`: optional, trimmed, max 200 characters.
- When `urgent` is false or missing, any `stockLevel` and `urgentNote` are ignored and stored as `null`.
- The cutoff, delivery date and catalogue rules are unchanged.

### New fields on responses

`StoreOrderView` (`GET/POST /store/orders`, `nextOrder` and `deferral` on `/store/home`), `PlanOrder` (`GET /plan`, order detail, defer and bring-back results) and the contract `Order` all gain:

```ts
urgent: boolean;
stockLevel: StockLevel | null;
urgentNote: string | null;
```

### Plan order

In `GET /plan`, `orders` (the waiting list) puts **urgent orders first**. Within each group (urgent, then the rest) the order stays the same as before: by window opening time, then by store name. `movedToLater` is unchanged.

---

## L4: plan change at the dock

### `LoadSheet` changes (`GET /loads/:tripId` and every loads route that returns a sheet)

`LoadStop` gains `isNew: boolean`. It is true for stops that the last acknowledged plan change added. It is cleared when the truck departs.

`PlanLock` changes:

```ts
interface PlanLock {
  locked: boolean;
  planVersion: number;
  ackedPlanVersion: number;
  removed: {
    orderId: string;
    storeName: string;
    lines: OrderLine[]; // the goods to take off the truck
    takenOff: boolean; // the loader has confirmed they are off
  }[];
  added: string[]; // stop ids (unchanged)
  before: PlanLockSlot[]; // the acknowledged plan
  after: PlanLockSlot[]; // the current plan
}

interface PlanLockSlot {
  orderId: string;
  storeName: string;
  change: 'kept' | 'removed' | 'added';
}
```

- `before` and `after` are both in **load order**: index 0 is the first crate onto the truck (the back), and the last entry is nearest the door. This matches `loadOrder`.
- When `locked` is false, `removed`, `added`, `before` and `after` are all empty arrays.

Example (B and A were on the truck, the dispatcher removed A and added C):

```json
{
  "locked": true,
  "removed": [{ "orderId": "A", "storeName": "Store A", "takenOff": false, "lines": [ ... ] }],
  "added": ["stop-C"],
  "before": [
    { "orderId": "B", "storeName": "Store B", "change": "kept" },
    { "orderId": "A", "storeName": "Store A", "change": "removed" }
  ],
  "after": [
    { "orderId": "C", "storeName": "Store C", "change": "added" },
    { "orderId": "B", "storeName": "Store B", "change": "kept" }
  ]
}
```

### `POST /loads/:tripId/taken-off` (new, loader)

The body is `{ "orderId": "..." }` (`TakenOffRequest`). It records that a removed order's goods are off the truck and returns the updated `LoadSheet`. Calling it twice is safe.

| Status | `reason`            | When                                            |
| ------ | ------------------- | ----------------------------------------------- |
| 200    |                     | Recorded, or it was already recorded            |
| 400    |                     | `orderId` missing                               |
| 404    |                     | Trip not found or not in the loader's depot     |
| 409    | `PLAN_NOT_CHANGED`  | The trip is not locked (no pending plan change) |
| 409    | `ORDER_NOT_REMOVED` | `orderId` is not in `lock.removed`              |

### `POST /loads/:tripId/ack` (changed)

- It returns 409 with `REMOVED_GOODS_NOT_TAKEN_OFF` while any `lock.removed[]` entry has `takenOff: false`.
- On success the added stops get `isNew: true` and the taken-off list resets.

Flow: show `removed[].lines` → the loader taps each one → `POST taken-off` for each → `POST ack`.

Progress after a plan change (ticks) stays **on the phone**. The backend only supplies the new stop and line lists.

---

## P4: profile

These routes are new, under `/me`. Every signed-in role can call them. `GET /me` and `POST /auth/logout` are unchanged.

### `PATCH /me/depot`

Body: `{ "depotId": "Peliyagoda" }` (`ChangeDepotRequest`). Returns the updated `Me`.

- Only dispatchers and loaders can use it. Store and driver accounts get **403**, because their depot comes from their store or vehicle.
- An unknown depot returns **404**. A missing `depotId` returns 400.
- The change applies from the next request. A loader signs in with the depot, so after switching, the loader must pick the new depot at the next sign-in.

### `POST /me/password`

Body: `{ "currentSecret": "...", "newSecret": "..." }` (`ChangePasswordRequest`). Returns `{ "ok": true }`.

- The secret is the **password** for dispatcher and store accounts, and the **PIN** for driver and loader accounts.
- New secret rules (exported from contracts as `PASSWORD_MIN_LENGTH` and `PIN_PATTERN`): a password needs at least 8 characters, and a PIN must be 4 to 6 digits.
- **Every other session** of this user is signed out. The current session stays signed in.

| Status | `reason`               | When                                                               |
| ------ | ---------------------- | ------------------------------------------------------------------ |
| 400    | `WRONG_CURRENT_SECRET` | `currentSecret` is wrong (never 401, so the app does not sign out) |
| 400    | `WEAK_SECRET`          | `newSecret` breaks the rules above                                 |

Seeded loaders have no PIN (loader sign-in checks only the depot), so they get `WRONG_CURRENT_SECRET` until a PIN is set for them.

### `GET /me/notification-preferences` and `PUT /me/notification-preferences`

```json
{ "deliveryUpdates": true, "delayAlerts": true, "incidentAlerts": true, "planChanges": true }
```

- `GET` returns all `true` until the user saves something.
- `PUT` needs all four booleans and returns what was saved. An unknown key (for example `sosAlerts`), a missing key or a non-boolean value returns 400.
- **SOS alerts are always sent** and are not a preference.

> **Not enforced yet.** The preferences are only saved. Notifications have no category today, and the notifier is shared across modules, so no notice is filtered by these settings yet. Enforcing them needs a category on each `notify()` call, which means changing the services that own those calls.
