# Data model

**Source of truth:** [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma).  
**Picture:** [waypoint-schema.drawio](waypoint-schema.drawio) and [waypoint-schema1.drawio](waypoint-schema1.drawio). Open either in Draw.io — Prisma has no ERD plugin. Field names follow `schema.prisma`.

`Store` is the running-app name for an **outlet**. Login people are `User` rows (`role` = dispatcher / store / loader / driver). `Driver`, `Loader`, and `Dispatcher` are 1:1 profile tables on that user. Vehicle assignment is `Vehicle.driverId` → `User`, not a column on `Driver`.

Photos are **not** BLOBs. `photoKey` is a MinIO object name on `LoadFlag`, `FieldFlag`, and `LoaderFlag`. The storekeeper signature is `StoreReceipt.signaturePhotoKey`.

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

## Tables (40)

### Lookups (CSV / seed)

| Table | Role |
| --- | --- |
| `Depot` | Peliyagoda, Kandy. Parent of stores, vehicles, users, trips. |
| `District` | PK is `name`. Optional `depotId`. Travel fields (`depotToDistrictMin`, `interStopMin`, km) used in trip minutes. |
| `ServiceAllowance` | Unique `(brand, dockType)` → `minutes`. |
| `CalendarDay` | PK is the calendar date. Operating / monsoon / payday flags. |
| `TrafficSpeed` | Hourly speed index by district name. No FK. |
| `RoadCondition` | Daily disruption by district name. No FK. |
| `Item` | Catalogue. `id` is the catalogue code (`F-MILK`, …). Brand is on `Store` and `Order`. `type` is the booklet class: `chilled_food`, `fresh`, `style`, `tech`. |
| `InventoryBatch` | FEFO stock for an item. |

### Login and people

| Table | Role |
| --- | --- |
| `User` | Login account. Unique `loginId`. `role` picks the home screen. `storeId` for outlet managers. `depotId` for depot staff. `passwordHash` or `pinHash`. Optional `notificationPrefs` JSON. Phone numbers live on `DriverPhone`, `LoaderPhone`, `DispatcherPhone`, and `OutletPhone`. |
| `Session` | Cookie token. `userId` + `expiresAt`. Cascades off `User`. |
| `Notification` | In-app notice for one user. |
| `Driver` | 1:1 `userId`. License, `licenseExpiry`, NIC, address, `isActive`. |
| `DriverPhone` | Driver numbers. PK is `phoneNumber`. |
| `Loader` | 1:1 `userId`. Shift morning / night. Optional address. |
| `LoaderPhone` | Loader numbers. PK is `phoneNumber`. |
| `Dispatcher` | 1:1 `userId`. Optional email and address. Assigns `LoadingJob`, reviews `LoaderFlag`. |
| `DispatcherPhone` | Dispatcher numbers. PK is `phoneNumber`. |

**Outlet manager rule:** one `User` with `role = store` per `Store`. Login id is the outlet id (`OUT001`, …). Password is the store secret. `sunil` is an extra demo login on the same home store.

### Outlet, order, trip

| Table | Role |
| --- | --- |
| `Store` | Outlet. `id` from `outlets.csv`. Brand, district, depot, dock, windows, address, email, lat/lng. `daysSinceLastServed` is days since the latest served trip. Outlet numbers are `OutletPhone` rows. |
| `OutletPhone` | Shop / manager / warehouse numbers. `phoneNo` is not unique — the same number can sit on one store twice or on two stores. |
| `StoreSavedItem` | Catalogue items a manager starred for that outlet. Composite PK `(storeId, itemId)`. |
| `Order` | One delivery for one store on one date. Status is `waiting`, `planned`, `deferred`, `delivered`, `partial`, or `cancelled`. Optional `urgent`, `stockLevel`, `cancelledAt`, `cancelledById`. Optional `TripStop`. |
| `OrderLine` | Named qty + optional `itemId`. Cascades off `Order`. |
| `Vehicle` | Caps, fuel, `depotId`, unique `numberPlate`. Optional unique `driverId`. Out of service stores `outOfServiceReason` (required by the app) and optional `returnDate` (date and time). `lastServiceAt` is the last service timestamp. |
| `Trip` | One vehicle, one depot, one brand, one main district, one `serviceDate`. Extra districts may be added beside the main one. `tripNumber` is 1 (morning) or 2 (afternoon). |
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
| `FieldFlag` | Raised by the **outlet**, not the driver. Driver only sets `driverDecision`. `resolveStatus` stays false until a replacement of that item is ordered, or the flag is marked solved. |
| `LoaderFlag` | Dock issue on a DN version. Dispatcher `validationStatus`. |
| `DriverEvent` | Phone sync audit. Unique `clientId`. Types: SOS_ALERT, ARRIVED, ACKNOWLEDGEMENT, ROAD_ISSUE, FUEL_READING. |
| `Incident` | Legacy dispatcher ticket on a trip (`breakdown` / `delay` / …). Not the same as `DriverIncident`. |
| `DriverIncident` | SOS / on-road incident from the driver profile. Optional reassigned trip. |

---

## Database rules (constraints)

These are rules the database itself refuses to break. The app checks some of the same things earlier, so the person sees a clear message instead of a raw database error.

**A vehicle runs at most two trips on one day.** `tripNumber` must be 1 or 2 (`Trip_tripNumber_max_2`): 1 is the morning run, 2 is the afternoon run. The same vehicle cannot have two rows with the same service date and the same trip number (`vehicleId`, `serviceDate`, `tripNumber` together are unique). A second Trip 1 on that truck that day is rejected.

**An order is on at most one trip.** `TripStop.orderId` is unique, so a delivery cannot be a stop on two trips at once. On one trip, two stops cannot share a sequence number (`tripId` + `sequence` is unique). Sequence is the delivery order, earliest window first.

**A driver has at most one vehicle.** `Vehicle.driverId` is unique. The truck keeps that driver until the driver's `leavingDate`. After they leave, another driver can be set on the vehicle. The registration `numberPlate` is also unique when it is filled in.

**A vehicle that is out of service must say why.** The check `Vehicle_out_of_service_needs_reason` requires a non-blank `outOfServiceReason` whenever `status` is `out_of_service`. The reason is cleared when the vehicle is available again. `returnDate` is optional and stores both the date and the time. A blank reason is allowed for any other status.

**One live dock sheet and one loading job per trip.** `LoadSession.tripId` and `LoadingJob.tripId` are each unique. Deleting the trip deletes the session, the job, the stops, the route legs, and the location pings.

**One receipt per stop.** `StoreReceipt.stopId` is unique. The store confirms by moving the stop from `arrived` or `waiting` to `confirmed`. A second confirm does not create a second receipt. If the user who signed is deleted, `signedBy` is cleared and the receipt stays.

**A delivery note is stored as versions.** The primary key is `dnId` plus `versionAt`. The current version is the one with `validTo` empty. Lines, the loaders who worked it, and loader flags all point at that pair. The same loader is recorded once per version (`dnId`, `versionAt`, `loaderId` unique).

**Login names and identity numbers do not repeat.** `User.loginId` is unique. A driver license number and a NIC (`idNo`) are unique when present, and the same is true of a loader or dispatcher employee number. Each profile is one-to-one with its user (`userId` unique). Deleting the user deletes the profile, its phone rows, its sessions, and its notifications.

**A staff phone number is the row's identity.** `DriverPhone`, `LoaderPhone`, and `DispatcherPhone` use `phoneNumber` as the primary key, so one number cannot be stored twice for that role. `OutletPhone.phoneNo` is not unique: the same shop number may appear twice on one outlet, or on two outlets, with a label of shop, manager, or warehouse.

**Starred catalogue items are one row per store and item.** `StoreSavedItem` uses `(storeId, itemId)` as its primary key. Deleting the store or the item deletes those stars.

**Service time is looked up by brand and dock type.** `ServiceAllowance` is unique on `(brand, dockType)` and has no foreign key. `TrafficSpeed` and `RoadCondition` store a district name as text, also with no foreign key. `District` itself is keyed by `name`.

**Retries from the phone do not insert twice.** `DriverEvent.clientId` is unique, and `LocationPing.clientUuid` is unique, so the same tap or the same GPS point sent again updates nothing new.

---

## Domain rules the schema supports

These are booklet / app rules. They are enforced in Nest services, not only by unique keys.

| Rule | How it shows in the DB |
| --- | --- |
| One brand per trip, one main district | `Trip.brand` + `Trip.districtId`. Extra districts sit on `Trip.extraDistricts` |
| Window owns sequence | `TripStop.sequence` + store `windowOpenMin` / `windowCloseMin` |
| LIFO load | Load order is reverse of `sequence` (app, not a column) |
| Store closes the stop | Driver sets `arrivedAt` → store writes `StoreReceipt` + `storeConfirmedAt` → driver `driverAckAt`. ACK before receipt is rejected |
| Plan-change lock | `LoadSession.ackedPlanVersion` / `ackedStopIds` vs live `Trip.planVersion` and stop ids |
| Stale actions | `DriverEvent.seenPlanVersion` vs `Trip.planVersion` |
| Trip minutes | `District.depotToDistrictMin` + `interStopMin × (stops − 1)` + sum of `ServiceAllowance.minutes` for each stop’s brand + dock |
| Fuel | `trip km / Vehicle.kmPerL`; latest `FUEL_READING` on `Trip.fuelLitresAtEnd` |
| Capacity | `Order.weightKg` / `volumeM3` vs `Vehicle` caps; publish blocked if over |
| Repeat skip | `Order.repeatSkip` / `deferredYesterday` |
| Vehicle keeps its driver | `Vehicle.driverId` is that driver until `Driver.leavingDate`. The plan screen does not put a different driver on the trip |
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
