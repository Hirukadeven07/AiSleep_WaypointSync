'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StoreNotice } from '@waypoint/contracts';

/** The kinds of notice a store gets from dispatch. Read from the title: notices carry no kind. */
export type NoticeKind = 'moved' | 'late' | 'confirmed' | 'truck';

export const NOTICE_KINDS: { kind: NoticeKind; label: string; hint: string }[] = [
  { kind: 'moved', label: 'Delivery moved', hint: 'Your order was moved to a later day' },
  { kind: 'late', label: 'Running late', hint: 'The truck is delayed' },
  { kind: 'confirmed', label: 'Delivery confirmed', hint: 'The plan with your delivery was sent' },
  { kind: 'truck', label: 'Truck changed', hint: 'Your order is on another truck' },
];

export function noticeKind(title: string): NoticeKind | null {
  if (title.startsWith('Delivery moved')) return 'moved';
  if (title === 'Delivery running late' || title === 'Delivery delayed') return 'late';
  if (title.startsWith('Delivery confirmed')) return 'confirmed';
  if (title === 'Your delivery is on another truck' || title === 'Delivery rescheduled')
    return 'truck';
  return null;
}

export const REMINDER_OPTIONS = [0, 30, 60] as const;

/** Kept on this phone only. A muted kind still shows under Updates; it just does not alert or count. */
export interface StoreSettings {
  alerts: boolean;
  sound: boolean;
  /** Minutes before the order cutoff to remind the manager; 0 is off. */
  cutoffReminderMin: (typeof REMINDER_OPTIONS)[number];
  muted: NoticeKind[];
}

export const DEFAULT_SETTINGS: StoreSettings = {
  alerts: true,
  sound: true,
  cutoffReminderMin: 30,
  muted: [],
};

const KEY = 'ws_store_settings';
const CHANGED = 'ws:store-settings';

/** Fired when notices or orders change on one store screen, so the shell refreshes its counts. */
export const STORE_REFRESH = 'ws:store-refresh';
export const requestStoreRefresh = () => window.dispatchEvent(new Event(STORE_REFRESH));

export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage is unavailable (private mode); the setting just does not stick
  }
}

function readSettings(): StoreSettings {
  const raw = readLocal(KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<StoreSettings>;
    const kinds = NOTICE_KINDS.map((k) => k.kind);
    return {
      alerts: typeof v.alerts === 'boolean' ? v.alerts : DEFAULT_SETTINGS.alerts,
      sound: typeof v.sound === 'boolean' ? v.sound : DEFAULT_SETTINGS.sound,
      cutoffReminderMin: REMINDER_OPTIONS.includes(v.cutoffReminderMin as 0)
        ? (v.cutoffReminderMin as StoreSettings['cutoffReminderMin'])
        : DEFAULT_SETTINGS.cutoffReminderMin,
      muted: Array.isArray(v.muted) ? v.muted.filter((k) => kinds.includes(k)) : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** The store manager's settings on this phone, shared by every screen that reads them. */
export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const sync = () => setSettings(readSettings());
    sync();
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = useCallback((patch: Partial<StoreSettings>) => {
    writeLocal(KEY, JSON.stringify({ ...readSettings(), ...patch }));
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return [settings, update] as const;
}

export function isMuted(notice: Pick<StoreNotice, 'title'>, settings: StoreSettings) {
  const kind = noticeKind(notice.title);
  return kind !== null && settings.muted.includes(kind);
}

/** A short two-note chime. Browsers may keep it silent until the page has been tapped once. */
export function playChime() {
  try {
    if (typeof window.AudioContext === 'undefined') return;
    const ctx = new window.AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    [880, 1175].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.16);
      osc.stop(ctx.currentTime + 0.5);
    });
    setTimeout(() => void ctx.close().catch(() => undefined), 800);
  } catch {
    // no audio on this device
  }
}

export type PopupState = 'unsupported' | 'default' | 'granted' | 'denied';

export const popupState = (): PopupState =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

/** A browser notification, only when the manager has allowed them. Works while the app is open. */
export async function showPopup(title: string, body: string) {
  if (popupState() !== 'granted') return;
  try {
    // Android Chrome only shows notifications through a service worker registration.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body });
      return;
    }
  } catch {
    // fall through to the page-level notification
  }
  try {
    new Notification(title, { body });
  } catch {
    // not available on this browser; the in-app alert still shows
  }
}
