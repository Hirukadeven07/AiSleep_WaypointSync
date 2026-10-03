'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IncidentDetail as Detail, IncidentList as List } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/poll';
import { IncidentDetail } from './IncidentDetail';
import { IncidentList } from './IncidentList';
import { LogIncidentModal } from './LogIncidentModal';

type Filter = 'active' | 'resolved' | 'all';

const colomboDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(iso));

/** Figma "Incidents": what went wrong today, how to recover, and what was done. */
export function Incidents() {
  const { data: list, error, refresh } = usePoll(() => api<List>('/incidents'), 5_000);
  const [filter, setFilter] = useState<Filter>('active');
  const [picked, setPicked] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  const [logging, setLogging] = useState(false);
  const opened = useRef(new Set<string>());

  // "Truck broke down" links here with ?id=<incident> so the new breakdown opens straight away.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setPicked(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const active = list?.active ?? [];
  const resolvedToday = (list?.resolved ?? []).filter(
    (i) => list && colomboDay(i.createdAt) === list.date,
  );
  const shown =
    filter === 'active'
      ? { active, resolved: resolvedToday, label: 'RESOLVED TODAY' }
      : filter === 'resolved'
        ? { active: [], resolved: list?.resolved ?? [], label: 'RESOLVED THIS WEEK' }
        : { active, resolved: list?.resolved ?? [], label: 'RESOLVED THIS WEEK' };

  const selectedId =
    picked && [...(list?.active ?? []), ...(list?.resolved ?? [])].some((i) => i.id === picked)
      ? picked
      : (shown.active[0]?.id ?? shown.resolved[0]?.id ?? null);

  const load = useCallback(async (id: string) => {
    try {
      setDetail(await api<Detail>(`/incidents/${encodeURIComponent(id)}`));
    } catch {
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    load(selectedId);
    const t = setInterval(() => load(selectedId), 5_000);
    return () => clearInterval(t);
  }, [selectedId, load]);

  // Opening an incident marks it as seen ("You opened the incident" in the timeline).
  useEffect(() => {
    if (!detail || detail.state !== 'open' || detail.kind === 'missing_items') return;
    if (opened.current.has(detail.id)) return;
    opened.current.add(detail.id);
    api<Detail>(`/incidents/${encodeURIComponent(detail.id)}/acknowledge`, { method: 'POST' })
      .then(setDetail)
      .then(refresh)
      .catch(() => opened.current.delete(detail.id));
  }, [detail, refresh]);

  if (!list) {
    return (
      <p className="px-3 pt-5 text-body text-muted" role="status">
        {error ? 'The incidents could not be loaded.' : 'Loading the incidents…'}
      </p>
    );
  }

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'active', label: `Active · ${list.active.length}` },
    { id: 'resolved', label: 'Resolved' },
    { id: 'all', label: 'All' },
  ];
  const current = detail && detail.id === selectedId ? detail : null;

  return (
    <div className="flex flex-col gap-4 lg:-mb-6 lg:-mr-2 lg:h-[calc(100vh-32px)]">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] pl-1 pr-3 pt-5 lg:min-h-0 lg:pb-5">
        <header className="flex shrink-0 items-end gap-[10px]">
          <div className="flex min-w-px flex-1 flex-col gap-[6px]">
            <h1 className="text-[40px] font-medium leading-[46px] text-ink">Incidents</h1>
            <p className="whitespace-pre text-[14px] leading-5 text-muted">
              {`${list.active.length} active  ·  ${list.resolvedThisWeek} resolved this week`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLogging(true)}
            className="shrink-0 whitespace-pre rounded-pill border border-border bg-surface px-[18px] py-[11px] text-[14px] font-semibold leading-5 text-ink"
          >
            {'+  Log incident'}
          </button>
        </header>

        <div className="flex shrink-0 flex-wrap gap-[10px]">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-pill px-4 py-[10px] text-[13px] font-semibold leading-[18px] ${
                filter === f.id ? 'bg-primary text-on-primary' : 'bg-surface text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <IncidentList
            active={shown.active}
            resolved={shown.resolved}
            resolvedLabel={shown.label}
            selectedId={selectedId}
            onSelect={setPicked}
          />
          {current ? (
            <IncidentDetail
              detail={current}
              onChange={(next) => {
                setDetail(next);
                refresh();
              }}
              onResolved={(next) => {
                setDetail(next);
                refresh();
                setToast({
                  title: 'Incident resolved',
                  sub: `${next.resolution?.title ?? next.outcome ?? 'Resolved'} · stores notified with new ETAs`,
                });
              }}
              onAcknowledged={() => {
                setToast({
                  title: 'Incident acknowledged',
                  sub: 'The trip carries on as it is. It stays logged here.',
                });
              }}
            />
          ) : (
            <section className="flex min-h-[240px] flex-1 items-center justify-center rounded-card bg-surface p-6">
              <p className="text-[14px] text-muted">
                {selectedId ? 'Loading the incident…' : 'No incident to show.'}
              </p>
            </section>
          )}
        </div>
      </div>
      {logging && (
        <LogIncidentModal
          onClose={() => setLogging(false)}
          onLogged={async (incident) => {
            setLogging(false);
            setFilter('active');
            setPicked(incident.id);
            setDetail(incident);
            await refresh();
            setToast({ title: 'Incident logged', sub: incident.title });
          }}
        />
      )}
      {toast && (
        <div
          role="status"
          className="fixed right-6 top-6 z-40 flex max-w-[320px] flex-col gap-[2px] rounded-[16px] bg-primary px-4 py-3"
        >
          <span className="text-[13px] font-bold leading-[18px] text-on-primary">{toast.title}</span>
          <span className="text-[12px] leading-[17px] text-sand">{toast.sub}</span>
        </div>
      )}
    </div>
  );
}
