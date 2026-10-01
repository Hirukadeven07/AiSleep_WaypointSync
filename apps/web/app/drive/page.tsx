'use client';
import { useDriver } from '@/components/drive/DriverShell';
import { usePendingCount } from '@/lib/use-pending-count';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' });

export default function DriverHome() {
  const { me, day, stale, cachedAt } = useDriver();
  const pending = usePendingCount();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Hi, {me?.name ?? 'driver'}</h1>

      {stale && cachedAt && (
        <p className="rounded-xl bg-amber-100 px-4 py-3 text-base text-amber-900">
          Showing details saved at {time(cachedAt)}. They update when you have signal.
        </p>
      )}

      <section className="rounded-2xl bg-white p-4">
        <h2 className="text-base font-semibold text-neutral-600">Vehicle</h2>
        {day?.vehicle ? (
          <p className="mt-1 text-xl font-bold">
            {day.vehicle.plate} <span className="text-base font-medium text-neutral-600">{day.vehicle.type}</span>
          </p>
        ) : (
          <p className="mt-1 text-base text-neutral-700">No vehicle assigned to you yet.</p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4">
        <h2 className="text-base font-semibold text-neutral-600">Today's trips</h2>
        {day && day.trips.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {day.trips.map((t) => (
              <li key={String(t.id)} className="flex items-center justify-between rounded-xl bg-neutral-100 px-4 py-3">
                <span className="text-lg font-semibold">Trip {t.tripNumber}</span>
                <span className="text-base text-neutral-700">
                  {t.stops.length} {t.stops.length === 1 ? 'stop' : 'stops'}, {t.status.toLowerCase().replace(/_/g, ' ')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-base text-neutral-700">
            No trips yet. They appear here once dispatch publishes them.
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4">
        <h2 className="text-base font-semibold text-neutral-600">Sync</h2>
        <p className="mt-1 text-lg font-semibold">
          {pending === 0 ? 'Everything is synced' : `${pending} ${pending === 1 ? 'action' : 'actions'} waiting to sync`}
        </p>
      </section>
    </div>
  );
}
