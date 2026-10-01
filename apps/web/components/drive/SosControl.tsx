'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { PHONE_MAX } from '@/components/shell/PhoneColumn';

/** Fixed SOS button (Figma "Button / SOS"). It opens the full-screen emergency page at /drive/sos and remembers which screen to return to. */
export function SosControl() {
  const pathname = usePathname();
  return (
    <div className={`pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto ${PHONE_MAX} lg:max-w-none`}>
      <Link
        href={`/drive/sos?from=${encodeURIComponent(pathname)}`}
        aria-label="SOS"
        className="pointer-events-auto absolute right-5 top-[calc(3.5rem+env(safe-area-inset-top))] flex min-h-12 items-center gap-2 rounded-pill border-2 border-white bg-danger px-[18px] py-3 text-[16px] font-bold tracking-[0.5px] text-white shadow-[0_4px_14px_0_rgba(196,48,48,0.35)] lg:right-10 lg:top-8"
      >
        <Icon name="alert" size={20} />
        SOS
      </Link>
    </div>
  );
}
