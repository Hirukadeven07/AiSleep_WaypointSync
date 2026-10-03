# Change request: a store manager can now cancel a waiting order

**For:** the dispatcher / planning owner (`apps/web/components/plan`, `apps/api/src/plan`). One optional item is for the database owner.
**From:** the store manager part.
**Status:** the store side is built. Nothing in dispatch, planning, dock, driver or the database has been changed. The items below are for their owners to decide and do.

## What the store side now does

A store manager can cancel an order they placed, from the "Already ordered" cards on the Order screen.

- Route: `DELETE /api/store/orders/:id` (`StoreService.cancelOrder` in `apps/api/src/store/store.service.ts`).
- The order and its lines are **deleted**. There is no "cancelled" status and no record is kept.
- Each dispatcher at the store's depot gets a notice: **"Order cancelled"**, with the store, the number of items, the weight and the delivery day. It links to `/dispatch/plan`.

The cancel is allowed only when all of these are true:

| Check                                                                           | Why                                                                                                                          |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| The order belongs to the signed-in store                                        | A store cannot touch another store's order (answered as "not found")                                                         |
| `status` is `waiting`                                                           | `planned`, `deferred`, `delivered` and `partial` are refused                                                                 |
| The order has no trip stop                                                      | Nothing on a trip is removed by the store                                                                                    |
| The order has no delivery notes, no field flags, and no load flags on its lines | An order that went back to waiting after being on a truck keeps its dock and delivery records; the store cannot delete those |

Anything else is refused with HTTP 409 and "This order is already being planned or delivered. Ask dispatch to change it."

The check and the delete are one database statement, so an order the dispatcher puts on a trip at the same moment is not deleted.

## 1. Plan board: a cancelled order can stay on screen (dispatcher)

**What happens today.** The plan board loads the day once when it opens and again after each of the dispatcher's own changes (`usePlan.ts`, `usePlanEdit.ts`). It does not refresh on a timer. So if a store cancels an order while the board is open, the order stays in the waiting queue on the dispatcher's screen until the board reloads.

**What the dispatcher then sees.** Dragging that order onto a trip, opening its drawer, or moving it to later calls the API with an order id that no longer exists. `PlanEditService.loadOrder` answers 404 "Order not found".

**Asked for.**

- When a plan action fails with "Order not found", reload the board and tell the dispatcher the store cancelled the order, rather than showing a plain error.
- Consider refreshing the board on a timer, or when an "Order cancelled" notice arrives, so the queue is not stale for long.

## 2. Auto-assign: the preview can be out of date (planning)

`PlanAutoService.apply` reads the waiting orders again when it saves, so a cancelled order is simply not placed. That part is safe.

The preview the dispatcher approved was built earlier, though. If an order is cancelled between the preview and "Apply", the result has one order fewer than the preview showed (trips, orders placed, capacity used).

**Asked for.** Check that this is acceptable, or re-show the preview when what would be saved differs from what was shown.

## 3. Cancelling a planned order (dispatcher) — not built

Once an order is on a trip, the store cannot cancel it and is told to ask dispatch. The dispatcher has no cancel either. Today the dispatcher can only:

- take the order off the trip (it goes back to waiting; the store could then cancel it, unless it has dock paperwork),
- move it to a later day,
- remove a trip that is still being planned.

**Asked for, if wanted.** A dispatcher action that cancels an order outright, including one that is planned. It has to deal with the trip stop, the stop sequence and ETAs, the loader's plan-change lock if the trip was already sent to the dock, and the notice to the store.

## 4. Keeping a record of cancelled orders (database owner) — optional

Deleting leaves no trace: nobody can later see that an order existed or who cancelled it.

**Asked for, if a record is wanted.** This is a database change, so it is not done here:

- add `cancelled` to the `OrderStatus` enum in `apps/api/prisma/schema.prisma`, with a migration,
- optionally add `cancelledAt DateTime?` and `cancelledById String?` to `Order`.

Then two follow-ups, each in its owner's part:

- **Store part** (ours, a small change once the status exists): `cancelOrder` sets `status: 'cancelled'` instead of deleting.
- **Planning and dispatch:** every query that lists orders must leave cancelled ones out. Most already filter by status (`waiting`, `planned`), but each list, count and total should be checked.

## Nothing needed from the loader or driver parts

An order that can be cancelled has never been on a trip, so it has never reached the dock or a driver.

## How to try it

1. Sign in as a store manager (`sunil` / `waypoint`) and place an order on the Order screen.
2. On the "Already ordered" card, press "Cancel order", then "Yes, cancel".
3. Sign in as the dispatcher (`nimal` / `waypoint`): the bell shows "Order cancelled". If the plan board was already open, the order is still listed until the board reloads (item 1).
