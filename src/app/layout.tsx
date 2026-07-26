import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';
import { RegisterSW } from '@/components/RegisterSW';
import { Tracker } from '@/components/Tracker';

export const metadata: Metadata = {
  title: 'Perx Play',
  description: 'Play together at the table, read while you wait, earn Perx points.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/brand/favicon.svg', apple: '/brand/png/icon-green.png' },
  appleWebApp: { capable: true, title: 'Perx Play', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="aurora" aria-hidden />
        <div className="mx-auto min-h-dvh w-full max-w-md">{children}</div>
        <BottomNav />
        <RegisterSW />
        <Tracker />
      </body>
    </html>
  );
}
