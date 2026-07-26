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
let inFlight = false;

function flush(unloading = false) {
  if (queue.length === 0) return;
  try {
    if (unloading && navigator.sendBeacon) {
      // plain-string beacon (text/plain) — the Blob/application-json variant
      // is unreliable during page unload in Chromium; the server parses the
      // JSON body regardless of content type
      const events = queue.splice(0, 20);
      const ok = navigator.sendBeacon('/api/track', JSON.stringify({ events }));
      if (!ok) queue.unshift(...events); // beacon queue full — retry next flush
      return;
    }
    if (inFlight) return;
    // keep events in the queue until the POST actually succeeds — a fetch
    // aborted by navigation then gets retried by the pagehide beacon instead
    // of being silently lost
    const events = queue.slice(0, 20);
    inFlight = true;
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    })
      .then((res) => {
        if (res.ok) queue.splice(0, events.length);
      })
      .catch(() => {})
      .finally(() => {
        inFlight = false;
      });
  } catch {
    // drop silently
  }
}

function armLifecycleFlush() {
  // pagehide covers full navigations; visibilitychange covers tab switches
  // and phone locks — cafes are all three, so listen to both
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}

export function track(type: string, meta?: Record<string, unknown>, venueId?: string) {
  if (typeof window === 'undefined') return;
  queue.push({ type, path: window.location.pathname, meta, venueId });
  if (!listenerArmed) {
    listenerArmed = true;
    armLifecycleFlush();
  }
  if (queue.length >= 10) {
    flush();
  } else if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, 1500);
  }
}
