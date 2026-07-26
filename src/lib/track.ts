'use client';

/**
 * Client-side tracker. Queues events and flushes in small batches — on a
 * short timer, and via sendBeacon when the tab hides (phones lock a lot in
 * cafes). Never throws; losing an analytics event must never hurt UX.
 *
 *   import { track } from '@/lib/track';
 *   track('news_click', { provider: 'Mihaaru' });
 */

type TrackedEvent = { type: string; path?: string; venueId?: string; meta?: Record<string, unknown> };

let queue: TrackedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenerArmed = false;

function flush(useBeacon = false) {
  if (queue.length === 0) return;
  const events = queue.splice(0, 20);
  const body = JSON.stringify({ events });
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // drop silently
  }
}

export function track(type: string, meta?: Record<string, unknown>, venueId?: string) {
  if (typeof window === 'undefined') return;
  queue.push({ type, path: window.location.pathname, meta, venueId });
  if (!listenerArmed) {
    listenerArmed = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush(true);
    });
  }
  if (queue.length >= 10) {
    flush();
  } else if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, 3000);
  }
}
