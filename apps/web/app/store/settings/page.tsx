'use client';

import { useEffect, useState } from 'react';
import { PageTitle } from '@/components/store/parts';
import {
  NOTICE_KINDS,
  REMINDER_OPTIONS,
  playChime,
  popupState,
  showPopup,
  useStoreSettings,
  type PopupState,
} from '@/components/store/settings';

const POPUP_TEXT: Record<PopupState, string> = {
  granted: 'Pop-ups are allowed on this phone.',
  default: 'Allow pop-ups to also get a notification outside the app.',
  denied: 'Pop-ups are blocked in the browser settings. Alerts still show inside the app.',
  unsupported: 'This browser has no pop-up notifications. Alerts still show inside the app.',
};

/** Store settings: alerts for new updates and the order cutoff reminder. Kept on this phone. */
export default function StoreSettingsPage() {
  const [settings, update] = useStoreSettings();
  const [popup, setPopup] = useState<PopupState>('unsupported');
  useEffect(() => setPopup(popupState()), []);

  async function allowPopups() {
    if (popupState() !== 'default') return;
    try {
      await Notification.requestPermission();
    } catch {
      // the browser refused to ask
    }
    setPopup(popupState());
  }

  return (
    <section className="space-y-md">
      <PageTitle eyebrow="Settings" title="Notifications" />

      <div className="space-y-md rounded-card bg-surface p-lg">
        <Toggle
          label="Alert me about new updates"
          hint="A message on screen when dispatch sends something."
          checked={settings.alerts}
          onChange={(alerts) => {
            update({ alerts });
            if (alerts) void allowPopups();
          }}
        />
        <Toggle
          label="Play a sound"
          hint="A short chime with each alert."
          checked={settings.sound}
          disabled={!settings.alerts}
          onChange={(sound) => update({ sound })}
        />
        <p className="text-caption text-muted">{POPUP_TEXT[popup]}</p>
        <div className="flex flex-wrap gap-sm">
          {popup === 'default' && (
            <button
              type="button"
              onClick={allowPopups}
              className="min-h-[36px] rounded-pill border border-mist px-md text-label text-ink"
            >
              Allow pop-ups
            </button>
          )}
          <button
            type="button"
            disabled={!settings.alerts}
            onClick={() => {
              if (settings.sound) playChime();
              void showPopup('Sync Store', 'This is how an alert looks.');
            }}
            className="min-h-[36px] rounded-pill border border-mist px-md text-label text-ink disabled:opacity-40"
          >
            Test alert
          </button>
        </div>
      </div>

      <div className="space-y-sm rounded-card bg-surface p-lg">
        <p className="text-title text-ink">Order cutoff reminder</p>
        <p className="text-label text-muted">
          Reminds you before ordering closes, when nothing is ordered for tomorrow yet.
        </p>
        <div className="flex gap-sm" role="radiogroup" aria-label="Order cutoff reminder">
          {REMINDER_OPTIONS.map((min) => (
            <button
              key={min}
              type="button"
              role="radio"
              aria-checked={settings.cutoffReminderMin === min}
              onClick={() => update({ cutoffReminderMin: min })}
              className={`min-h-[44px] flex-1 rounded-pill text-label font-semibold ${
                settings.cutoffReminderMin === min
                  ? 'bg-primary text-on-primary'
                  : 'border border-mist text-ink'
              }`}
            >
              {min === 0 ? 'Off' : `${min} min before`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-md rounded-card bg-surface p-lg">
        <div>
          <p className="text-title text-ink">Alert me about</p>
          <p className="text-label text-muted">
            A kind you switch off still appears under Updates. It does not alert or add to the
            count.
          </p>
        </div>
        {NOTICE_KINDS.map((k) => (
          <Toggle
            key={k.kind}
            label={k.label}
            hint={k.hint}
            checked={!settings.muted.includes(k.kind)}
            onChange={(on) =>
              update({
                muted: on
                  ? settings.muted.filter((m) => m !== k.kind)
                  : [...settings.muted, k.kind],
              })
            }
          />
        ))}
      </div>

      <p className="text-center text-caption text-muted">
        Saved on this phone. Alerts work while Sync Store is open.
      </p>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-[44px] w-full items-center gap-md text-left disabled:opacity-40"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-ink">{label}</span>
        {hint && <span className="block text-caption text-muted">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ${
          checked ? 'justify-end bg-primary' : 'justify-start bg-mist'
        }`}
      >
        <span className="size-6 rounded-full bg-surface" />
      </span>
    </button>
  );
}
