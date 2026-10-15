'use client';

import { useCallback, useState } from 'react';
import { playChime, showPopup } from '@/components/store/settings';
import { Toast } from '@/components/ui/Toast';
import { useLiveNotices } from '@/lib/live-notices';

/**
 * Sound, a browser notification and a toast the moment a notice arrives.
 * Mount once in a role's shell so every screen of that role hears it.
 */
export function LiveNoticeAlerts({
  enabled = true,
  onNotice,
}: {
  enabled?: boolean;
  onNotice?: () => void;
}) {
  const [toast, setToast] = useState<string>();
  const clear = useCallback(() => setToast(undefined), []);

  useLiveNotices(enabled, (notice) => {
    setToast(notice.title);
    playChime();
    void showPopup(notice.title, notice.body);
    onNotice?.();
  });

  return toast ? <Toast message={toast} onClose={clear} durationMs={6000} /> : null;
}
