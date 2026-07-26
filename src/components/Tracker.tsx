'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { track } from '@/lib/track';

/** Auto page-view tracking on every route change. Mounted once in the layout. */
export function Tracker() {
  const pathname = usePathname();
  useEffect(() => {
    // normalize noisy dynamic segments so screens group cleanly
    const screen = pathname
      .replace(/^\/lobby\/[A-Z0-9]+/, '/lobby/[code]')
      .replace(/^\/read\/[a-z0-9]+/i, '/read/[id]');
    track('page_view', { screen });
  }, [pathname]);
  return null;
}
