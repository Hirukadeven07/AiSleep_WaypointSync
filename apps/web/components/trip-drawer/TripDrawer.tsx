'use client';

import type { TripDrawerPayload } from '@waypoint/contracts';
import { formatMinutes } from '@/lib/clock';
import { CapacityBar } from '@/components/ui/CapacityBar';
import { StatusChip } from '@/components/ui/StatusChip';

/** Renders a trip's summary, capacity, and stops from a TripDrawerPayload. */
export function TripDrawer({ payload }: { payload: TripDrawerPayload }) {
  const { trip, vehicle, loadPercent, driverName, lines } = payload;

  return (
    <aside className="w-full max-w-md rounded-card border border-border bg-surface p-md">
      <header className="mb-md flex items-start justify-between gap-sm">
        <div>
          <h2 className="text-title font-semibold">
            {trip.brand} · {trip.districtId} · Trip {trip.tripNumber}
          </h2>
          <p className="text-label text-muted">
            {vehicle.plate ?? vehicle.id} ({vehicle.type}, {vehicle.temp}) · {driverName ?? 'No driver'}
          </p>
        </div>
        <StatusChip status={trip.status} />
      </header>

      <div className="mb-md space-y-sm">
        <CapacityBar label={`Weight (cap ${vehicle.weightCapKg} kg)`} percent={loadPercent.weight} />
        <CapacityBar label={`Volume (cap ${vehicle.volumeCapM3} m³)`} percent={loadPercent.volume} />
      </div>

      <p className="mb-sm text-label text-muted">
        Planned {trip.plannedMinutes ?? '-'} min · {trip.plannedLitres ?? '-'} L · plan v{trip.planVersion}
      </p>

      <ol className="space-y-sm">
        {trip.stops.map((stop) => (
          <li key={stop.id} className="rounded-card border border-border p-sm">
            <div className="flex items-center justify-between gap-sm">
              <span className="font-semibold">
                {stop.sequence}. {stop.storeName}
              </span>
              <StatusChip status={stop.status} />
            </div>
            <p className="text-caption text-muted">
              ETA {stop.etaMin !== null ? formatMinutes(stop.etaMin) : '-'} · window{' '}
              {formatMinutes(stop.windowOpenMin)}–{formatMinutes(stop.windowCloseMin)} · {stop.units} units
            </p>
            <ul className="mt-xs text-caption">
              {(lines[stop.id] ?? []).map((line) => (
                <li key={line.id} className={line.chilled ? 'text-chilled' : 'text-muted'}>
                  {line.qty} × {line.name} ({line.pack})
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </aside>
  );
}
