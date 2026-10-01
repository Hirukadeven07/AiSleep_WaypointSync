# Data model

TODO

## Dock and store writes to the team ERD tables

The loader dock keeps its live state in `LoadSession` and `LoadFlag`, because the plan-change lock diffs against them. It records the ERD rows at two points:

- **Start loading** (`POST /loads/:tripId/start`): `LoadingJob` moves from `assigned` to `picking`. Each order gets a `DeliveryNote` (`DN-<orderId>`) version with `status: picking`, its lines (one per order line with an `itemId`), and a `DeliveryNoteLoader` row for the loader.
- **Confirm departure** (`POST /loads/:tripId/depart`): the current note version is closed (`validTo`), and a `loaded` version is added. On it, `qtyConfirmed` is the ordered quantity minus missing and wrong-quantity flags. Each dock flag becomes a `LoaderFlag` (`pending_dispatcher`), and `LoadingJob` becomes `handed_over` with the loaded weight and volume.

The store writes:

- **Place order**: every `OrderLine` carries the catalogue `itemId`.
- **Confirm receipt** (`POST /store/deliveries/:stopId/receipt`): each line with an issue becomes a `FieldFlag` (`driverDecision: pending`) on that trip. The store's delivery views list these with the driver's decision. Driver acknowledgement is expected to set `driverDecision` and `driverDecidedAt`.
