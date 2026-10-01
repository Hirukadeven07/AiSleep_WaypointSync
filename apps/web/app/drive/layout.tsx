import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DriverShell } from '@/components/drive/DriverShell';

// Kept as a thin server layout so it can export metadata; all behaviour is in the client shell.
export const metadata: Metadata = {
  title: 'Waypoint Sync Driver',
  manifest: '/manifest.json',
  icons: { apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: 'Sync Driver', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#1B2A41',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function DriveLayout({ children }: { children: ReactNode }) {
  return <DriverShell>{children}</DriverShell>;
}
