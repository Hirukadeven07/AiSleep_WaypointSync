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

- `SOS_ALERT`: `{ "location": { "lat": 6.9271, "lng": 79.8612 } }` or `{ "location": null }`
- `ARRIVED`: `{ "stopId": "stop_456" }`
- `ACKNOWLEDGEMENT`: `{ "stopId": "stop_456" }`
- `ROAD_ISSUE`: any JSON object, for example `{ "note": "wheel noise" }`
- `FUEL_READING`: `{ "remainingLitres": 42.5 }`

## Rejection reasons

The sync API may reject an item with these reason codes:

- `DRIVER_MISMATCH`
- `FORBIDDEN_STOP`
- `FORBIDDEN_TRIP`
- `ACK_BEFORE_RECEIPT`
- `NO_ACTIVE_TRIP`
- `NO_VEHICLE`
- `INVALID_PAYLOAD`

Only `ACK_BEFORE_RECEIPT` is retryable. All other rejected events should be treated as user-visible failures.

## Frontend rules

- Send a fresh UUID `clientId` per action.
- Send events in oldest-first order.
- Treat both `applied` and `duplicate` as synced.
- If `stale` contains a clientId, refresh the trip plan and ask the driver to accept it.
- The plan has no fuel-entry screen; the frontend owner must add it.
- `driverId` is never trusted from the phone; the server always uses the logged-in session user.

## Old outbox

The old driver frontend artifacts are preserved under the tag `driver-frontend-day1` for reuse of the outbox and service worker implementation.
