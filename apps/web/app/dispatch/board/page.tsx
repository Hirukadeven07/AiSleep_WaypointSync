'use client';

import type { TripDrawerPayload } from '@waypoint/contracts';
import { TripDrawer } from '@/components/trip-drawer/TripDrawer';
import mockTrip from '@/mocks/trip.json';

export default function Page() {
  return (
    <section className="space-y-md">
      <h1 className="text-heading font-semibold">Dispatch board</h1>
      <p className="text-label text-muted">Trip drawer rendering mock data.</p>
      <TripDrawer payload={mockTrip as TripDrawerPayload} />
    </section>
  );
}
