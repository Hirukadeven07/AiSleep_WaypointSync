'use client';

import { useEffect, useState } from 'react';
import type { Brand, PlanOrderDetail, PlanVehicleChoice } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { kgText, m3Text, orderWindow } from './format';

const HERO: Record<Brand, string> = {
  Fresh: 'bg-fresh-tint',
  Style: 'bg-style-tint',
  Tech: 'bg-tech-tint',
};
const BRAND_INK: Record<Brand, string> = {
  Fresh: 'text-fresh',
  Style: 'text-style',
  Tech: 'text-tech',
};
const DOCK = { rear_dock: 'Rear dock', street: 'Street', mall_bay: 'Mall bay' } as const;

function Tag({ className, children }: { className: string; children: string }) {
  return (
    <span
      className={`rounded-pill bg-surface px-[10px] py-1 text-[12px] font-semibold leading-[15px] ${className}`}
    >
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start">
      <p className="min-w-px flex-1 text-muted">{label}</p>
      <p className="whitespace-nowrap font-semibold text-ink">{value}</p>
    </div>
  );
}

const STATUS = {
  fits: { text: 'Fits', className: 'bg-success-tint text-success' },
  warn: { text: 'Warning', className: 'bg-warning-tint text-warning' },
  blocked: { text: 'Can’t take it', className: 'bg-danger-tint text-danger' },
} as const;

const choiceKey = (c: PlanVehicleChoice) => c.tripId ?? `${c.vehicleId}:${c.tripNumber}`;

/**
 * The dispatcher picks the truck or van: each of the day's trips, and a new run on a free vehicle.
 * Blocked choices stay listed, dimmed, with the reason, so the dispatcher sees why.
 */
function VehiclePicker({
  choices,
  onAllocate,
}: {
  choices: PlanVehicleChoice[];
  onAllocate: (choice: PlanVehicleChoice) => void;
}) {
  const [type, setType] = useState<'all' | 'truck' | 'van'>('all');
  const [picked, setPicked] = useState<string | null>(() => {
    const best = choices.find((c) => c.bestFit && !c.current);
    return best ? choiceKey(best) : null;
  });
  const shown = choices.filter((c) => type === 'all' || c.vehicleType === type);
  const choice = choices.find((c) => choiceKey(c) === picked) ?? null;

  return (
    <div className="flex shrink-0 flex-col gap-[10px] rounded-[20px] bg-bg p-4">
      <div className="flex items-center gap-2">
        <p className="min-w-px flex-1 text-[12px] font-bold leading-[15px] text-muted">
          ALLOCATE TO A VEHICLE
        </p>
        <div className="flex gap-1 rounded-pill bg-surface p-[3px]" role="tablist">
          {(
            [
              ['all', 'All'],
              ['truck', 'Trucks'],
              ['van', 'Vans'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={type === id}
              onClick={() => setType(id)}
              className={`rounded-pill px-[10px] py-1 text-[12px] font-semibold leading-[15px] ${
                type === id ? 'bg-bg text-ink' : 'text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && (
        <p className="text-[12px] leading-[17px] text-muted">
          {type === 'van' ? 'No van' : type === 'truck' ? 'No truck' : 'No vehicle'} is free for
          this day.
        </p>
      )}
      <div role="radiogroup" aria-label="Vehicle" className="flex flex-col gap-[6px]">
        {shown.map((c) => {
          const key = choiceKey(c);
          const disabled = c.current || c.status === 'blocked';
          const on = picked === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => setPicked(key)}
              className={`flex items-start gap-[10px] rounded-input border-2 bg-surface p-3 text-left ${
                on ? 'border-slate' : 'border-transparent'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg text-slate">
                <Icon name="truck" size={15} />
              </span>
              <span className="flex min-w-px flex-1 flex-col gap-[2px]">
                <span className="flex flex-wrap items-center gap-[6px]">
                  <span className="text-[13px] font-semibold leading-[18px] text-ink">
                    {c.label}
                  </span>
                  {c.current ? (
                    <span className="rounded-pill bg-info-tint px-2 py-[2px] text-[11px] font-semibold leading-[14px] text-slate">
                      On this trip
                    </span>
                  ) : (
                    <span
                      className={`rounded-pill px-2 py-[2px] text-[11px] font-semibold leading-[14px] ${STATUS[c.status].className}`}
                    >
                      {STATUS[c.status].text}
                    </span>
                  )}
                  {c.bestFit && (
                    <span className="rounded-pill bg-info-tint px-2 py-[2px] text-[11px] font-semibold leading-[14px] text-slate">
                      Best fit
                    </span>
                  )}
                </span>
                <span className="text-[12px] leading-[17px] text-muted">{c.detail}</span>
                {c.note && !c.current && (
                  <span
                    className={`text-[12px] leading-[17px] ${
                      c.status === 'blocked' ? 'text-danger' : 'text-warning'
                    }`}
                  >
                    {c.note}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!choice}
        onClick={() => choice && onAllocate(choice)}
        className="flex items-center justify-center rounded-pill bg-primary px-[18px] py-3 text-[14px] font-semibold leading-5 text-on-primary disabled:opacity-40"
      >
        {choice ? `Allocate to ${choice.label.split(' · ')[0]}` : 'Pick a truck or van'}
      </button>
    </div>
  );
}

/** Figma "Plan v2 / Order detail": the order, its products, a warning when it has been moved, and the vehicle picker. */
export function OrderDrawer({
  orderId,
  onClose,
  onAllocate,
  onMoveLater,
}: {
  orderId: string;
  onClose: () => void;
  /** Opens the Move to later dialog for this order. */
  onMoveLater: () => void;
  /** Puts the order on the picked truck or van; the drawer closes when it is done. */
  onAllocate: (detail: PlanOrderDetail, choice: PlanVehicleChoice) => void;
}) {
  const [detail, setDetail] = useState<PlanOrderDetail | null>(null);

  useEffect(() => {
    let live = true;
    api<PlanOrderDetail>(`/plan/orders/${orderId}`)
      .then((d) => live && setDetail(d))
      .catch(() => live && onClose());
    return () => {
      live = false;
    };
  }, [orderId, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const o = detail?.order;

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Close order details"
        onClick={onClose}
        className="absolute inset-0 bg-scrim/35"
      />
      <aside
        role="dialog"
        aria-label="Order details"
        className="absolute bottom-4 right-4 top-4 flex w-[460px] max-w-[calc(100vw-32px)] flex-col gap-[14px] overflow-y-auto rounded-hero bg-surface p-[22px] shadow-ghost [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex shrink-0 items-center">
          <p className="min-w-px flex-1 text-[13px] font-semibold leading-[18px] text-muted">
            Order details
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full bg-bg text-ink"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {detail && o && (
          <>
            <div
              className={`flex shrink-0 flex-col gap-[10px] rounded-card p-[18px] ${HERO[o.brand]}`}
            >
              <p className="whitespace-pre text-[12px] font-semibold leading-[17px] text-muted">
                {o.waitingSinceYesterday
                  ? `${detail.code}  ·  Waiting since yesterday`
                  : detail.code}
              </p>
              <p className="text-[24px] font-semibold leading-[30px] text-ink">{o.storeName}</p>
              <div className="flex gap-[6px]">
                <Tag className={BRAND_INK[o.brand]}>{o.brand}</Tag>
                {o.chilled && <Tag className="text-chilled">Chilled</Tag>}
                {o.movedCount > 0 && <Tag className="text-warning">{`Moved ${o.movedCount}x`}</Tag>}
                {o.urgent && <Tag className="text-danger">Urgent</Tag>}
              </div>
              {o.urgent && (
                <p className="text-[13px] font-medium leading-[18px] text-ink">
                  {o.stockLevel === 'out_of_stock'
                    ? 'The store is out of stock.'
                    : o.stockLevel === 'running_low'
                      ? 'The store is running low.'
                      : 'The store marked this urgent.'}
                  {o.urgentNote ? ` “${o.urgentNote}”` : ''}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-2 rounded-[20px] bg-bg p-4 text-[13px] leading-[18px]">
              <Row label="Area" value={o.district} />
              <Row label="Delivery window" value={orderWindow(o)} />
              <Row
                label="Unloading"
                value={`${DOCK[detail.dockType]}${detail.unloadMin !== null ? `, about ${detail.unloadMin} min` : ''}`}
              />
            </div>

            <div className="flex shrink-0 flex-col gap-2 rounded-[20px] bg-bg p-4">
              <div className="flex items-start">
                <p className="text-[12px] font-bold leading-[15px] text-muted">PRODUCTS</p>
                <span className="min-w-px flex-1" />
                <p className="text-[12px] leading-[18px] text-muted">{detail.lines.length} items</p>
              </div>
              {detail.lines.map((l) => (
                <div key={l.id} className="flex items-center gap-[6px]">
                  <p className="whitespace-nowrap text-[13px] leading-[18px] text-ink">{l.name}</p>
                  {l.chilled && (
                    <p className="text-[11px] font-semibold leading-[15px] text-chilled">Chilled</p>
                  )}
                  <span className="min-w-px flex-1" />
                  <p className="whitespace-nowrap text-[13px] font-semibold leading-[18px] text-ink">
                    {l.qty} {l.pack}
                  </p>
                </div>
              ))}
              <div className="h-px w-full bg-border" />
              <div className="flex items-start">
                <p className="text-[13px] leading-[18px] text-muted">Total</p>
                <span className="min-w-px flex-1" />
                <p className="whitespace-nowrap text-[13px] font-semibold leading-[18px] text-ink">
                  {kgText(o.weightKg)} kg · {m3Text(o.volumeM3)} m³
                  {o.chilled ? ' · needs chilled space' : ''}
                </p>
              </div>
            </div>

            {detail.warning && (
              <div className="flex shrink-0 items-start gap-[10px] rounded-note bg-warning-tint p-[14px]">
                <Icon name="alert" size={18} className="text-warning" />
                <p className="min-w-px flex-1 text-[12px] font-medium leading-[18px] text-ink">
                  {detail.warning}
                </p>
              </div>
            )}

            <VehiclePicker
              choices={detail.vehicles}
              onAllocate={(choice) => onAllocate(detail, choice)}
            />

            <span className="min-h-px flex-1" />
            <button
              type="button"
              onClick={onMoveLater}
              className="flex shrink-0 items-center justify-center rounded-pill border border-border bg-surface px-[18px] py-3 text-[14px] font-semibold leading-5 text-ink"
            >
              Move to later
            </button>
            <p className="shrink-0 text-center text-[12px] font-medium leading-[17px] text-muted">
              Or drag the order onto any trip.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
