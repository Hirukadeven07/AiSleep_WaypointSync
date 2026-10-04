import type { ReactNode } from 'react';
import { ForceLightTheme } from '@/components/landing/ForceLightTheme';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
