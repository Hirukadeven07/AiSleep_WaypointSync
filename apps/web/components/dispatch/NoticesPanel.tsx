'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import type { DispatcherNotice, DispatcherNotices, LiveNotice, NoticeCategory } from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { LIVE_NOTICE } from '@/lib/live-notices';

type Tab = NoticeCategory | 'all';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'stores', label: 'Stores' },
  { id: 'planning', label: 'Planning' },
];
const DOT: Record<NoticeCategory, string> = {
  incidents: 'bg-danger',
  stores: 'bg-warning',
  planning: 'bg-info',
};

function noticeCategory(link: string | null): NoticeCategory {
  if (link?.startsWith('/dispatch/plan')) return 'planning';
  if (link?.startsWith('/dispatch/board')) return 'stores';
  return 'incidents';
}

function withNotice(data: DispatcherNotices | null, live: LiveNotice): DispatcherNotices {
  const category = noticeCategory(live.link);
  const notice: DispatcherNotice = {
    id: live.id,
    category,
    title: live.title,
    body: live.body,
    link: live.link,
    createdAt: live.createdAt,
  };
  if (!data) {
    return {
      notices: [notice],
      counts: {
        all: 1,
        incidents: category === 'incidents' ? 1 : 0,
        stores: category === 'stores' ? 1 : 0,
        planning: category === 'planning' ? 1 : 0,
      },
    };
  }
  if (data.notices.some((n) => n.id === notice.id)) return data;
  return {
    notices: [notice, ...data.notices],
    counts: {
      ...data.counts,
      all: data.counts.all + 1,
      [category]: data.counts[category] + 1,
    },
  };
}
const SIZE = 380;

function ago(iso: string, now: number) {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

/** Unseen notices for the dispatcher. The live stream adds one the moment it is saved; the 15 s poll fills any gap. */
function useNotices() {
  const [data, setData] = useState<DispatcherNotices | null>(null);
  const load = useCallback(
    () =>
      api<DispatcherNotices>('/dispatch/notices')
        .then(setData)
        .catch(() => undefined),
    [],
  );
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);
  return { data, setData, load };
}

/**
 * The bell on the live day: a square panel of unseen notices with All / Incidents / Stores /
 * Planning tabs. Clicking a notice marks it seen and it leaves the list, so only the newest unseen stay.
 */
export function NoticesBell() {
  const { data, setData, load } = useNotices();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [style, setStyle] = useState<CSSProperties>({});
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const now = Date.now();

  useEffect(() => {
    const onNotice = (event: Event) => {
      const live = (event as CustomEvent<LiveNotice>).detail;
      if (!live?.id) return;
      setData((current) => withNotice(current, live));
    };
    window.addEventListener(LIVE_NOTICE, onNotice);
    return () => window.removeEventListener(LIVE_NOTICE, onNotice);
  }, [setData]);

  // Pin the square under the bell, kept on screen.
  useLayoutEffect(() => {
    if (!open) return;
    const pin = () => {
      const r = bell.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(SIZE, window.innerWidth - 24);
      setStyle({
        top: r.bottom + 8,
        left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)),
        width,
        height: Math.min(SIZE + 40, window.innerHeight - r.bottom - 20),
      });
    };
    pin();
    window.addEventListener('resize', pin);
    window.addEventListener('scroll', pin, true);
    return () => {
      window.removeEventListener('resize', pin);
      window.removeEventListener('scroll', pin, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void load();
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!bell.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, load]);

  // Seen: drop it from the list straight away, then tell the server.
  const seen = (n: DispatcherNotice) => {
    setData((d) => {
      if (!d) return d;
      const notices = d.notices.filter((x) => x.id !== n.id);
      return {
        notices,
        counts: {
          ...d.counts,
          all: d.counts.all - 1,
          [n.category]: d.counts[n.category] - 1,
        },
      };
    });
    void api(`/dispatch/notices/${n.id}/read`, { method: 'POST' }).catch(() => void load());
  };

  const unseen = data?.counts.all ?? 0;
  const list = (data?.notices ?? []).filter((n) => tab === 'all' || n.category === tab);

  return (
    <>
      <button
        ref={bell}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notifications, ${unseen} unseen`}
        className="relative flex size-10 items-center justify-center rounded-full bg-surface text-slate"
      >
        <Icon name="bell" size={18} />
        {unseen > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-pill bg-danger px-1 text-[11px] font-semibold leading-[18px] text-bg">
            {unseen > 99 ? '99+' : unseen}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Notifications"
            style={style}
            className="fixed z-40 flex flex-col gap-3 rounded-card bg-surface p-4 shadow-lg ring-1 ring-border"
          >
            <div className="flex items-center">
              <h2 className="flex-1 text-[16px] font-semibold leading-[22px] text-ink">
                Notifications
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-full bg-bg text-muted"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-[6px]" role="tablist" aria-label="Notification type">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`whitespace-nowrap rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${
                    tab === t.id ? 'bg-primary text-bg' : 'bg-bg text-ink'
                  }`}
                >
                  {t.label} · {data?.counts[t.id] ?? 0}
                </button>
              ))}
            </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {list.length === 0 && (
                <li className="flex flex-1 items-center justify-center text-center text-[13px] text-muted">
                  {data ? 'Nothing new here.' : 'Loading…'}
                </li>
              )}
              {list.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => seen(n)}
                    title="Mark as seen"
                    className="flex w-full items-start gap-[10px] rounded-input bg-bg p-3 text-left hover:bg-wash"
                  >
                    <span
                      aria-hidden
                      className={`mt-[6px] size-2 shrink-0 rounded-full ${DOT[n.category]}`}
                    />
                    <span className="flex min-w-px flex-1 flex-col gap-[2px]">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-px flex-1 truncate text-[13px] font-semibold leading-[18px] text-ink">
                          {n.title}
                        </span>
                        <span className="shrink-0 text-[11px] leading-[14px] text-muted">
                          {ago(n.createdAt, now)}
                        </span>
                      </span>
                      <span className="text-[12px] leading-[17px] text-muted">{n.body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {list.length > 0 && (
              <p className="text-center text-[11px] leading-[14px] text-muted">
                Click a notification to mark it as seen.
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
