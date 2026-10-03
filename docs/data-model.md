# Data model

**Source of truth:** [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma).  
**Picture:** [waypoint-schema.drawio](waypoint-schema.drawio) (same file as the workspace `waypoint_schema.drawio`). Open it in Draw.io — Prisma has no ERD plugin.

`Store` is the running-app name for an **outlet**. Login people are `User` rows (`role` = dispatcher / store / loader / driver). `Driver`, `Loader`, and `Dispatcher` are 1:1 profile tables on that user. Vehicle assignment is `Vehicle.driverId` → `User`, not a column on `Driver`.

Photos are **not** BLOBs. `photoKey` / `signaturePhotoKey` are MinIO object names on the owning row (`LoadFlag`, `StoreReceipt`, `FieldFlag`, `LoaderFlag`).

`Session` is created at login only. Do not seed it.

---

## How the pieces fit

```
Depot → District → Store (outlet) → Order → OrderLine → Item
                 ↘ User (outlet manager, loginId = store.id)
Depot → Vehicle → Trip → TripStop (one order) → StoreReceipt
                 ↘ LoadSession (live dock)    → LoadFlag
                 ↘ LoadingJob (dispatcher handoff)
Order → DeliveryNote (versioned) → DeliveryNoteLine → DeliveryNotePick → InventoryBatch
```

`ServiceAllowance` has **no foreign key**. The planner looks up `minutes` by `Store.brand` + `Store.dockType`.

---

## Tables (37)

### Lookups (CSV / seed)

| Table | Role |
| --- | --- |
| `Depot` | Peliyagoda, Kandy. Parent of stores, vehicles, users, trips. |
| `District` | Unique `name`. Optional `depotId`. Travel fields (`depotToDistrictMin`, `interStopMin`, km) used in trip minutes. |
| `ServiceAllowance` | Unique `(brand, dockType)` → `minutes`. |
| `CalendarDay` | PK is the calendar date. Operating / monsoon / payday flags. |
| `TrafficSpeed` | Hourly speed index by district name. No FK. |
| `RoadCondition` | Daily disruption by district name. No FK. |
| `Item` | Catalogue. `id` is the catalogue code (`F-MILK`, …). `brand` is Fresh / Style / Tech. `type` is the booklet class: `chilled_food`, `fresh`, `style`, `tech`. |
| `InventoryBatch` | FEFO stock for an item. |

### Login and people

| Table | Role |
| --- | --- |
| `User` | Unique `loginId`. `role` picks the home screen. `storeId` for outlet managers. `depotId` for depot staff. Password or PIN hashes. |
| `Session` | Cookie token. `userId` + `expiresAt`. Cascades off `User`. |
| `Notification` | In-app notice for one user. |
| `Driver` | 1:1 `userId`. License / NIC / `isActive`. |
| `DriverPhone` | PK is `phoneNumber`. |
| `Loader` | 1:1 `userId`. Shift morning / night. |
| `Dispatcher` | 1:1 `userId`. Assigns `LoadingJob`, reviews `LoaderFlag`. |

**Outlet manager rule:** one `User` with `role = store` per `Store`. Login id is the outlet id (`OUT001`, …). Password is the store secret. `sunil` is an extra demo login on the same home store.

### Outlet, order, trip

| Table | Role |
| --- | --- |
| `Store` | Outlet. `id` from `outlets.csv`. Brand, district, depot, dock, windows, lat/lng. `daysSinceLastServed` is days since the latest served trip. Phones are `OutletPhone` rows, not a column. |
| `OutletPhone` | Shop / manager / warehouse numbers. `phoneNo` is not unique — the same number can sit on one store twice or on two stores. |
| `Order` | One delivery for one store on one date. Optional `TripStop`. |
| `OrderLine` | Named qty + optional `itemId`. Cascades off `Order`. |
| `Vehicle` | Caps, fuel, `depotId`. Optional unique `driverId`. |
| `Trip` | One vehicle, one depot, one brand, one district, one `serviceDate`. Unique `(vehicleId, serviceDate, tripNumber)`. |
| `TripStop` | One order on a trip. Unique `orderId`. Unique `(tripId, sequence)`. |
| `RouteLeg` | Planned/actual travel between points. Unique `(tripId, seq)`. |
| `LocationPing` | GPS trail. Unique `clientUuid` so phone retries do not duplicate. |

### Dock (two layers)

| Table | Role |
| --- | --- |
| `LoadSession` | **Live** dock. 1:1 `tripId`. `ackedPlanVersion` + `ackedStopIds` power the plan-change lock. |
| `LoadFlag` | Live missing / damaged / wrong_quantity on a stop (optional order line). |
| `LoadingJob` | Dispatcher → loader handoff. 1:1 `tripId`. Status assigned → picking → loaded → handed_over. |
| `DeliveryNote` | Versioned pick list. Composite PK `(dnId, versionAt)`. Current version has `validTo = null`. |
| `DeliveryNoteLine` | Confirmed qty per item on that version. |
| `DeliveryNotePick` | FEFO qty from a batch. |
| `DeliveryNoteLoader` | Who picked / confirmed. Unique `(dnId, versionAt, loaderId)`. |

### Receipt, flags, incidents

| Table | Role |
| --- | --- |
| `StoreReceipt` | 1:1 `stopId`. `lineResults` JSON + signature keys. Signed by a `User`. |
| `FieldFlag` | Raised by the **outlet**, not the driver. Driver only sets `driverDecision`. |
| `LoaderFlag` | Dock issue on a DN version. Dispatcher `validationStatus`. |
| `DriverEvent` | Phone sync audit. Unique `clientId`. Types: SOS_ALERT, ARRIVED, ACKNOWLEDGEMENT, ROAD_ISSUE, FUEL_READING. |
| `Incident` | Legacy dispatcher ticket on a trip (`breakdown` / `delay` / …). Not the same as `DriverIncident`. |
| `DriverIncident` | SOS / on-road incident from the driver profile. Optional reassigned trip. |

---

## Database rules (constraints)

- **One stop per order:** `TripStop.orderId` is unique. An order is on at most one trip.
- **Stop order on a trip:** `@@unique([tripId, sequence])`.
- **Two trips a day:** `tripNumber` is 1 or 2 (`Trip_tripNumber_max_2`). `@@unique([vehicleId, serviceDate, tripNumber])`.
- **One load session / one loading job per trip:** unique `tripId` on both.
- **One receipt per stop:** unique `StoreReceipt.stopId`. Confirm is claimed with an update of `arrived`/`waiting` → `confirmed`.
- **One vehicle driver:** `Vehicle.driverId` is unique (at most one truck per driver).
- **DN versions:** same `dnId`, new `versionAt`. Lines, loaders, and loader flags hang off `(dnId, versionAt)`.
- **Deletes:** trip cascade wipes stops, load session, route legs, pings. Order cascade wipes lines. User cascade wipes sessions and notifications. Receipt `signedBy` is SetNull if the user is removed.
- **No FK:** `ServiceAllowance`, `TrafficSpeed`, `RoadCondition` (string district / brand keys only).

---

## Domain rules the schema supports

These are booklet / app rules. They are enforced in Nest services, not only by unique keys.

| Rule | How it shows in the DB |
| --- | --- |
| One brand, one district per trip | `Trip.brand` + `Trip.districtId` |
| Window owns sequence | `TripStop.sequence` + store `windowOpenMin` / `windowCloseMin` |
| LIFO load | Load order is reverse of `sequence` (app, not a column) |
| Store closes the stop | Driver sets `arrivedAt` → store writes `StoreReceipt` + `storeConfirmedAt` → driver `driverAckAt`. ACK before receipt is rejected |
| Plan-change lock | `LoadSession.ackedPlanVersion` / `ackedStopIds` vs live `Trip.planVersion` and stop ids |
| Stale actions | `DriverEvent.seenPlanVersion` vs `Trip.planVersion` |
| Trip minutes | `District.depotToDistrictMin` + `interStopMin × (stops − 1)` + sum of `ServiceAllowance.minutes` for each stop’s brand + dock |
| Fuel | `trip km / Vehicle.kmPerL`; latest `FUEL_READING` on `Trip.fuelLitresAtEnd` |
| Capacity | `Order.weightKg` / `volumeM3` vs `Vehicle` caps; publish blocked if over |
| Repeat skip | `Order.repeatSkip` / `deferredYesterday` |
| Photos | keys on the flag/receipt row; bytes in MinIO |

**Flags are three tables on purpose**

- `LoadFlag` — live dock sheet (plan lock diffs against it).
- `LoaderFlag` — same issue recorded on the DN when the truck is handed over; dispatcher must review (`pending_dispatcher` blocks a clean handoff in the ERD notes).
- `FieldFlag` — outlet short/damage after receive. Drivers do not raise these.

---

## Who writes what

### Dock

Live state stays in `LoadSession` and `LoadFlag` so the plan-change lock can diff them.

- **Start loading** (`POST /loads/:tripId/start`): `LoadingJob` → `picking`. Each order gets a `DeliveryNote` (`DN-<orderId>`) version `status: picking`, its lines (one per order line with an `itemId`), and a `DeliveryNoteLoader` row.
- **Confirm departure** (`POST /loads/:tripId/depart`): current note `validTo` is set; a `loaded` version is added. `qtyConfirmed` is ordered qty minus missing / wrong-quantity flags. Each dock flag becomes a `LoaderFlag` (`pending_dispatcher`). `LoadingJob` → `handed_over` with loaded weight and volume.

### Store

- **Place order:** every `OrderLine` should carry catalogue `itemId`.
- **Confirm receipt** (`POST /store/deliveries/:stopId/receipt`): one `StoreReceipt`; stop → `confirmed`. Each problem line becomes a `FieldFlag` with `driverDecision: pending`. Order → `delivered` or `partial`.

### Driver (phone → `POST /sync`)

Each event is stored as `DriverEvent` (`clientId` unique). Then:

| Event | Also writes |
| --- | --- |
| `ARRIVED` | `TripStop.status` waiting, `arrivedAt` |
| `ACKNOWLEDGEMENT` | `driverAckAt` (only if `storeConfirmedAt` is set) |
| `FUEL_READING` | `Trip.fuelLitresAtEnd` if newest |
| `SOS_ALERT` | `DriverIncident` |
| `location` pings | `LocationPing` (`clientUuid`) |

The phone `outbox` / `cache_*` tables in the draw.io swimlane are **IndexedDB only**. They are not Prisma models.

---

## Seeded people

| loginId | role | Notes |
| --- | --- | --- |
| `nimal` | dispatcher | Password `waypoint` |
| `sampath` | loader | Depot pick, no password |
| `kasun` | driver | PIN `1234` |
| `sunil` | store | Extra login on the demo Fresh store |
| `OUT001` … | store | One manager per outlet, password `waypoint` |

CSVs load from `DATA_DIR` (`/data` in Docker, or `General Data` on a laptop). `service_allowance.csv` uses column `service_allowance_min`.
