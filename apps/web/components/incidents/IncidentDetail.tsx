'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  IncidentDetail as Detail,
  IncidentStop,
  RecoveryAction,
  ReplacementOption,
} from '@waypoint/contracts';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { initials } from '@/lib/initials';
import { toneOf } from './IncidentList';

const CHIP: Record<IncidentStop['tone'], string> = {
  danger: 'bg-danger/[0.12] text-danger',
  warning: 'bg-warning/[0.12] text-warning',
  success: 'bg-success/[0.12] text-success',
  neutral: 'bg-muted/[0.12] text-muted',
};
const VERDICT: Record<ReplacementOption['tone'], string> = {
  good: 'bg-success/[0.14] text-success',
  warn: 'bg-warning/[0.14] text-warning',
  bad: 'bg-danger/[0.12] text-danger',
};

const time = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));

/** Timeline dot: red for the report, amber for a warning to stores, green for the fix, blue for ETAs. */
function dotOf(text: string, first: boolean) {
  if (first) return 'bg-danger';
  if (/told|delay/i.test(text)) return 'bg-warning';
  if (/sent replacement|moved/i.test(text)) return 'bg-success';
  if (/ETA/.test(text)) return 'bg-blue';
  return 'bg-slate';
}

const Section = ({
  title,
  className = 'bg-bg',
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <section className={`flex shrink-0 flex-col gap-[10px] rounded-[20px] px-4 py-3 ${className}`}>
    <h3 className="text-[15px] font-semibold leading-[21px] text-ink">{title}</h3>
    {children}
  </section>
);

function Radio({ on, size }: { on: boolean; size: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full border-2 ${
        on ? 'border-primary bg-surface' : 'border-mist bg-surface'
      }`}
    >
      {on && <span className="size-[40%] rounded-full bg-primary" />}
    </span>
  );
}

const OPTIONS: { action: RecoveryAction; title: string; hint?: string }[] = [
  {
    action: 'replacement',
    title: 'Send a replacement vehicle',
    hint: 'Pick an available vehicle. Travel time and delivery windows are checked for each one.',
  },
  { action: 'tomorrow', title: 'Move remaining stops to tomorrow' },
  { action: 'split', title: 'Split it' },
  {
    action: 'defer_one',
    title: 'Defer one store, send the rest',
    hint: 'Pick the store that waits for the next delivery day. The vehicle you pick takes the others. The store gets a notice with the reason and the new date.',
  },
];

/** The store that waits for the next delivery day (defer_one). */
function StorePicker({
  stops,
  value,
  onPick,
}: {
  stops: Detail['stops'];
  value: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-[6px] py-[6px]">
      <p className="text-[12px] font-semibold leading-4 text-muted">Store to defer</p>
      {stops.map((s) => {
        const on = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation();
              onPick(s.id);
            }}
            className={`flex w-full items-center gap-[10px] rounded-[12px] px-3 py-[9px] text-left ${
              on
                ? 'border-[1.5px] border-slate bg-surface'
                : 'border-[1.5px] border-transparent bg-wash'
            }`}
          >
            <Radio on={on} size={14} />
            <span className="min-w-px flex-1 truncate text-[13px] font-semibold leading-[18px] text-ink">
              {s.storeName}
            </span>
            <span className="shrink-0 text-[12px] leading-[15px] text-muted">{s.windowText}</span>
          </button>
        );
      })}
    </div>
  );
}

function Picker({
  options,
  value,
  onPick,
}: {
  options: ReplacementOption[];
  value: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-[6px] py-[6px]">
      {options.map((v) => {
        const on = v.vehicleId === value;
        return (
          <button
            key={v.vehicleId}
            type="button"
            disabled={!v.available}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation();
              onPick(v.vehicleId);
            }}
            className={`flex w-full items-center gap-[10px] rounded-[12px] px-3 py-[9px] text-left ${
              on
                ? 'border-[1.5px] border-slate bg-surface'
                : 'border-[1.5px] border-transparent bg-wash'
            } ${v.available ? '' : 'opacity-60'}`}
          >
            <Radio on={on} size={14} />
            <span className="flex min-w-px flex-1 flex-col overflow-hidden whitespace-nowrap">
              <span className="truncate text-[13px] font-semibold leading-[18px] text-ink">
                {v.label}
              </span>
              <span className="truncate text-[12px] leading-[15px] text-muted">{v.detail}</span>
            </span>
            <span
              className={`shrink-0 whitespace-nowrap rounded-pill px-[9px] py-[3px] text-[12px] font-semibold leading-[15px] ${VERDICT[v.tone]}`}
            >
              {v.verdict}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const plateOf = (label: string) => label.split(' · ')[0];

/** Figma "Incident detail": the affected stops, how to resolve, the details and the timeline. */
export function IncidentDetail({
  detail: d,
  onChange,
  onResolved,
  onAcknowledged,
}: {
  detail: Detail;
  onChange: (next: Detail) => void;
  onResolved: (next: Detail) => void;
  onAcknowledged: () => void;
}) {
  const resolved = d.state === 'resolved';
  const tone = toneOf(d);
  const firstFree = d.replacements.find((r) => r.available)?.vehicleId ?? null;
  const [action, setAction] = useState<RecoveryAction>('replacement');
  const [vehicleId, setVehicleId] = useState<string | null>(firstFree);
  const [deferStopId, setDeferStopId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different incident starts from the best replacement again.
  useEffect(() => {
    setAction('replacement');
    setVehicleId(firstFree);
    setDeferStopId(null);
    setReason('');
    setError(null);
  }, [d.id]);
  // The chosen vehicle can stop being free while the page is open.
  useEffect(() => {
    if (vehicleId && !d.replacements.find((r) => r.vehicleId === vehicleId && r.available)) {
      setVehicleId(firstFree);
    }
  }, [d.replacements, vehicleId, firstFree]);

  const chosen = d.replacements.find((r) => r.vehicleId === vehicleId);
  const needsVehicle = action !== 'tomorrow';
  const deferStop = d.stops.find((s) => s.id === deferStopId);
  const canConfirm =
    !busy && (!needsVehicle || !!chosen) && (action !== 'defer_one' || !!deferStop);
  const confirmText =
    action === 'tomorrow'
      ? 'Move to tomorrow'
      : action === 'defer_one' && !deferStop
        ? 'Choose the store to defer'
        : chosen
          ? action === 'defer_one'
            ? `Defer ${deferStop!.storeName}, send ${plateOf(chosen.label)}`
            : action === 'split'
              ? `Confirm split with ${plateOf(chosen.label)}`
              : `Confirm and send ${plateOf(chosen.label)}`
          : 'Choose a vehicle';

  async function run<T extends Detail>(path: string, body?: unknown, done?: (r: T) => void) {
    setBusy(true);
    setError(null);
    try {
      const next = await api<T>(`/incidents/${encodeURIComponent(d.id)}/${path}`, {
        method: 'POST',
        body,
      });
      (done ?? onChange)(next);
    } catch {
      setError('That did not go through. Check the details and try again.');
    } finally {
      setBusy(false);
    }
  }

  const stopsAllMet = resolved && d.stops.every((s) => s.tone !== 'warning');

  return (
    <section
      aria-label="Incident detail"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-[14px] overflow-y-auto rounded-card bg-surface p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex shrink-0 items-center gap-[14px]">
        <span
          className={`flex size-[52px] shrink-0 items-center justify-center rounded-full ${tone.tint} ${
            resolved ? 'text-success' : d.kind === 'breakdown' ? 'text-danger' : 'text-warning'
          }`}
        >
          <Icon name="alert" size={22} />
        </span>
        <div className="flex min-w-px flex-1 flex-col gap-[2px]">
          <h2 className="text-[24px] font-semibold leading-[30px] text-ink">{d.title}</h2>
          <p className="whitespace-pre text-[13px] leading-[18px] text-muted">{d.subtitle}</p>
        </div>
        <span
          className={`flex items-center gap-[6px] whitespace-nowrap rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${
            resolved ? CHIP.success : CHIP.danger
          }`}
        >
          <span aria-hidden className="size-[7px] rounded-full bg-current" />
          {d.status}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
          <Section
            title={stopsAllMet ? 'Affected stops · all windows still met' : 'Affected stops'}
          >
            <div className="flex flex-col gap-[6px]">
              {d.stops.map((s) => {
                const done = s.chip === 'Done';
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-[10px] rounded-[12px] px-3 py-[10px] ${
                      done ? 'bg-surface/60' : 'bg-surface'
                    }`}
                  >
                    <p
                      className={`min-w-px flex-1 text-[13px] leading-[18px] ${
                        done ? 'font-medium text-muted' : 'font-semibold text-ink'
                      }`}
                    >
                      {s.storeName}
                      {s.note && !done && (
                        <span className="block text-[12px] font-normal leading-[17px] text-muted">
                          {s.note}
                        </span>
                      )}
                    </p>
                    <p className="whitespace-nowrap text-[12px] leading-[17px] text-muted">
                      {done && s.note ? s.note : s.windowText}
                    </p>
                    <span
                      className={`flex items-center gap-[6px] whitespace-nowrap rounded-pill px-[10px] py-[5px] text-[12px] font-semibold leading-[15px] ${
                        s.chip.startsWith('New ETA') && s.tone === 'success'
                          ? 'bg-info/[0.12] text-info'
                          : CHIP[s.tone]
                      }`}
                    >
                      <span aria-hidden className="size-[7px] rounded-full bg-current" />
                      {s.chip}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>

          {d.resolution && (
            <div className="flex shrink-0 flex-col gap-2">
              <h3 className="px-4 text-[15px] font-semibold leading-[21px] text-ink">Resolution</h3>
              <div className="flex flex-col gap-2 rounded-card bg-success-tint p-4">
                <div className="flex items-center gap-[10px]">
                  <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-surface text-ink">
                    <Icon name="check" size={14} />
                  </span>
                  <p className="min-w-px flex-1 text-[14px] font-semibold leading-5 text-ink">
                    {d.resolution.title}
                  </p>
                </div>
                <p className="text-[12px] leading-[18px] text-muted">{d.resolution.text}</p>
                <div className="flex gap-2">
                  <Link
                    href="/dispatch/board"
                    className="rounded-pill bg-primary px-4 py-2 text-[12px] font-semibold leading-4 text-on-primary"
                  >
                    View on dispatch board
                  </Link>
                  {resolved && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run('reopen')}
                      className="rounded-pill bg-surface px-4 py-2 text-[12px] font-semibold leading-4 text-ink disabled:opacity-50"
                    >
                      Reopen incident
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!resolved && (
            <Section
              title={d.recoverable ? 'How do you want to resolve this?' : 'What next?'}
              className="bg-surface"
            >
              {d.recoverable && (
                <>
                  {OPTIONS.map((o) => {
                    const on = action === o.action;
                    const unavailable =
                      d.stops.length === 0 ||
                      (o.action !== 'tomorrow' && !firstFree) ||
                      (o.action === 'defer_one' && d.stops.length < 2);
                    return (
                      <div
                        key={o.action}
                        role="radio"
                        aria-checked={on}
                        aria-disabled={unavailable}
                        tabIndex={unavailable ? -1 : 0}
                        onClick={() => !unavailable && setAction(o.action)}
                        onKeyDown={(e) => e.key === 'Enter' && !unavailable && setAction(o.action)}
                        className={`flex cursor-pointer items-start gap-3 rounded-[16px] px-[14px] py-[10px] ${
                          on
                            ? 'border-2 border-slate bg-info-tint'
                            : 'border-2 border-transparent bg-bg'
                        } ${unavailable ? 'opacity-60' : ''}`}
                      >
                        <span className="pt-[1px]">
                          <Radio on={on} size={18} />
                        </span>
                        <div className="flex min-w-px flex-1 flex-col gap-[2px]">
                          <p className="text-[14px] font-semibold leading-5 text-ink">{o.title}</p>
                          {on && o.hint && (
                            <p className="text-[12px] leading-[17px] text-muted">{o.hint}</p>
                          )}
                          {on && o.action === 'defer_one' && (
                            <>
                              <StorePicker
                                stops={d.stops}
                                value={deferStopId}
                                onPick={setDeferStopId}
                              />
                              <label
                                className="flex w-full flex-col gap-[6px] py-[6px] text-[12px] font-semibold leading-4 text-muted"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Reason the store sees (optional)
                                <input
                                  value={reason}
                                  maxLength={300}
                                  onChange={(e) => setReason(e.target.value)}
                                  placeholder="The truck broke down on the road"
                                  className="rounded-[12px] border border-mist bg-surface px-3 py-[9px] text-[13px] font-normal text-ink"
                                />
                              </label>
                              <p className="text-[12px] font-semibold leading-4 text-muted">
                                Vehicle for the other stops
                              </p>
                            </>
                          )}
                          {on && o.action !== 'tomorrow' && (
                            <Picker
                              options={d.replacements}
                              value={vehicleId}
                              onPick={setVehicleId}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {error && (
                    <p role="alert" className="text-[13px] font-medium text-danger">
                      {error}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run('notify')}
                      className="whitespace-nowrap rounded-pill border border-border bg-surface px-[18px] py-[11px] text-[14px] font-semibold leading-5 text-ink disabled:opacity-50"
                    >
                      Notify store managers
                    </button>
                    <button
                      type="button"
                      disabled={!canConfirm}
                      onClick={() =>
                        run<Detail>(
                          'resolve',
                          {
                            action,
                            vehicleId: needsVehicle ? vehicleId : undefined,
                            ...(action === 'defer_one'
                              ? { deferStopId, reason: reason.trim() || undefined }
                              : {}),
                          },
                          onResolved,
                        )
                      }
                      className="whitespace-nowrap rounded-pill bg-primary px-[18px] py-[11px] text-[14px] font-semibold leading-5 text-on-primary disabled:opacity-50"
                    >
                      {confirmText}
                    </button>
                  </div>
                  <span className="h-px w-full shrink-0 bg-border" />
                </>
              )}
              <div className="flex items-center gap-[10px] rounded-[14px] bg-wash p-[14px]">
                <Icon name="check" size={16} className="shrink-0 text-ink" />
                <div className="flex min-w-px flex-1 flex-col gap-px">
                  <p className="text-[13px] font-semibold leading-[18px] text-ink">
                    {d.recoverable
                      ? 'None of these — just acknowledge and keep the trip as is'
                      : 'Tell the stores, or just acknowledge'}
                  </p>
                  <p className="text-[12px] leading-4 text-muted">
                    {d.recoverable
                      ? 'The breakdown stays logged. You can come back to this incident any time.'
                      : 'The incident stays logged. You can come back to it any time.'}
                  </p>
                </div>
                {!d.recoverable && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run('close')}
                    className="whitespace-nowrap rounded-pill bg-primary px-[14px] py-2 text-[12px] font-semibold leading-4 text-on-primary disabled:opacity-50"
                  >
                    Mark resolved
                  </button>
                )}
                {!d.recoverable && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run('notify')}
                    className="whitespace-nowrap rounded-pill border border-border bg-surface px-[14px] py-2 text-[12px] font-semibold leading-4 text-ink disabled:opacity-50"
                  >
                    Notify store managers
                  </button>
                )}
                <button
                  type="button"
                  onClick={onAcknowledged}
                  className="whitespace-nowrap rounded-pill border border-border bg-surface px-[14px] py-2 text-[12px] font-semibold leading-4 text-ink"
                >
                  Acknowledge
                </button>
              </div>
            </Section>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-[14px] xl:w-[300px]">
          <section className="flex shrink-0 flex-col gap-[10px] rounded-[20px] bg-bg p-4">
            <h3 className="text-[15px] font-semibold leading-[21px] text-ink">Details</h3>
            {(
              [
                ['Vehicle', d.details.vehicle],
                ['Trip', d.details.trip],
                ['Goods on board', d.details.goods],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-center gap-2 text-[13px] leading-[18px]">
                <p className="min-w-px flex-1 text-muted">{label}</p>
                <p className="whitespace-nowrap font-semibold text-ink">{value}</p>
              </div>
            ))}
            {d.details.driver && (
              <div className="flex items-center gap-[10px]">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sand text-[12px] font-bold leading-[17px] text-primary">
                  {initials(d.details.driver.name)}
                </span>
                <div className="flex min-w-px flex-1 flex-col whitespace-nowrap">
                  <p className="text-[13px] font-semibold leading-[18px] text-ink">
                    {d.details.driver.name}
                  </p>
                  <p className="text-[12px] leading-[17px] text-muted">
                    Driver{d.details.driver.phone ? ` · ${d.details.driver.phone}` : ''}
                  </p>
                </div>
                {d.details.driver.phone && (
                  <a
                    href={`tel:${d.details.driver.phone}`}
                    aria-label="Call driver"
                    className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-surface text-slate"
                  >
                    <Icon name="phone" size={15} />
                  </a>
                )}
              </div>
            )}
          </section>
          <section className="flex min-h-0 flex-1 flex-col gap-[10px] rounded-[20px] bg-bg p-4">
            <h3 className="text-[15px] font-semibold leading-[21px] text-ink">Timeline</h3>
            {d.timeline.map((t, i) => (
              <div key={`${t.at}-${i}`} className="flex items-start gap-[10px]">
                <span className="flex h-[18px] w-[10px] shrink-0 items-center">
                  <span
                    aria-hidden
                    className={`size-[10px] rounded-full ${dotOf(t.text, i === 0)}`}
                  />
                </span>
                <div className="flex min-w-px flex-1 flex-col text-[12px] leading-[17px]">
                  <p className="font-bold text-ink">{time(t.at)}</p>
                  <p className="text-muted">{t.text}</p>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </section>
  );
}
