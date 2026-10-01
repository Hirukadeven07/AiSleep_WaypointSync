import type { ReactNode } from 'react';

/** Tailwind width cap for the phone design (the Figma phone frames are 412px wide). */
export const PHONE_MAX = 'max-w-[430px]';

/** Centred phone-width column. Used by screens that have no wider design (store) and by the driver below `lg`. */
export function PhoneColumn({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto flex min-h-dvh w-full ${PHONE_MAX} flex-col ${className}`}>{children}</div>;
}
