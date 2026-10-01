'use client';

import { Icon } from '@/components/ui/Icon';
import { usePendingCount } from '@/lib/use-pending-count';

/** In-page banner from Figma "Driver / Next stop (offline)". Shown only while there is no signal. */
export function OfflineBanner({ className = '' }: { className?: string }) {
  const pending = usePendingCount();
  const saved =
    pending === 0
      ? 'your actions are saved and will sync.'
      : `${pending} ${pending === 1 ? 'action is' : 'actions are'} saved and will sync.`;

  return (
    <div
      role="status"
      className={`flex items-center gap-[10px] rounded-[18px] bg-banner px-[14px] py-[10px] ${className}`}
    >
      <Icon name="wifi-off" size={16} className="text-slate" />
      <p className="flex-1 text-caption font-semibold leading-4 text-ink">Offline. Keep going, {saved}</p>
    </div>
  );
}
