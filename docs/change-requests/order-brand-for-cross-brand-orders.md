# Change request: plan a store's order by the goods in it, not by the store's brand

**For:** whoever owns planning (`apps/api/src/plan`, `packages/domain`).
**From:** the store manager part.
**Status:** not done. Nothing in planning has been changed.

## Why this is needed

A store manager can now order from every brand's catalogue, not only the store's own brand. One order still holds one kind of goods:

| Order group | Item types in it        |
| ----------- | ----------------------- |
| Fresh       | `chilled_food`, `fresh` |
| Style       | `style`                 |
| Tech        | `tech`                  |

The mapping is `ORDER_GROUP` in `packages/contracts/src/store.ts`. The store API refuses an order that mixes groups (`buildOrderLines` in `apps/api/src/store/catalogue.ts`), so every order belongs to exactly one group.

The problem: the order's brand is still the **store's** brand. `StoreService.placeOrder` in `apps/api/src/store/store.service.ts` writes `brand: store.brand`. So when a Fresh store orders Tech goods:

- the order is saved as a Fresh order,
- it is offered to Fresh trips and planned on the 03:30 Fresh run,
- the dispatcher and the loader see "Fresh" on an order of smartphones.

Nothing crashes, but the label and the run are wrong.

## Why the store part cannot fix it alone

The obvious fix is to save the order with the brand of its goods (`brand: 'Tech'`). That one line is in the store part and is easy. It is not done, because planning reads the brand from two places that would then disagree:

**From the order (`Order.brand`):**

- `apps/api/src/plan/plan-edit.service.ts`: an empty trip only takes an order of the trip's brand (`trip.brand !== order.brand`).
- `apps/api/src/plan/plan-trips.service.ts`: `suggestions()` filters waiting orders by `brand: trip.brand`.
- `apps/api/src/plan/plan-auto.service.ts`: a new trip is created with `brand: row.brand`.
- `apps/api/src/plan/plan-edit.service.ts`: the service allowance is looked up by `order.brand` and the store's dock type.

**From the store (`Store.brand`, as `outlet.brand` in the domain):**

- `apps/api/src/plan/plan.mapper.ts`: `toOutlet()` sets `brand: store.brand`.
- `packages/domain/src/rules/brand-district.ts`: a stop is blocked (`BRAND_MISMATCH`) when its `outlet.brand` differs from the first stop's.
- `packages/domain/src/fit.ts`: a trip fits only when `outlet.brand` matches its first stop's.
- `packages/domain/src/rules/time-budget.ts`, `time.ts`, `rules/index.ts`: the time budget and the service allowance are read by `outlet.brand`.

So a Tech order from a Fresh store, saved as `brand: 'Tech'`, would be offered to Tech trips by the first list and then blocked from them by the second, because its outlet is still Fresh. It could only ride alone or with other Fresh stores. The order would get stuck.

## The change being asked for

Make planning use the brand of the **order** everywhere it now uses the brand of the **store**.

The smallest way that looks workable: in `toOutlet()` (`plan.mapper.ts`), take the brand from the order instead of the store, so the outlet view of a stop carries the order's brand. The domain rules then need no change, because they only ever see `outlet.brand`. Every caller of `toOutlet()` would need the order to hand.

A cleaner way: add `brand` to the domain `Order` type (`packages/domain/src/types.ts`) and have the brand rule, `fit.ts`, the time budget and the allowance lookup read `order.brand`.

Either way, once planning is ready, the store part makes its one-line change: `placeOrder` saves `brand` as the order's group (`ORDER_GROUP[type]` of its items) instead of `store.brand`. Tell the store manager team when it can go in; the two changes should land together.

## Questions the planning owner has to settle

These are planning decisions, so they are listed, not answered.

1. **Delivery window.** A Fresh store's window is early (for example 05:00 to 08:00). Style and Tech runs leave the depot at 08:00 (`DEPART_MIN` in `plan.service.ts`). A Tech order to a Fresh store would miss the store's window on a Tech run. Should the window rule apply, be relaxed, or should such an order be refused or flagged?
2. **Service allowance.** Allowances are rows of brand and dock type (`ServiceAllowance`). Is there a row for every brand at every dock type a store of another brand can have? A missing row raises the missing-allowance issue.
3. **District.** Trips are per district as well as per brand. A Tech trip may not run to the district of a Fresh store on that day.
4. **Is this allowed at all?** If the competition rules tie a store to one brand, the right answer may be to turn the cross-brand catalogue off again. That is a one-line change back in the store part (`fullCatalogue` to the store's own list).

## Not a database change

`Order.brand` already exists and already allows `Fresh`, `Style` and `Tech`. No table or column changes are needed for this.

## How to see the problem

1. Sign in as a store manager of a Fresh store (`sunil` / `waypoint`).
2. On Order, pick the Tech chip, add an item, and place the order.
3. Look at the saved order (`pnpm db:studio`, table `Order`): `brand` is `Fresh`, and its lines are Tech items. The dispatcher's plan board treats it as a Fresh order.
