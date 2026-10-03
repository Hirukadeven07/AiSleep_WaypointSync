# Store manager checklist

What the store manager can do in Sync Store (`/store`). Checked items are already in the app.

## Done

- [x] **Sign in as the store.** The manager signs in with a store id and password (`sunil` / `waypoint`, or an outlet id such as `OUT001`). The phone can remember the id. Anyone who is not a store manager is kept out of these screens.
- [x] **Home shows the day.** The store name, brand, and delivery window are on the home screen. A countdown runs until 16:00. After that it says ordering is closed, because tonight’s plan cannot wait for late orders. If a driver has arrived, a button takes them straight to checking the goods. Today’s truck, plate, and handoff progress are shown. If dispatch moved an order, that card is on the home screen and opens Updates. Store phone numbers are tappable.
- [x] **Place tomorrow’s order.** The catalogue matches the store’s brand. Plus and minus set quantities, and the screen totals lines, weight, and volume before the order is sent. After 16:00 the list is locked and the server refuses the order as well, so a late tap cannot sneak through. The order is for the next day the depot is open, skipping a closed day. Dispatch is told a new order arrived.
- [x] **See what dispatch changed.** Moved orders show the reason and whether this store was also skipped last time. Other messages from dispatch appear here. Tapping a new one marks it read, so unread ones stay highlighted.
- [x] **Check the goods when the driver arrives.** This opens only after the driver marks arrival. Each line can be counted down and marked missing, damaged, or wrong quantity. Chilled deliveries must be answered cold or warm before confirm. A signature is required and stored with the receipt. Confirming once closes the stop. Problem lines become flags the driver must accept or dispute, and dispatch is told. A second confirm is refused.
- [x] **Watch the delivery.** Today’s stops show where they are: on the way, arrived, checked, or acknowledged by the driver. The page refreshes every few seconds. When the driver is at the store, the same “check the goods” path is there.

## Still to do

- [ ] **Show a count of unread messages.** The home data already includes how many notices are unread, but nothing on the screen uses it. The Updates tab should show that number so the manager knows there is something new without opening the tab.
- [ ] **Make a notice open the right place.** Each message can carry a link (home, the delivery, and so on), but a tap only marks it read. It should also go to that screen.
- [ ] **Wire “Forgot password?”** The words are on the sign-in screen and do nothing. Either hook them up or remove them so a judge does not tap a dead control.
