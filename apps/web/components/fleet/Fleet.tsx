'use client';

import { useEffect, useState } from 'react';
import type { FleetDay, FleetStatus, FleetVehicle } from '@waypoint/contracts';
import { dayLabel } from '@/components/plan/format';
import { PlanToast } from '@/components/plan/PlanToast';
import type { ToastState } from '@/components/plan/usePlanEdit';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/poll';
import { depotName } from '@/lib/depots';
import { AddVehicleModal } from './AddVehicleModal';
import { OutOfServiceModal } from './OutOfServiceModal';
import { VehicleDrawer } from './VehicleDrawer';

type Filter = 'all' | 'road' | 'depot' | 'out';

export const STATUS: Record<FleetStatus, { label: string; chip: string }> = {
  on_road: { label: 'On the road', chip: 'bg-blue/[0.12] text-blue' },
  breakdown: { label: 'Broken down', chip: 'bg-danger/[0.12] text-danger' },
  at_depot: { label: 'At depot', chip: 'bg-success/[0.12] text-success' },
  out_of_service: { label: 'Out of service', chip: 'bg-muted/[0.12] text-muted' },
};

export const kindOf = (v: Pick<FleetVehicle, 'type' | 'temp'>) =>
  v.type === 'van' ? 'Van' : v.temp === 'reefer' ? 'Refrigerated truck' : 'Ambient truck';
export const capacityOf = (v: Pick<FleetVehicle, 'weightCapKg' | 'volumeCapM3'>) =>
  `${v.weightCapKg.toLocaleString('en-US')} kg · ${v.volumeCapM3} m³`;

const FILTERS: {
  id: Filter;
  label: string;
  count: (d: FleetDay) => number;
  test: (v: FleetVehicle) => boolean;
}[] = [
  { id: 'all', label: 'All', count: (d) => d.counts.all, test: () => true },
  {
    id: 'road',
    label: 'On the road',
    count: (d) => d.counts.onRoad,
    test: (v) => v.status === 'on_road' || v.status === 'breakdown',
  },
  {
    id: 'depot',
    label: 'At depot',
    count: (d) => d.counts.atDepot,
    test: (v) => v.status === 'at_depot',
  },
  {
    id: 'out',
    label: 'Out of service',
    count: (d) => d.counts.outOfService,
    test: (v) => v.status === 'out_of_service',
  },
];

/** Figma "Fleet / Vehicle detail": every vehicle, what it is doing today, and its detail drawer. */
export function Fleet() {
  const { data: day, error, refresh } = usePoll(() => api<FleetDay>('/fleet'), 5_000);
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!day) {
    return (
      <p className="px-3 pt-5 text-body text-muted" role="status">
        {error ? 'The fleet could not be loaded.' : 'Loading the fleet…'}
      </p>
    );
  }

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const rows = day.vehicles.filter(active.test);
  const open = day.vehicles.find((v) => v.id === openId) ?? null;
  const vehicle = day.vehicles.find((v) => v.id === marking) ?? null;

  return (
    <div className="flex flex-col gap-4 lg:-mb-6 lg:-mr-2 lg:h-[calc(100vh-32px)] lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] pl-1 pr-3 pt-5 lg:min-h-0 lg:pb-5">
        <header className="flex shrink-0 items-end gap-[10px]">
          <div className="flex min-w-px flex-1 flex-col gap-[6px]">
            <h1 className="text-[40px] font-medium leading-[46px] text-ink">Fleet</h1>
            <p className="whitespace-pre text-[14px] leading-5 text-muted">
              {`${day.counts.all} vehicles  ·  ${depotName(day.depotId)} depot  ·  ${dayLabel(day.date)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="shrink-0 whitespace-pre rounded-pill border border-border bg-surface px-[18px] py-[11px] text-[14px] font-semibold leading-5 text-ink"
          >
            {'+  Add vehicle'}
          </button>
        </header>

        <div className="flex shrink-0 flex-wrap gap-[10px]">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-pill px-4 py-[10px] text-[13px] font-semibold leading-[18px] ${
                filter === f.id ? 'bg-primary text-on-primary' : 'bg-surface text-ink'
              }`}
            >
              {f.label} · {f.count(day)}
            </button>
          ))}
        </div>

        <section className="flex min-h-[320px] flex-1 flex-col gap-[2px] overflow-y-auto rounded-card bg-surface p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex shrink-0 gap-3 px-3 py-2 text-[12px] font-bold leading-[15px] tracking-[0.6px] text-muted">
            <p className="w-[150px] shrink-0">VEHICLE</p>
            <p className="w-[150px] shrink-0">TYPE</p>
            <p className="w-[150px] shrink-0">CAPACITY</p>
            <p className="w-[140px] shrink-0">STATUS</p>
            <p className="min-w-px flex-1">TODAY</p>
          </div>
          {rows.length === 0 && (
            <p className="px-3 py-6 text-[13px] text-muted">No vehicles in this view.</p>
          )}
          {rows.map((v, i) => {
            const status = STATUS[v.status];
            const selected = v.id === openId;
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpenId(v.id)}
                onKeyDown={(e) => e.key === 'Enter' && setOpenId(v.id)}
                className={`flex shrink-0 cursor-pointer items-center gap-3 rounded-input p-3 ${
                  selected
                    ? 'border-[1.5px] border-slate bg-info-tint'
                    : i % 2 === 0
                      ? 'bg-wash'
                      : ''
                }`}
              >
                <div className="flex w-[150px] shrink-0 flex-col gap-px overflow-hidden whitespace-nowrap">
                  <p className="text-[14px] font-semibold leading-5 text-ink">{v.plate}</p>
                  <p className="text-[12px] leading-[17px] text-muted">
                    {v.driverName ?? 'Unassigned'}
                  </p>
                </div>
                <p className="w-[150px] shrink-0 text-[13px] font-medium leading-[18px] text-ink">
                  {kindOf(v)}
                </p>
                <p className="w-[150px] shrink-0 text-[13px] leading-[18px] text-muted">
                  {capacityOf(v)}
                </p>
                <div className="flex w-[140px] shrink-0">
                  <span
                    className={`flex items-center gap-[6px] whitespace-nowrap rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${status.chip}`}
                  >
                    <span aria-hidden className="size-[7px] rounded-full bg-current" />
                    {status.label}
                  </span>
                </div>
                <p className="min-w-px flex-1 text-[13px] leading-[18px] text-muted">{v.today}</p>
              </div>
            );
          })}
        </section>
      </div>

      {open && (
        <VehicleDrawer
          vehicle={open}
          onClose={() => setOpenId(null)}
          onMarkOut={() => setMarking(open.id)}
          onBack={async () => {
            await api(`/fleet/${open.id}/back-in-service`, { method: 'POST' });
            await refresh();
            setToast({ kind: 'ok', title: `${open.plate} is back in service`, sub: '' });
          }}
        />
      )}
      {vehicle && (
        <OutOfServiceModal
          vehicle={vehicle}
          today={day.date}
          onClose={() => setMarking(null)}
          onDone={async (result) => {
            setMarking(null);
            await refresh();
            setToast({
              kind: 'ok',
              title: `${vehicle.plate} is out of service`,
              sub:
                result.ordersReturned > 0
                  ? `${result.ordersReturned} orders went back to Planning`
                  : 'Its trip on the road carries on',
            });
          }}
        />
      )}
      {adding && (
        <AddVehicleModal
          onClose={() => setAdding(false)}
          onDone={async (added) => {
            setAdding(false);
            setFilter('all');
            await refresh();
            setOpenId(added.id);
            setToast({
              kind: 'ok',
              title: `${added.plate} added to the fleet`,
              sub: 'It can take trips from today',
            });
          }}
        />
      )}
      {toast && <PlanToast toast={toast} />}
    </div>
  );
}
