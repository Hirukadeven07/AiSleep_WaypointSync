'use client';

import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/lib/theme';

/** Light / dark switch. Lives in every app's account menu; the choice is kept on this device. */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="flex w-full items-center gap-2 rounded-pill border border-mist px-4 py-2 text-label text-ink hover:bg-bg"
    >
      <Icon name={dark ? 'moon' : 'sun'} size={16} />
      <span className="flex-1 text-left">Dark mode</span>
      <span
        aria-hidden
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${dark ? 'bg-primary' : 'bg-mist'}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-all ${dark ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
