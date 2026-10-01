# Methuli: execution plan (frontend lead)

Owns **P2** (tokens + four shells + shared components) and **B1-B6** (plan board). Flexible-pool backup: live map **M4**, then planning map **M1-M3**.
Plan date: Thu 1 Oct 2026. Deadlines: feature freeze Sun 14:00, main frozen Sun 18:00.

Everyone else builds on your shells and components, so P2 comes first and gets merged to `develop` before anything else.

## Status check (what the repo already has)

Scaffolding exists in `apps/web`: the four layouts (`dispatch`, `dock`, `drive`, `store`), `RoleGate`, `NavLink`, `PlaceholderPage`, `Button`, `CapacityBar`, `StatusChip`, `Toast`, `EmptyState`, a `TripDrawer` stub and `mocks/trip.json`. `tailwind.config.ts` still holds **placeholder colours** - the Figma values are not in yet. Dispatch pages `plan`, `board`, `fleet`, `map` and `incidents` are placeholders.

## Phase 0 - Tokens (first, ~1-2 h)

1. Pull Figma Foundations tokens (see "Getting the Figma tokens" below).
2. Replace colour, type, spacing and radius in `tailwind.config.ts`; keep the token names so existing components don't break.
3. Add any missing tokens (elevation, breakpoints for the 390 px phone and tablet).
4. Open a PR and merge to `develop` straight away - this unblocks Sehara, Hiruka and Nithika.
5. Log any value that differs from Figma in the README departures log in the same PR.

## Phase 1 - Shells and shared components (P2, today)

- **Console** (desktop), **Dock** (tablet + 390 px phone), **Driver** (phone), **Store** (phone + desktop): match the Figma frames for nav, header and depot badge.
- Components, token-only (no raw hex): Button, StatusChip (all statuses incl. at-risk, not synced), CapacityBar (weight and volume, red overload), Toast (with undo action), EmptyState. Add a Modal/Sheet primitive for the publish modal and deferral flow.
- Verify each shell at 390 px and desktop. Tell the team in chat when merged.

## Phase 2 - Plan board core (B1-B3, Thu)

Data comes from the API through `lib/api.ts`; rules come from `packages/domain` (Sithil) - never reimplement a rule in the UI. Build against `mocks/` until Yohan's orders/trips routes land.

- **B1 Waiting list:** orders with Type (Fresh/Style/Tech) and District filters, chilled and van-only markers.
- **B2 Drag onto a trip:** call the domain fit/rule check on hover/drop. Hard blocks (chilled, van-only, brand/district, depot, time budget, two-trip limit) refuse the drop and show the reason code as text.
- **B3 Capacity preview and overload:** CapacityBar updates on hover; over-volume trips go red and the flag clears when a stop is moved to a legal truck; undo via toast.

## Phase 3 - Summary, deferral, publish (B4-B6, Fri)

- **B4 Overbooked-day summary:** demand vs available fleet, naming the limiting resource (Sithil's capacity summary).
- **Deferral flow:** reason + new date, repeat-skip flag shown; order detail and "move to later".
- **B5 Publish modal:** capacity problems **block** with the fix named; fuel and window warnings **allow**. Wire to the publish route.
- **B6 Auto-assign UI:** only if Sithil's proposal is ready.

## Phase 4 - Pool backup and polish (Sat)

- Live map M4 (MapLibre + GeoJSON, reuses Sehara's TripDrawer) if Sehara hasn't shipped it; then planning map M1-M3.
- Fidelity pass against Figma with Chamodhi; fix spine bugs only.
- Fresh-seed run of spine steps 1-4 on the public URL.

## Timeline

| When | Done tonight |
|---|---|
| Thu 1 Oct | Tokens merged, shells and shared components, B1-B3 working on mock data (then real data) |
| Fri 2 Oct | B4, deferral flow, move-to-later, undo, B5 publish modal |
| Sat 3 Oct | B6 if ready, then M4/M1-M3; spine rehearsal; fidelity fixes |
| Sun 4 Oct | Until 14:00: spine bugs only |

## Dependencies

- Sithil: reason codes, fit ranking, capacity summary, publish checks.
- Yohan: orders and trips API routes, publish route.
- Sanaya: spine fixtures (the over-volume trip, waiting chilled order, repeat-skip store).
- Sehara: TripDrawer (shared; don't fork it).

## Never drop

Overbooked summary and deferral, publish, chilled and van-only blocks, overload clear. Droppable first: planning map, then auto-assign.

## Getting the Figma tokens

1. Open the Day 5 Figma file (Chamodhi/team to share the link; Make sure you have at least view access).
2. Foundations page: select the colour/type/spacing styles or the Variables panel (Local variables).
3. Inspect: Dev Mode (toggle top-right) shows hex, font family/size/line-height, spacing and radius per element.
4. Export options:
   - Copy values by hand into `tailwind.config.ts` (small token set, fine for this timeline).
   - Or use a plugin such as **Tokens Studio** or **Variables Export** to export JSON, then map it into Tailwind.
   - Or let Claude read them via the Figma MCP (`get_variable_defs`) given the frame/file URL.
