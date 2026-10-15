# Screen map

Where each Designathon screen lives in the web app. Differences from the Figma are listed in the README under "Departures from the Designathon design".

| Feature | Route | Owner |
| --- | --- | --- |
| L1 Dock sign-in (keypad, depot) | `/login/loader` | Hiruka |
| L2 Load queue | `/dock` | Hiruka |
| L3 LIFO checklist | `/dock/[tripId]` | Hiruka |
| L4 Flag a line (missing, damaged, wrong quantity) | `/dock/[tripId]` (sheet) | Hiruka |
| L5 Departure summary | `/dock/[tripId]` (after departure) | Hiruka |
| Plan-change lock | `/dock/[tripId]` (banner) | Hiruka |
| S1 Store home (window, cutoff countdown, deferral) | `/store` | Hiruka |
| S2 Place order (closed after 16:00) | `/store/order` | Hiruka |
| S3 Deferral notice and updates | `/store/updates` | Hiruka |
| S4 Check the goods (receipt with issues) | `/store/receive` | Hiruka |
| S5 Delivery handoff states | `/store/delivery` | Hiruka |
| Dispatcher home | `/dispatch` | Sehara |
| Plan board (queue, trips, auto-assign, move to later, publish) | `/dispatch/plan` | Methuli |
| Plan board map view | `/dispatch/plan` (Map) | Methuli |
| Live board and trip drawer | `/dispatch/board` | Sehara |
| Live map | `/dispatch/map` | Sehara |
| Fleet | `/dispatch/fleet` | Sehara |
| Incidents | `/dispatch/incidents` | Sehara |
| Driver sign-in | `/drive/login` | Nithika |
| Driver home (today's trip) | `/drive` | Nithika |
| Next stop (arrive, wait for store, acknowledge) | `/drive/next` | Nithika |
| Trip overview (all stops) | `/drive/stops` | Nithika |
| Report a road issue | `/drive/report` | Nithika |
| SOS | `/drive/sos` | Nithika |
| Break | `/drive/break` | Nithika |
| Notices | `/drive/notices` | Nithika |
| Vehicle and profile | `/drive/vehicle` | Nithika |
