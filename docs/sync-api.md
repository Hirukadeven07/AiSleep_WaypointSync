# Driver sync API handoff

This is the short driver-sync contract for the frontend owner.

## Endpoints

### POST /api/sync
Request body:

```json
{
  "events": [
    {
      "clientId": "9c0d7c1a-9cbf-44d6-a103-3be3f8f74dcb",
      "driverId": "cmabc123",
      "tripId": "trip_123",
      "type": "ARRIVED",
      "payload": { "stopId": "stop_456" },
      "createdOnPhoneAt": "2026-10-01T09:12:00+05:30",
      "seenPlanVersion": 1
    }
  ]
}
```

Response:

```json
{
  "applied": ["9c0d7c1a-9cbf-44d6-a103-3be3f8f74dcb"],
  "duplicate": [],
  "rejected": [],
  "stale": [],
  "rejectedReasons": {}
}
```

### GET /api/sync
Response:

```json
{
  "tripId": "trip_123",
  "planVersion": 1,
  "stops": [
    {
      "id": "stop_456",
      "sequence": 1,
      "status": "waiting",
      "arrivedAt": "2026-10-01T09:10:00.000Z",
      "storeConfirmedAt": null,
      "driverAckAt": null
    }
  ],
  "activeSos": false
}
```

### GET /api/driver/day
Read-only. Returns the logged-in driver's vehicle and today's trips with full stop details. Driver role only (401 without a session, 403 for other roles).

Response:

```json
{
  "serviceDate": "2026-10-01",
  "vehicle": { "id": "VEH-07", "plate": "WP LB-1234", "type": "truck" },
  "trips": [
    {
      "id": "trip_123",
      "tripNumber": 1,
      "status": "published",
      "planVersion": 3,
      "stops": [
        {
          "id": "stop_456",
          "sequence": 1,
          "orderId": "order_789",
          "storeId": "FRESH-COL07",
          "outletName": "Fresh Colombo 07",
          "address": "Colombo 07",
          "status": "arrived",
          "windowStart": 300,
          "windowEnd": 480,
          "eta": 330,
          "phone": "0772222222",
          "phones": [
            { "label": "manager", "phoneNo": "0771111111" },
            { "label": "shop", "phoneNo": "0772222222" }
          ],
          "lat": 6.9271,
          "lng": 79.8612,
          "navigateUrl": "https://www.google.com/maps/dir/?api=1&destination=6.9271,79.8612&travelmode=driving",
          "urgentNote": "Call before arriving",
          "arrivedAt": "2026-10-01T03:40:00.000Z",
          "storeConfirmedAt": null,
          "driverAckAt": null,
          "flags": [
            { "id": "flag_1", "type": "damaged", "qty": 1, "note": "Crate cracked", "itemName": "Milk" }
          ]
        }
      ]
    }
  ],
  "activeTripId": "trip_123"
}
```

- The vehicle is the one with `Vehicle.driverId` = the session user, the same rule as sync. With no vehicle the response is `{ "serviceDate": "...", "vehicle": null, "trips": [], "activeTripId": null }`.
- Only today's trips with status `published`, `loading`, `ready` or `on_road` are included (the statuses `GET /api/sync` treats as active). `planning`, `completed` and `breakdown` trips are left out, so a finished trip can never be picked as active. Trips are sorted by `tripNumber`, stops by `sequence`.
- `activeTripId` uses the same rule as `GET /api/sync`: the `on_road` trip if any, otherwise the lowest `tripNumber`. It always equals `GET /api/sync`'s `tripId`.
- `windowStart`, `windowEnd` and `eta` are minutes since midnight (Asia/Colombo).
- `address` is the store's district name; stores have no street address yet.
- `phone` is the `shop` outlet phone, else the store's own phone, else the first outlet phone, else `null`. `phones` lists every outlet phone.
- `navigateUrl` is `null` when the store has no coordinates. `plate` falls back to the vehicle id.
- All statuses are lowercase, e.g. `on_road`, `published`.

## Event types and payloads

- `SOS_ALERT`: `{ "location": { "lat": 6.9271, "lng": 79.8612 } | null, "severity"?: "low" | "high" | "critical", "message"?: string }`.
  Opens a `DriverIncident` (`incidentType: "sos"`, severity defaults to `high`) and notifies the dispatchers of the vehicle's depot.
  A missing or foreign `tripId` falls back to the driver's active trip, then to none; an SOS is never rejected for its trip.
- `ARRIVED`: `{ "stopId": "stop_456" }`
- `ACKNOWLEDGEMENT`: `{ "stopId": "stop_456" }`
- `ROAD_ISSUE`: any JSON object, for example `{ "note": "wheel noise" }`
- `FUEL_READING`: `{ "remainingLitres": 42.5 }`

## Rejection reasons

The sync API may reject an item with these reason codes:

- `INVALID_EVENT`: the event is malformed (bad UUID, unknown type, missing fields). If it has no usable `clientId`, it is reported as `invalid:<index in the batch>`.
- `DRIVER_MISMATCH`
- `FORBIDDEN_STOP`
- `FORBIDDEN_TRIP`
- `ACK_BEFORE_RECEIPT`
- `NO_ACTIVE_TRIP`
- `NO_VEHICLE`
- `INVALID_PAYLOAD`

Only `ACK_BEFORE_RECEIPT` is retryable. All other rejected events should be treated as user-visible failures.

Each event is validated and applied on its own: one bad event never turns the batch into a 400, so it cannot block the rest of the outbox. Only a body that is not `{ "events": [...] }` (or has more than 100 events) gets a 400.

## Timestamps

- `arrivedAt`, `driverAckAt` and the SOS incident's `raisedAt` use `createdOnPhoneAt` (when it happened on the phone), clamped to the server's current time. `appliedAt` is the sync time.
- A repeat `ARRIVED` keeps the first `arrivedAt`. `driverAckAt` is never earlier than `storeConfirmedAt`.

## Active SOS

`activeSos` is true while the driver has an SOS `DriverIncident` with no `resolvedAt`. It clears when dispatch resolves the incident.

## Frontend rules

- Send a fresh UUID `clientId` per action.
- Send events in oldest-first order.
- Treat both `applied` and `duplicate` as synced.
- If `stale` contains a clientId, refresh the trip plan and ask the driver to accept it.
- The plan has no fuel-entry screen; the frontend owner must add it.
- `driverId` must equal the logged-in user; otherwise the event is rejected with `DRIVER_MISMATCH`. Writes always use the session user.
- Event types come from `DRIVER_EVENT_TYPES` in `@waypoint/contracts`; the web outbox uses the same type.
- Load the day from `GET /api/driver/day`, then keep stop status current with `GET /api/sync`.
- Compare trip and stop statuses against lowercase values (`on_road`, not `ON_ROAD`).
