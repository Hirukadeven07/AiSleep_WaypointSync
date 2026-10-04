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

---

## Seeded sample

First five rows in the local database, in primary-key order, so a teammate can see real values before the final changes. Password and PIN hashes are left out. A long value is cut off. A blank cell is null. The count is the whole table. `_TripExtraDistricts` is the link between a trip and its extra districts; it has no rows yet.

### CalendarDay (910 rows)

| id | dow | isWeekend | isoYear | isoWeek | isPayday | festival | festivalRamp | isHoliday | monsoon | isOperating |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2024-01-01 | 0 | false | 2024 | 1 | false |  | 0 | false | false | true |
| 2024-01-02 | 1 | false | 2024 | 1 | false |  | 0 | false | false | true |
| 2024-01-03 | 2 | false | 2024 | 1 | false |  | 0 | false | false | true |
| 2024-01-04 | 3 | false | 2024 | 1 | false |  | 0 | false | false | true |
| 2024-01-05 | 4 | false | 2024 | 1 | false |  | 0 | false | false | true |

### DeliveryNote (22 rows)

| dnId | versionAt | orderId | status | validTo | changedById | changeReason |
| --- | --- | --- | --- | --- | --- | --- |
| dn-cmuppyufz092zahswmpzgp636 | 2026-10-03 18:30 | cmuppyufz092zahswmpzgp636 | picking |  | cmuppyuj60947ahswznphd535 | demo pick list |
| dn-cmuppyugg0937ahswhnuucedx | 2026-10-03 18:30 | cmuppyugg0937ahswhnuucedx | picking |  | cmuppyuj60947ahswznphd535 | demo pick list |
| dn-cmuppyugm093eahswuoybokm8 | 2026-10-03 18:30 | cmuppyugm093eahswuoybokm8 | picking |  | cmuppyuj60947ahswznphd535 | demo pick list |
| DN-cmuppyugz093oahsw05yw3ajt | 2026-10-01 04:00 | cmuppyugz093oahsw05yw3ajt | picking |  | cmuppyuj60947ahswznphd535 | initial pick list |
| dn-cmurbm3cb017u5qefenh1wrbk | 2026-10-03 18:30 | cmurbm3cb017u5qefenh1wrbk | picking |  | cmuppyuj60947ahswznphd535 | demo pick list |

### DeliveryNoteLine (47 rows)

| id | dnId | versionAt | itemId | qtyConfirmed | shortageReason |
| --- | --- | --- | --- | --- | --- |
| cmuppyuks094fahsw8eiot41w | DN-cmuppyugz093oahsw05yw3ajt | 2026-10-01 04:00 | F-CHKN | 2 |  |
| cmuppyuks094gahswyqusccgw | DN-cmuppyugz093oahsw05yw3ajt | 2026-10-01 04:00 | F-MILK | 4 |  |
| cmuppyuks094hahswrco2eyur | DN-cmuppyugz093oahsw05yw3ajt | 2026-10-01 04:00 | F-BREAD | 2 |  |
| dnl-line-cmuppyufz092zahswmpzgp636-F-BREAD | dn-cmuppyufz092zahswmpzgp636 | 2026-10-03 18:30 | F-BREAD | 4 |  |
| dnl-line-cmuppyufz092zahswmpzgp636-F-MILK | dn-cmuppyufz092zahswmpzgp636 | 2026-10-03 18:30 | F-MILK | 6 |  |

### DeliveryNoteLoader (22 rows)

| id | dnId | versionAt | loaderId | role | startedAt | finishedAt |
| --- | --- | --- | --- | --- | --- | --- |
| cmuppyuks094jahsw4w7loie4 | DN-cmuppyugz093oahsw05yw3ajt | 2026-10-01 04:00 | cmuppyuj60947ahswznphd535 | picking | 2026-10-01 15:59 |  |
| dnl-cmuppyufz092zahswmpzgp636 | dn-cmuppyufz092zahswmpzgp636 | 2026-10-03 18:30 | cmuppyuj60947ahswznphd535 | picking | 2026-10-03 18:30 |  |
| dnl-cmuppyugg0937ahswhnuucedx | dn-cmuppyugg0937ahswhnuucedx | 2026-10-03 18:30 | cmuppyuj60947ahswznphd535 | picking | 2026-10-03 18:30 |  |
| dnl-cmuppyugm093eahswuoybokm8 | dn-cmuppyugm093eahswuoybokm8 | 2026-10-03 18:30 | cmuppyuj60947ahswznphd535 | picking | 2026-10-03 18:30 |  |
| dnl-cmurbm3cb017u5qefenh1wrbk | dn-cmurbm3cb017u5qefenh1wrbk | 2026-10-03 18:30 | cmuppyuj60947ahswznphd535 | picking | 2026-10-03 18:30 |  |

### DeliveryNotePick (45 rows)

| id | dnLineId | batchId | qty |
| --- | --- | --- | --- |
| cmuppyul5094lahsw2hor7ekl | cmuppyuks094gahswyqusccgw | BATCH-F-MILK | 2 |
| pick-dnl-line-cmuppyufz092zahswmpzgp636-F-BREAD | dnl-line-cmuppyufz092zahswmpzgp636-F-BREAD | BATCH-F-BREAD | 4 |
| pick-dnl-line-cmuppyufz092zahswmpzgp636-F-MILK | dnl-line-cmuppyufz092zahswmpzgp636-F-MILK | BATCH-F-MILK | 6 |
| pick-dnl-line-cmuppyufz092zahswmpzgp636-F-VEG | dnl-line-cmuppyufz092zahswmpzgp636-F-VEG | BATCH-F-VEG | 3 |
| pick-dnl-line-cmuppyugg0937ahswhnuucedx-F-RICE | dnl-line-cmuppyugg0937ahswhnuucedx-F-RICE | BATCH-F-RICE | 4 |

### Depot (2 rows)

| id | name | telephone | email | address | lat | lng |
| --- | --- | --- | --- | --- | --- | --- |
| depo1 | Peliyagoda | 011 293 9100 | peliyagoda@waypoint.lk | 148 Negombo Road, Peliyagoda | 6.9678 | 79.8832 |
| depo2 | Kandy | 081 223 8450 | kandy@waypoint.lk | 27 William Gopallawa Mawatha, Kandy | 7.2906 | 80.6337 |

### Dispatcher (1 row)

| id | userId | employeeNo | lastLoginAt | isActive | email | address |
| --- | --- | --- | --- | --- | --- | --- |
| cmuppyujd0949ahsw6bow5lhr | cmuppyuae092pahswvmx7xq1j | DSP-001 | 2026-10-01 15:59 | true | nimal@waypoint.lk | 4 Depot Office, Peliyagoda |

### DispatcherPhone (1 row)

| phoneNumber | dispatcherId |
| --- | --- |
| 0112000000 | cmuppyujd0949ahsw6bow5lhr |

### District (12 rows)

| name | depotId | served | roadClass | freeFlowKmh | depotToDistrictKm | depotToDistrictMin | interStopKm | interStopMin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Badulla | depo2 | true | hill | 42 | 130 | 186 | 16 | 23 |
| Colombo | depo1 | true | urban | 30 | 12 | 24 | 4 | 8 |
| Galle | depo1 | true | highway | 70 | 120 | 103 | 10 | 9 |
| Gampaha | depo1 | true | suburban | 45 | 28 | 37 | 7 | 9 |
| Kalutara | depo1 | true | suburban | 45 | 48 | 64 | 9 | 12 |

### Driver (71 rows)

| id | userId | licenseNo | idNo | joinDate | leavingDate | lastLoginAt | isActive | licenseExpiry | address |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyuiu0945ahsw76l1sfl2 | cmuppyuaq092vahswi6i7eszo | B1234567 | 199012345V | 2022-03-01 |  | 2026-10-01 15:59 | true | 2026-07-01 | 20 Lake Road, Peliyagoda |
| cmuqqesy3007064hi57o3t9iq | cmuqqesxm006y64hima50g8fv | B2000001 | 199000001V | 2019-01-12 |  | 2026-10-02 18:52 | true | 2026-07-02 | 21 Lake Road, Peliyagoda |
| cmuqqesz3007464hitp1wr57x | cmuqqesz0007264hi54ivxgs7 | B2000002 | 199000002V | 2019-01-23 |  | 2026-10-02 18:52 | true | 2026-07-03 | 22 Lake Road, Peliyagoda |
| cmuqqeszk007864hibmysuhdq | cmuqqeszg007664hivydmijhp | B2000003 | 199000003V | 2019-02-03 |  | 2026-10-02 18:52 | true | 2026-07-04 | 23 Lake Road, Peliyagoda |
| cmuqqet02007c64hiokpy6ty5 | cmuqqet00007a64hi818iid1m | B2000004 | 199000004V | 2019-02-14 |  | 2026-10-02 18:52 | true | 2026-07-05 | 24 Lake Road, Peliyagoda |

### DriverEvent (7 rows)

| id | clientId | driverId | tripId | type | payload | createdOnPhoneAt | seenPlanVersion | appliedAt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuqj61180077128gsb2p9ps2 | seed-arrived-cmuppyufu092xahswqj3cytia | cmuppyuaq092vahswi6i7eszo | cmuppyufu092xahswqj3cytia | ARRIVED | {"stopId":"cmuppyuga0935ahswy6dkwz97"} | 2026-10-02 05:16 | 1 | 2026-10-02 05:36 |
| cmuqj61180078128gr6a2maeb | seed-ack-cmuppyufu092xahswqj3cytia | cmuppyuaq092vahswi6i7eszo | cmuppyufu092xahswqj3cytia | ACKNOWLEDGEMENT | {"stopId":"cmuppyuga0935ahswy6dkwz97"} | 2026-10-02 05:31 | 1 | 2026-10-02 05:36 |
| demo-ev-cmuppyugw093mahswbcrogboy | demo-ev-cmuppyugw093mahswbcrogboy | cmuppyuaq092vahswi6i7eszo | cmuppyugw093mahswbcrogboy | ARRIVED | {"stopId":"demo"} | 2026-10-04 03:30 | 1 | 2026-10-04 03:30 |
| demo-ev-cmurbm3c6017s5qef0doy1efh | demo-ev-cmurbm3c6017s5qef0doy1efh | cmuqqesxm006y64hima50g8fv | cmurbm3c6017s5qef0doy1efh | ARRIVED | {"stopId":"demo"} | 2026-10-04 03:30 | 1 | 2026-10-04 03:30 |
| demo-ev-cmurdd48w0016hcnoqn0hty95 | demo-ev-cmurdd48w0016hcnoqn0hty95 | cmuqqeth000bi64hi2feoby9x | cmurdd48w0016hcnoqn0hty95 | ARRIVED | {"stopId":"demo"} | 2026-10-04 03:30 | 1 | 2026-10-04 03:30 |

### DriverIncident (2 rows)

| id | driverId | tripId | vehicleId | incidentType | severity | message | lat | lng | lastStopId | raisedAt | acknowledgedAt | acknowledgedBy | resolvedAt | resolution | reassignedTripId |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyum3094wahswsooqn6qh | cmuppyuiu0945ahsw76l1sfl2 | cmuppyugw093mahswbcrogboy | VEH009 | sos | high | Breakdown on Baseline Road — requesting assis… | 6.941 | 79.863 | cmuppyuh3093uahsw2fzcy1bt | 2026-10-01 15:59 |  |  |  |  |  |
| demo-drv-inc-1 | cmuppyuiu0945ahsw76l1sfl2 | cmurbm3c6017s5qef0doy1efh | VEH001 | delay | low | Held in traffic near the first shop | 6.94 | 79.86 |  | 2026-10-04 |  |  |  |  |  |

### DriverPhone (71 rows)

| phoneNumber | driverId |
| --- | --- |
| 0771234567 | cmuppyuiu0945ahsw76l1sfl2 |
| 0772000001 | cmuqqesy3007064hi57o3t9iq |
| 0772000002 | cmuqqesz3007464hitp1wr57x |
| 0772000003 | cmuqqeszk007864hibmysuhdq |
| 0772000004 | cmuqqet02007c64hiokpy6ty5 |

### FieldFlag (2 rows)

| id | raisedAt | storeId | orderId | tripId | itemId | qtyFlagged | reason | reasonDetail | severity | driverDecision | driverDecidedAt | driverNote | resolvedAt | photoKey | resolveStatus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyulh094pahsw2cl1m2i8 | 2026-10-01 15:59 | OUT001 | cmuppyugz093oahsw05yw3ajt | cmuppyugw093mahswbcrogboy | F-MILK | 1 | damaged | One milk crate arrived with a split bottle. | medium | pending |  |  |  |  | false |
| demo-flag-solved | 2026-10-04 | OUT002 | cmuppyufz092zahswmpzgp636 | cmuppyufu092xahswqj3cytia | F-MILK | 1 | damaged | Demo: one pack damaged, replacement sent | medium | accepted |  |  | 2026-10-04 |  | true |

### Incident (5 rows)

| id | type | tripId | status | timeline | createdAt |
| --- | --- | --- | --- | --- | --- |
| cmuqj611f007a128gjtmjla25 | breakdown | cmuppyugw093mahswbcrogboy | open | [{"at":"2026-10-02T05:36:34.754Z","text":"Bre… | 2026-10-02 05:36 |
| demo-inc-delay | delay | cmuppyugw093mahswbcrogboy | open | [{"at":"2026-10-03T18:30:58.985Z","note":"Abo… | 2026-10-04 |
| demo-inc-quiet | quiet_driver | cmuppyugw093mahswbcrogboy | open | [{"at":"2026-10-03T18:30:58.992Z","note":"No … | 2026-10-04 |
| inc-delay | delay | cmurbm3c6017s5qef0doy1efh | open | [{"at":"2026-10-02T19:29:59.385Z","by":"dispa… | 2026-10-03 00:59 |
| inc-quiet_driver | quiet_driver | cmuppyufu092xahswqj3cytia | open | [{"at":"2026-10-02T19:29:59.392Z","by":"dispa… | 2026-10-03 00:59 |

### InventoryBatch (35 rows)

| id | itemId | batchName | manufacturingDate | expiryDate | qty |
| --- | --- | --- | --- | --- | --- |
| BATCH-F-BREAD | F-BREAD | F-BREAD-2026-W40 | 2026-09-20 | 2027-09-20 | 80 |
| BATCH-F-BUTTR | F-BUTTR | F-BUTTR-2026-W40 | 2026-09-20 | 2026-10-20 | 80 |
| BATCH-F-CHEE | F-CHEE | F-CHEE-2026-W40 | 2026-09-20 | 2026-10-20 | 80 |
| BATCH-F-CHKN | F-CHKN | F-CHKN-2026-W40 | 2026-09-20 | 2026-10-20 | 80 |
| BATCH-F-CREAM | F-CREAM | F-CREAM-2026-W40 | 2026-09-20 | 2026-10-20 | 80 |

### Item (35 rows)

| id | itemName | isChilled | packLabel | packWeightKg | type |
| --- | --- | --- | --- | --- | --- |
| F-BREAD | Sandwich bread | false | crate of 20 | 9 | fresh |
| F-BUTTR | Butter 500 g | true | carton of 20 | 10 | chilled_food |
| F-CHEE | Cheddar cheese | true | crate of 8 | 8 | chilled_food |
| F-CHKN | Chicken, whole | true | box of 10 | 12 | chilled_food |
| F-CREAM | Fresh cream 200 ml | true | crate of 24 | 5.2 | chilled_food |

### LoadFlag (1 row)

| id | stopId | orderLineId | type | qty | note | photoKey | createdAt | resolvedAt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuqj610v0074128gxubikgsf | cmuppyuga0935ahswy6dkwz97 | cmuppyufz0931ahswdhv6zo0f | missing | 1 | Demo: one pack short at dock. | load-flags/demo.png | 2026-10-02 05:36 | 2026-10-04 |

### LoadSession (8 rows)

| id | tripId | loaderIds | startedAt | finishedAt | departedAt | paused | ackedPlanVersion | ackedStopIds | takenOffOrderIds | newOrderIds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyuh5093wahsw06ems7qm | cmuppyugw093mahswbcrogboy | [] | 2026-10-01 15:59 |  | 2026-10-04 03:30 | false | 1 | [] | [] | [] |
| demo-session-cmurbm3c6017s5qef0doy1efh | cmurbm3c6017s5qef0doy1efh | ["cmuppyuam092tahswqfk3w0xp"] | 2026-10-03 18:30 | 2026-10-03 18:30 | 2026-10-04 03:30 | false | 1 | ["cmurbm3cb017u5qefenh1wrbk","cmurbm3cm01815q… | [] | [] |
| demo-session-cmurdd47d000ohcno9w1d549o | cmurdd47d000ohcno9w1d549o | ["cmuppyuam092tahswqfk3w0xp"] | 2026-10-03 18:30 |  |  | false | 1 | ["cmurdd473000jhcno3famtc0w"] | [] | [] |
| demo-session-cmurdd48w0016hcnoqn0hty95 | cmurdd48w0016hcnoqn0hty95 | ["cmuppyuam092tahswqfk3w0xp"] | 2026-10-03 18:30 | 2026-10-03 18:30 | 2026-10-04 03:30 | false | 1 | ["cmurdd48r0011hcnofawg5655"] | [] | [] |
| demo-session-cmurdd49h001fhcno6lywr2zt | cmurdd49h001fhcno6lywr2zt | ["cmuppyuam092tahswqfk3w0xp"] | 2026-10-03 18:30 | 2026-10-03 18:30 | 2026-10-03 18:30 | false | 1 | ["cmurdd49c001ahcnolglchaek"] | [] | [] |

### Loader (201 rows)

| id | userId | employeeNo | idNo | shift | joinDate | leavingDate | lastLoginAt | isActive | address |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyuj60947ahswznphd535 | cmuppyuam092tahswqfk3w0xp | LDR-014 | 199512378V | morning | 2023-06-15 |  | 2026-10-01 15:59 | true | 8 Dock Lane, Peliyagoda |
| cmuqqqwy800es1095o56a0hh1 | cmuqqqwxs00eq1095jemjge6x | LDR-L001 | 198000001V | morning | 2020-01-08 |  | 2026-10-02 18:52 | true | 9 Dock Lane, Peliyagoda |
| cmuqqqwyf00ew10952szq7p51 | cmuqqqwyc00eu10950gtbad4c | LDR-L002 | 198000002V | night | 2020-01-15 |  | 2026-10-02 18:52 | true | 10 Dock Lane, Peliyagoda |
| cmuqqqwym00f01095854lmlcn | cmuqqqwyi00ey1095pmgeszff | LDR-L003 | 198000003V | morning | 2020-01-22 |  | 2026-10-02 18:52 | true | 11 Dock Lane, Peliyagoda |
| cmuqqqwyr00f410953j48twaa | cmuqqqwyo00f21095fyqw7rb5 | LDR-L004 | 198000004V | night | 2020-01-29 |  | 2026-10-02 18:52 | true | 12 Dock Lane, Peliyagoda |

### LoaderFlag (2 rows)

| id | raisedAt | loaderId | dnId | versionAt | scope | itemId | qtyFlagged | reason | reasonDetail | validationStatus | reviewedById | reviewedAt | reviewNote | photoKey |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyul8094nahswhsx413b7 | 2026-10-01 15:59 | cmuppyuj60947ahswznphd535 | DN-cmuppyugz093oahsw05yw3ajt | 2026-10-01 04:00 | item | F-MILK | 1 | crate crushed at dock | Outer crate split; 1 bottle leaking. Hold bac… | pending_dispatcher |  |  |  |  |
| demo-loader-flag | 2026-10-04 | cmuppyuj60947ahswznphd535 | dn-cmuppyugg0937ahswhnuucedx | 2026-10-03 18:30 | item | F-BREAD | 1 | crate crushed | Demo dock flag | pending_dispatcher |  |  |  |  |

### LoaderPhone (201 rows)

| phoneNumber | loaderId |
| --- | --- |
| 0771000000 | cmuppyuj60947ahswznphd535 |
| 0771000001 | cmuqqqwy800es1095o56a0hh1 |
| 0771000002 | cmuqqqwyf00ew10952szq7p51 |
| 0771000003 | cmuqqqwym00f01095854lmlcn |
| 0771000004 | cmuqqqwyr00f410953j48twaa |

### LoadingJob (13 rows)

| id | tripId | depot | assignedById | assignedAt | bay | loadByTime | instructions | priority | status | startedAt | loadedAt | handedOverAt | totalWeightKg | totalVolumeM3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyukk094dahsw0bl0d6do | cmuppyufu092xahswqj3cytia | depo1 | cmuppyujd0949ahsw6bow5lhr | 2026-10-01 15:59 | Bay-2 |  | Chill first. Confirm DN version before handin… | 1 | assigned |  |  |  | 420 | 4.8 |
| demo-job-cmuppyugw093mahswbcrogboy | cmuppyugw093mahswbcrogboy | depo1 | cmuppyujd0949ahsw6bow5lhr | 2026-10-04 | Bay 2 |  | Load last shop first. | 0 | handed_over | 2026-10-03 18:30 |  | 2026-10-03 18:30 |  |  |
| demo-job-cmurbm3c6017s5qef0doy1efh | cmurbm3c6017s5qef0doy1efh | depo1 | cmuppyujd0949ahsw6bow5lhr | 2026-10-04 | Bay 2 |  | Load last shop first. | 0 | handed_over | 2026-10-03 18:30 |  | 2026-10-03 18:30 |  |  |
| demo-job-cmurdd46a000fhcno71sowl1j | cmurdd46a000fhcno71sowl1j | depo2 | cmuppyujd0949ahsw6bow5lhr | 2026-10-04 | Bay 2 |  | Load last shop first. | 0 | assigned |  |  |  |  |  |
| demo-job-cmurdd47d000ohcno9w1d549o | cmurdd47d000ohcno9w1d549o | depo2 | cmuppyujd0949ahsw6bow5lhr | 2026-10-04 | Bay 2 |  | Load last shop first. | 0 | picking | 2026-10-03 18:30 |  |  |  |  |

### LocationPing (21 rows)

| id | clientUuid | tripId | driverId | lat | lng | accuracyM | speedKmh | recordedAt | receivedAt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyulx094sahswy2i1nkmv | ping-cmuppyugw093mahswbcrogboy-1 | cmuppyugw093mahswbcrogboy | cmuppyuiu0945ahsw76l1sfl2 | 6.958 | 79.899 | 8 | 34 | 2026-10-01 15:47 | 2026-10-01 15:59 |
| cmuppyulx094tahswhpbseka3 | ping-cmuppyugw093mahswbcrogboy-2 | cmuppyugw093mahswbcrogboy | cmuppyuiu0945ahsw76l1sfl2 | 6.941 | 79.863 | 6 | 18 | 2026-10-01 15:55 | 2026-10-01 15:59 |
| cmuppyulx094uahswg2zq47ch | ping-cmuppyugw093mahswbcrogboy-3 | cmuppyugw093mahswbcrogboy | cmuppyuiu0945ahsw76l1sfl2 | 6.927 | 79.861 | 5 | 0 | 2026-10-01 15:59 | 2026-10-01 15:59 |
| demo-ping-cmurbm3c6017s5qef0doy1efh-0 | demo-ping-cmurbm3c6017s5qef0doy1efh-0 | cmurbm3c6017s5qef0doy1efh | cmuqqesy3007064hi57o3t9iq | 6.9344 | 79.8428 | 8 | 32 | 2026-10-03 03:00 | 2026-10-04 |
| demo-ping-cmurbm3c6017s5qef0doy1efh-1 | demo-ping-cmurbm3c6017s5qef0doy1efh-1 | cmurbm3c6017s5qef0doy1efh | cmuqqesy3007064hi57o3t9iq | 6.939 | 79.8507 | 8 | 32 | 2026-10-03 03:12 | 2026-10-04 |

### Notification (3 rows)

| id | userId | title | body | link | read | createdAt |
| --- | --- | --- | --- | --- | --- | --- |
| cmuppyuhf0943ahswo9dn7oq7 | cmuppyuak092rahsw8zmn6kd9 | Delivery moved to tomorrow | One order was moved from 2026-10-01 to 2026-1… | /store/updates | false | 2026-10-01 15:59 |
| demo-note-1 | cmuqqesxm006y64hima50g8fv | Plan ready | Tomorrow has waiting orders to route. | /dispatch/plan | false | 2026-10-04 |
| demo-note-2 | cmuqqesxm006y64hima50g8fv | Store report | A shop marked a short delivery. | /dispatch/board | true | 2026-10-04 |

### Order (80 rows)

| id | storeId | brand | deliveryDate | temp | status | units | weightKg | volumeM3 | urgentNote | movedFromDate | deferReason | deferredById | deferredYesterday | repeatSkip | createdAt | urgent | stockLevel | cancelledAt | cancelledById |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyufz092zahswmpzgp636 | OUT002 | Fresh | 2026-10-01 | chilled | delivered | 13 | 156.6 | 0.483 |  |  |  |  | false | false | 2026-10-01 15:59 | false |  |  |  |
| cmuppyugg0937ahswhnuucedx | OUT003 | Fresh | 2026-10-01 | chilled | planned | 9 | 93 | 0.15 |  |  |  |  | false | false | 2026-10-01 15:59 | false |  |  |  |
| cmuppyugm093eahswuoybokm8 | OUT004 | Fresh | 2026-10-01 | chilled | planned | 8 | 92.4 | 0.252 |  |  |  |  | false | false | 2026-10-01 15:59 | false |  |  |  |
| cmuppyugz093oahsw05yw3ajt | OUT001 | Fresh | 2026-10-04 | chilled | planned | 8 | 92.4 | 0.252 |  |  |  |  | false | false | 2026-10-01 15:59 | false |  |  |  |
| cmuppyuhb093yahswy576x4vf | OUT001 | Fresh | 2026-10-02 | chilled | deferred | 9 | 93 | 0.15 |  | 2026-10-01 | Fleet over capacity at Peliyagoda today |  | false | false | 2026-10-01 15:59 | false |  |  |  |

### OrderLine (155 rows)

| id | orderId | name | qty | pack | chilled | unitWeightKg | unitVolumeM3 | itemId |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyufz0931ahswdhv6zo0f | cmuppyufz092zahswmpzgp636 | Fresh milk 1 L | 6 | crate of 12 | true | 12.6 | 0.018 | F-MILK |
| cmuppyufz0932ahswu3ys8w6m | cmuppyufz092zahswmpzgp636 | Sandwich bread | 4 | crate of 20 | false | 9 | 0.06 | F-BREAD |
| cmuppyufz0933ahswj7snght7 | cmuppyufz092zahswmpzgp636 | Mixed vegetables | 3 | crate | false | 15 | 0.045 | F-VEG |
| cmuppyugg0939ahswyeyryev9 | cmuppyugg0937ahswhnuucedx | Set yoghurt | 5 | tray of 24 | true | 2.6 | 0.006 | F-YOG |
| cmuppyugg093aahswvm78bbm5 | cmuppyugg0937ahswhnuucedx | Samba rice 5 kg | 4 | bundle of 4 | false | 20 | 0.03 | F-RICE |

### OutletPhone (242 rows)

| id | storeId | phoneNo | label |
| --- | --- | --- | --- |
| cmuppyujm094aahswv2s7yck7 | OUT001 | 0112345678 | shop |
| cmuppyujm094bahswjeq7au52 | OUT001 | 0778765432 | manager |
| cmurbm35t01135qefqyoee37m | OUT001 | 0774100000 | manager |
| cmurbm35t01145qefk3hbfrku | OUT001 | 0112345678 | warehouse |
| cmurbm35t01155qefh43l73b3 | OUT002 | 0112345678 | shop |

### RoadCondition (10920 rows)

| id | date | districtName | disruptionIndex | raw |
| --- | --- | --- | --- | --- |
| cmuppysxs00ncahsw2r8bv37d | 2024-01-01 | Colombo | 100 | {"date":"2024-01-01","district":"Colombo","di… |
| cmuppysxs00ndahswlwwt58zg | 2024-01-02 | Colombo | 81 | {"date":"2024-01-02","district":"Colombo","di… |
| cmuppysxs00neahswpghdzrkz | 2024-01-03 | Colombo | 100 | {"date":"2024-01-03","district":"Colombo","di… |
| cmuppysxs00nfahsw5gose2lb | 2024-01-04 | Colombo | 100 | {"date":"2024-01-04","district":"Colombo","di… |
| cmuppysxs00ngahswk5p6huba | 2024-01-05 | Colombo | 98 | {"date":"2024-01-05","district":"Colombo","di… |

### RouteLeg (22 rows)

| id | tripId | seq | fromPoint | toOutlet | distanceKm | plannedDepartTime | plannedTravelMin | actualDepartTime | actualTravelMin | monsoon | trafficBand |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyulo094rahswhwwolxid | cmuppyugw093mahswbcrogboy | 1 | Peliyagoda depot | OUT001 | 12.4 |  | 28 |  | 31 | false | peak |
| demo-leg-cmuppyufu092xahswqj3cytia-1 | cmuppyufu092xahswqj3cytia | 1 | Peliyagoda depot | Fort Market 2 | 4.8 |  | 7 |  |  | false | free |
| demo-leg-cmuppyufu092xahswqj3cytia-2 | cmuppyufu092xahswqj3cytia | 2 | Fort Market 2 | Palm Fresh 3 | 1.6 |  | 5 |  |  | false | free |
| demo-leg-cmuppyufu092xahswqj3cytia-3 | cmuppyufu092xahswqj3cytia | 3 | Palm Fresh 3 | Harbour Stores 4 | 1.6 |  | 5 |  |  | false | free |
| demo-leg-cmurbm3c6017s5qef0doy1efh-1 | cmurbm3c6017s5qef0doy1efh | 1 | Peliyagoda depot | Lakeview Grocers 1 | 5.8 |  | 9 |  |  | false | free |

### ServiceAllowance (9 rows)

| id | brand | dockType | minutes |
| --- | --- | --- | --- |
| cmuqj60lk0000128gw1yqbr2i | Fresh | rear_dock | 15 |
| cmuqj60me0001128gu6qpfps3 | Fresh | street | 16 |
| cmuqj60mf0002128g9vllxkbz | Fresh | mall_bay | 18 |
| cmuqj60mh0003128g2fxuk6e6 | Style | rear_dock | 38 |
| cmuqj60mi0004128g0yc8z9l1 | Style | street | 46 |

### Session (3 rows)

| id | userId | createdAt | expiresAt |
| --- | --- | --- | --- |
| 5b83eaa77ecbe497028ca9724cbe5ebccf3e5d5335ba4… | cmuppyuak092rahsw8zmn6kd9 | 2026-10-02 09:20 | 2026-10-02 21:20 |
| 5faae9eb61c2577b02440ba00990c36641b699d950b36… | cmuppyuae092pahswvmx7xq1j | 2026-10-02 08:21 | 2026-10-02 20:21 |
| 60baccd069f0df7e1221fc14cb3f9810f6595df901654… | cmuppyuak092rahsw8zmn6kd9 | 2026-10-02 10:05 | 2026-10-02 22:05 |

### Store (120 rows)

| id | displayName | brand | districtId | depotId | dockType | parkingConstraint | mallWindow | windowOpenMin | windowCloseMin | lat | lng | daysSinceLastServed | address | email |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OUT001 | Lakeview Grocers 1 | Fresh | Colombo | depo1 | street | van_only |  | 480 | 1020 | 6.9344 | 79.8428 | 0 | 12 Temple Road, Colombo | out001@shops.waypoint.lk |
| OUT002 | Fort Market 2 | Fresh | Colombo | depo1 | street | van_only |  | 480 | 1020 | 6.939 | 79.8507 | 2 | 13 Temple Road, Colombo | out002@shops.waypoint.lk |
| OUT003 | Palm Fresh 3 | Fresh | Colombo | depo1 | street | van_only |  | 480 | 1020 | 6.925 | 79.848 |  | 14 Temple Road, Colombo | out003@shops.waypoint.lk |
| OUT004 | Harbour Stores 4 | Fresh | Colombo | depo1 | street | normal |  | 480 | 1020 | 6.911 | 79.8486 |  | 15 Temple Road, Colombo | out004@shops.waypoint.lk |
| OUT005 | Green Basket 5 | Fresh | Colombo | depo1 | rear_dock | normal |  | 480 | 1020 | 6.893 | 79.856 |  | 16 Temple Road, Colombo | out005@shops.waypoint.lk |

### StoreReceipt (4 rows)

| id | stopId | lineResults | chilledWasCold | createdAt | signaturePhotoKey | signedByUserId | signedAt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cmuqj61100076128glu8kkexy | cmuppyuga0935ahswy6dkwz97 | [{"name":"Fresh milk 1 L","issue":null,"order… | true | 2026-10-02 05:36 | signatures/demo.png | cmuqj60pz000c128ge5cvtrg1 | 2026-10-02 05:36 |
| rcpt-cmurbm3ci017z5qefxiuzjga6 | cmurbm3ci017z5qefxiuzjga6 | [{"name":"Fresh milk 1 L","issue":null,"order… | true | 2026-10-04 | receipts/cmurbm3ci017z5qefxiuzjga6/signature.png | cmuqj60pq000a128g56n7kgeu | 2026-10-04 |
| rcpt-cmurdd49n001hhcnoc6n9d4lc | cmurdd49n001hhcnoc6n9d4lc | [{"name":"Samba rice 5 kg","issue":null,"orde… | true | 2026-10-04 | receipts/cmurdd49n001hhcnoc6n9d4lc/signature.png | cmuqj60tv004q128gbxiypnf0 | 2026-10-04 |
| rcpt-cmurdd4l90038hcnojoz6zp0q | cmurdd4l90038hcnojoz6zp0q | [{"name":"Samba rice 5 kg","issue":null,"orde… | true | 2026-10-04 | receipts/cmurdd4l90038hcnojoz6zp0q/signature.png | cmuqj60q8000k128guroox2vq | 2026-10-04 |

### StoreSavedItem (24 rows)

| storeId | itemId | createdAt |
| --- | --- | --- |
| OUT001 | F-BUTTR | 2026-10-04 |
| OUT001 | F-CHEE | 2026-10-04 |
| OUT001 | F-CHKN | 2026-10-04 |
| OUT002 | F-BUTTR | 2026-10-04 |
| OUT002 | F-CHEE | 2026-10-04 |

### TrafficSpeed (576 rows)

| id | districtName | hour | monsoon | speedIndex | raw |
| --- | --- | --- | --- | --- | --- |
| cmuppysr9007cahsw44d1hxr8 | Colombo | 0 | false | 94 | {"hour":"0","monsoon":"0","district":"Colombo… |
| cmuppysr9007dahswoim9hfa3 | Colombo | 1 | false | 94 | {"hour":"1","monsoon":"0","district":"Colombo… |
| cmuppysr9007eahswaifwaser | Colombo | 2 | false | 94 | {"hour":"2","monsoon":"0","district":"Colombo… |
| cmuppysr9007fahsw526lgjhc | Colombo | 3 | false | 92 | {"hour":"3","monsoon":"0","district":"Colombo… |
| cmuppysr9007gahswrf3v0x6b | Colombo | 4 | false | 89 | {"hour":"4","monsoon":"0","district":"Colombo… |

### Trip (17 rows)

| id | vehicleId | depotId | brand | districtId | serviceDate | tripNumber | status | planVersion | plannedMinutes | plannedLitres | publishedAt | assignedDriverId | csvRouteId | tripStartingDate | tripEndingDate | startingTime | estimatedStartingTime | endingTime | fuelLitresAtEnd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyufu092xahswqj3cytia | VEH008 | depo1 | Fresh | Colombo | 2026-10-01 | 1 | published | 1 |  |  | 2026-10-01 15:59 |  |  |  |  |  |  |  |  |
| cmuppyugw093mahswbcrogboy | VEH009 | depo1 | Fresh | Colombo | 2026-10-04 | 1 | on_road | 1 |  |  | 2026-10-01 15:59 | cmuppyuaq092vahswi6i7eszo | RTE-COL-01 | 2026-10-01 |  | 2026-10-04 03:30 |  |  |  |
| cmurbm3c6017s5qef0doy1efh | VEH001 | depo1 | Fresh | Colombo | 2026-10-04 | 1 | on_road | 1 |  |  | 2026-10-02 18:27 |  | DEMO-DISPATCH-BREAKDOWN |  |  | 2026-10-04 03:30 |  |  |  |
| cmurdd45e0006hcnoqbv61d1t | VEH039 | depo2 | Fresh | Kandy | 2026-10-03 | 1 | planning | 1 |  |  |  |  | DEMO-STATUS-Kandy-planning |  |  |  |  |  |  |
| cmurdd46a000fhcno71sowl1j | VEH039 | depo2 | Fresh | Kandy | 2026-10-03 | 2 | published | 1 |  |  | 2026-10-02 19:41 |  | DEMO-STATUS-Kandy-published |  |  |  |  |  |  |

### TripStop (22 rows)

| id | tripId | orderId | sequence | status | etaMin | arrivedAt | storeConfirmedAt | driverAckAt | plannedArrivalTime | leaveOutletTime | serviceMin | unloadingTime | estimatedUnloadingTime | estimatedTripStopTime | tripStopTime | tripStartTime | estimatedTripStartTime | waitAlertedAt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyuga0935ahswy6dkwz97 | cmuppyufu092xahswqj3cytia | cmuppyufz092zahswmpzgp636 | 1 | delivered | 480 | 2026-10-02 05:36 | 2026-10-02 05:36 |  |  |  |  |  |  |  |  |  |  |  |
| cmuppyugk093cahsw5xnjkm20 | cmuppyufu092xahswqj3cytia | cmuppyugg0937ahswhnuucedx | 2 | upcoming | 505 |  |  |  |  |  |  |  |  |  |  |  |  |  |
| cmuppyugr093kahsw20cxgj68 | cmuppyufu092xahswqj3cytia | cmuppyugm093eahswuoybokm8 | 3 | upcoming | 530 |  |  |  |  |  |  |  |  |  |  |  |  |  |
| cmuppyuh3093uahsw2fzcy1bt | cmuppyugw093mahswbcrogboy | cmuppyugz093oahsw05yw3ajt | 1 | arrived | 551 | 2026-10-04 03:42 |  |  |  |  |  |  |  |  |  |  |  |  |
| cmurbm3ci017z5qefxiuzjga6 | cmurbm3c6017s5qef0doy1efh | cmurbm3cb017u5qefenh1wrbk | 1 | confirmed | 14 | 2026-10-02 18:44 | 2026-10-02 18:48 | 2026-10-04 03:42 |  |  |  |  |  |  |  |  |  |  |

### User (394 rows)

| id | loginId | role | name | depotId | storeId | passwordHash | pinHash | notificationPrefs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cmuppyuae092pahswvmx7xq1j | nimal | dispatcher | Nimal (Dispatcher) | depo1 |  | (password or PIN hash) |  | {"delayAlerts":true,"planChanges":false,"inci… |
| cmuppyuak092rahsw8zmn6kd9 | sunil | store | Sunil (Store manager) |  | OUT001 | (password or PIN hash) |  | {"delayAlerts":false,"planChanges":true,"inci… |
| cmuppyuam092tahswqfk3w0xp | sampath | loader | Sampath (Loader) | depo1 |  |  |  | {"delayAlerts":true,"planChanges":true,"incid… |
| cmuppyuaq092vahswi6i7eszo | kasun | driver | Kasun (Driver) | depo1 |  |  | (password or PIN hash) | {"delayAlerts":true,"planChanges":true,"incid… |
| cmuqj60pq000a128g56n7kgeu | OUT001 | store | OUT001 manager |  | OUT001 | (password or PIN hash) |  | {"delayAlerts":true,"planChanges":true,"incid… |

### Vehicle (60 rows)

| id | numberPlate | depotId | type | temp | weightCapKg | volumeCapM3 | fuelType | kmPerL | weeklyFuelQuotaL | status | outOfServiceReason | returnDate | driverId | lastServiceAt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VEH001 | WP LQ-1001 | depo1 | truck | reefer | 5510 | 26.4 | diesel | 4.7 | 340 | available |  |  | cmuqqesxm006y64hima50g8fv | 2026-09-01 |
| VEH002 | WP LQ-1002 | depo1 | truck | reefer | 3990 | 21.1 | diesel | 6.1 | 610 | available |  |  | cmuqqesz0007264hi54ivxgs7 | 2026-08-31 |
| VEH003 | WP LQ-1003 | depo1 | truck | reefer | 5510 | 26.4 | diesel | 4.7 | 480 | available |  |  | cmuqqeszg007664hivydmijhp | 2026-08-30 |
| VEH004 | WP LQ-1004 | depo1 | truck | reefer | 6840 | 33.4 | diesel | 4.4 | 430 | available |  |  | cmuqqet00007a64hi818iid1m | 2026-08-29 |
| VEH005 | WP LQ-1005 | depo1 | truck | reefer | 6840 | 33.4 | diesel | 4.4 | 490 | available |  |  | cmuqqet0f007e64hizsweeisw | 2026-08-28 |

### _TripExtraDistricts (0 rows)

No rows.
