'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Brand, PlanOrder, PlanStore } from '@waypoint/contracts';
import { allDistricts, districtKey } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { Select } from './Select';
import type { PlanEdit } from './usePlanEdit';
import { SECTION_LABEL, dayLabel, kgText, orderWindow, sectionOf, type Section } from './format';

export const BRAND_TAG: Record<Brand, string> = {
  Fresh: 'bg-fresh-tint text-fresh',
  Style: 'bg-style-tint text-style',
  Tech: 'bg-tech-tint text-tech',
};

export function BrandTag({ brand }: { brand: Brand }) {
  return (
    <span
      className={`rounded-pill px-[9px] py-[3px] text-[12px] font-semibold leading-[15px] ${BRAND_TAG[brand]}`}
    >
      {brand}
    </span>
  );
}

/** Drags show a copy of the row with the Figma "Dragging" frame: white, 2px slate border, soft shadow. */
export function dragImage(row: HTMLElement, e: React.DragEvent) {
  const ghost = row.cloneNode(true) as HTMLElement;
  ghost.classList.remove('bg-warning-tint', 'bg-wash', 'bg-surface');
  ghost.classList.add(
    'border-2',
    'border-slate',
    'bg-surface',
    'shadow-ghost',
    'fixed',
    '-left-[2000px]',
    'top-0',
  );
  ghost.style.width = `${row.offsetWidth}px`;
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 24, 24);
  setTimeout(() => ghost.remove(), 0);
}

function OrderRow({ order, edit }: { order: PlanOrder; edit: PlanEdit }) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onClick={() => edit.openDrawer(order.id)}
      onKeyDown={(e) => e.key === 'Enter' && edit.openDrawer(order.id)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', order.id);
        dragImage(e.currentTarget, e);
        edit.startDrag({ orderId: order.id, storeName: order.storeName, fromTripId: null });
      }}
      onDragEnd={edit.endDrag}
      className={`flex shrink-0 cursor-grab items-center gap-[10px] rounded-input px-3 py-[10px] ${
        order.movedCount > 0 ? 'bg-warning-tint' : 'bg-wash'
      } ${edit.drag?.orderId === order.id ? 'opacity-40' : ''}`}
    >
      <div className="flex min-w-px flex-[1_0_0] flex-col gap-[3px]">
        <div className="flex items-center gap-[6px]">
          <p className="whitespace-nowrap text-[13px] font-semibold leading-[18px] text-ink">
            {order.storeName}
          </p>
          {order.urgent && (
            <span
              title={order.urgentNote ?? undefined}
              className="rounded-pill bg-danger-tint px-[9px] py-[3px] text-[12px] font-semibold leading-[15px] text-danger"
            >
              Urgent
              {order.stockLevel
                ? ` · ${order.stockLevel === 'out_of_stock' ? 'out of stock' : 'running low'}`
                : ''}
            </span>
          )}
          {order.movedCount > 0 && (
            <span className="rounded-pill bg-surface px-[9px] py-[3px] text-[12px] font-semibold leading-[15px] text-warning">
              Moved {order.movedCount}x
            </span>
          )}
        </div>
        <div className="flex items-center gap-[6px]">
          <BrandTag brand={order.brand} />
          {order.chilled && <Icon name="snow" size={12} className="text-chilled" />}
          <p className="whitespace-nowrap text-[12px] leading-[15px] text-muted">
            {order.district} · {orderWindow(order)} · {kgText(order.weightKg)} kg
          </p>
        </div>
      </div>
      <Icon name="grip" size={16} className="text-muted" />
    </div>
  );
}

function MovedCard({ order, edit }: { order: PlanOrder; edit: PlanEdit }) {
  return (
    <div className="flex shrink-0 flex-col gap-[6px] rounded-input bg-wash p-3">
      <div className="flex items-center gap-[6px]">
        <p className="whitespace-nowrap text-[13px] font-semibold leading-[18px] text-ink">
          {order.storeName}
        </p>
        <BrandTag brand={order.brand} />
      </div>
      {order.deferReason && (
        <p className="text-[12px] leading-[17px] text-muted">{order.deferReason}</p>
      )}
      <div className="flex items-center gap-2 text-[12px] leading-[17px]">
        <Icon name="clock" size={13} className="text-warning" />
        <p className="font-semibold text-warning">
          {order.deferredTo ? `${dayLabel(order.deferredTo)} · store notified` : 'store notified'}
        </p>
        <button
          type="button"
          onClick={() => edit.bringBack(order.id, order.storeName)}
          className="ml-2 font-bold text-slate"
        >
          Bring back
        </button>
      </div>
    </div>
  );
}

const SECTIONS: Section[] = ['fresh', 'morning', 'afternoon'];

/** Figma "Order queue": Waiting / Moved to later tabs, search, Type and District filters, orders by window. */
export function OrderQueue({
  orders,
  moved,
  districts,
  edit,
  className = '',
}: {
  orders: PlanOrder[];
  moved: PlanOrder[];
  districts: string[];
  edit: PlanEdit;
  className?: string;
}) {
  const [tab, setTab] = useState<'waiting' | 'moved'>('waiting');
  const [type, setType] = useState('All');
  const [district, setDistrict] = useState('All');
  const [store, setStore] = useState('All');
  const [stores, setStores] = useState<PlanStore[] | null>(null);
  const [search, setSearch] = useState('');

  // Once a district is picked, offer that area's stores (of the picked type) as a third filter.
  useEffect(() => {
    setStore('All');
    setStores(null);
    if (district === 'All') return;
    let live = true;
    const qs = new URLSearchParams({ district, ...(type === 'All' ? {} : { brand: type }) });
    api<PlanStore[]>(`/plan/stores?${qs}`)
      .then((rows) => live && setStores(rows))
      .catch(() => live && setStores([]));
    return () => {
      live = false;
    };
  }, [type, district]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (type === 'All' || o.brand === type) &&
        (district === 'All' || districtKey(o.district) === districtKey(district)) &&
        (store === 'All' || o.storeId === store) &&
        (!q || o.storeName.toLowerCase().includes(q) || o.district.toLowerCase().includes(q)),
    );
  }, [orders, type, district, store, search]);

  return (
    <aside
      className={`flex flex-col gap-[10px] overflow-y-auto rounded-card bg-surface p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <div className="flex shrink-0 gap-1 rounded-pill bg-bg p-1" role="tablist">
        {(
          [
            ['waiting', `Waiting · ${orders.length}`],
            ['moved', `Moved to later · ${moved.length}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex min-w-px flex-1 justify-center whitespace-nowrap rounded-pill px-[10px] py-[9px] text-[13px] font-semibold leading-[18px] ${
              tab === id ? 'bg-surface text-ink' : 'text-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'moved' ? (
        <>
          <p className="shrink-0 rounded-[12px] bg-bg px-3 py-[10px] text-[12px] font-medium leading-[17px] text-muted">
            These orders could not fit tomorrow. Each store has been told why and when to expect it.
          </p>
          {moved.map((o) => (
            <MovedCard key={o.id} order={o} edit={edit} />
          ))}
        </>
      ) : (
        <>
          <label className="flex shrink-0 items-center gap-2 rounded-pill bg-bg px-[14px] py-[9px]">
            <Icon name="search" size={14} className="text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stores or areas"
              className="min-w-px flex-1 bg-transparent text-[13px] leading-[18px] text-ink outline-none placeholder:text-muted"
            />
          </label>

          <div className="flex shrink-0 gap-2">
            <Select
              label="Type"
              value={type}
              options={['All', 'Fresh', 'Style', 'Tech'].map((t) => ({ value: t, label: t }))}
              onChange={setType}
              className="flex-[1_0_0]"
            />
            <Select
              label="District"
              value={district}
              options={['All', ...allDistricts(districts)].map((d) => ({ value: d, label: d }))}
              onChange={setDistrict}
              searchable
              className="flex-[1_0_0]"
            />
          </div>
          {district !== 'All' && (
            <Select
              label="Store"
              value={store}
              options={[
                {
                  value: 'All',
                  label:
                    stores === null
                      ? 'Loading…'
                      : stores.length === 0
                        ? `No ${type === 'All' ? '' : `${type} `}stores in ${district}`
                        : `All ${stores.length} stores`,
                },
                ...(stores ?? []).map((s) => ({ value: s.id, label: s.name })),
              ]}
              onChange={setStore}
              searchable={(stores?.length ?? 0) > 8}
              disabled={!stores || stores.length === 0}
              className="w-full shrink-0"
            />
          )}

          <p className="shrink-0 text-[12px] font-medium leading-[15px] text-muted">
            Sorted by delivery window, earliest first
          </p>

          {SECTIONS.map((s) => {
            const rows = visible.filter((o) => sectionOf(o) === s);
            if (rows.length === 0) return null;
            return (
              <div key={s} className="flex flex-col gap-[10px]">
                <p
                  className={`text-[12px] font-bold leading-[15px] tracking-[0.8px] ${
                    s === 'fresh' ? 'text-olive-ink' : 'text-muted'
                  }`}
                >
                  {SECTION_LABEL[s]} · {rows.length}
                </p>
                {rows.map((o) => (
                  <OrderRow key={o.id} order={o} edit={edit} />
                ))}
              </div>
            );
          })}
        </>
      )}
    </aside>
  );
}
