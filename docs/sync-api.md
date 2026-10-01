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
