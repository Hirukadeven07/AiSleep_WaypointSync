import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import { BACK_CACHE_GUARD_SCRIPT } from '@/lib/page-guard';
import { THEME_BOOT_SCRIPT } from '@/lib/theme-boot';
import './globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], axes: ['opsz'], variable: '--font-dm-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Waypoint Sync',
  description: 'Delivery planning for dispatchers, loaders, drivers and store managers.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f4f6f8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets data-theme before React loads, so the attribute differs from the server's.
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: BACK_CACHE_GUARD_SCRIPT }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
