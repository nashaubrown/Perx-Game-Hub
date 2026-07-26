'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Theme = 'dark' | 'light' | 'sepia';
type Bookmark = { id: string; location: string; label: string };

const THEME_STYLES: Record<Theme, { body: Record<string, string>; bg: string }> = {
  dark: { body: { color: '#E5E7EB', background: '#0A0A0A' }, bg: '#0A0A0A' },
  light: { body: { color: '#1A1A1A', background: '#FFFFFF' }, bg: '#FFFFFF' },
  sepia: { body: { color: '#433422', background: '#F4ECD8' }, bg: '#F4ECD8' },
};

/**
 * EPUB reader (epub.js). Remembers exact position (CFI) per user per book,
 * bookmarks, font size, and light/dark/sepia themes. A once-a-minute
 * heartbeat feeds server-side reading points (capped per day).
 */
export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const bookRef = useRef<any>(null);
  const locationRef = useRef<string | null>(null);
  const percentRef = useRef(0);

  const [isPdf, setIsPdf] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const [showUI, setShowUI] = useState(true);
  const [theme, setTheme] = useState<Theme>('dark');
  const [fontSize, setFontSize] = useState(100);
  const [percent, setPercent] = useState(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [toast, setToast] = useState('');

  // save position (debounced by relocation events being sparse)
  function saveProgress(tick = false) {
    fetch(`/api/books/${id}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: locationRef.current, percent: percentRef.current, tick }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.pointsAwarded > 0) {
          setToast(`+${d.pointsAwarded} pts for reading`);
          setTimeout(() => setToast(''), 2500);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    let heartbeat: NodeJS.Timeout | null = null;

    async function init() {
      const progressRes = await fetch(`/api/books/${id}/progress`).then((r) => r.json());
      if (cancelled) return;
      setBookmarks(progressRes.bookmarks ?? []);
      const savedLocation: string | undefined = progressRes.progress?.location ?? undefined;

      // probe the file — PDF gets the native viewer
      const head = await fetch(`/api/books/${id}/file`, { method: 'GET', headers: { Range: 'bytes=0-3' } });
      if (!head.ok) {
        const err = await head.json().catch(() => null);
        setFailed(err?.error ?? 'Could not open this book.');
        return;
      }
      if (head.headers.get('content-type')?.includes('pdf')) {
        setIsPdf(true);
        setReady(true);
        return;
      }

      const ePub = (await import('epubjs')).default;
      const book = ePub(`/api/books/${id}/file`);
      bookRef.current = book;
      const rendition = book.renderTo(viewerRef.current!, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        allowScriptedContent: false,
      });
      renditionRef.current = rendition;

      for (const [name, styles] of Object.entries(THEME_STYLES)) {
        rendition.themes.register(name, { body: styles.body, p: { 'line-height': '1.6' } });
      }
      rendition.themes.select('dark');

      rendition.on('relocated', (location: any) => {
        locationRef.current = location.start.cfi;
        if (book.locations.length()) {
          const p = Math.round((book.locations.percentageFromCfi(location.start.cfi) ?? 0) * 100);
          percentRef.current = p;
          setPercent(p);
        }
        saveProgress(false);
      });

      // tap left/right thirds to page, middle toggles the chrome
      rendition.on('click', (e: MouseEvent) => {
        const x = e.clientX;
        const w = window.innerWidth;
        if (x < w / 3) rendition.prev();
        else if (x > (2 * w) / 3) rendition.next();
        else setShowUI((s) => !s);
      });

      await rendition.display(savedLocation);
      book.ready.then(() => book.locations.generate(1200)).catch(() => {});
      if (!cancelled) setReady(true);

      // reading minutes count only while the tab is visible
      heartbeat = setInterval(() => {
        if (document.visibilityState === 'visible') saveProgress(true);
      }, 60000);
    }

    init().catch(() => setFailed('Could not open this book.'));
    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      renditionRef.current?.destroy?.();
      bookRef.current?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    renditionRef.current?.themes.select(theme);
  }, [theme, ready]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}%`);
  }, [fontSize, ready]);

  async function addBookmark() {
    if (!locationRef.current) return;
    const res = await fetch(`/api/books/${id}/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: locationRef.current, label: `${percentRef.current}% in` }),
    });
    const data = await res.json();
    if (res.ok) {
      setBookmarks((b) => [data.bookmark, ...b]);
      setToast('Bookmarked');
      setTimeout(() => setToast(''), 1500);
    } else {
      setToast(data.error ?? 'Log in to bookmark');
      setTimeout(() => setToast(''), 2000);
    }
  }

  if (failed) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-3xl">📕</p>
        <p className="font-bold">{failed}</p>
        <Link href="/books" className="btn-ghost max-w-44">Back to books</Link>
      </main>
    );
  }

  if (isPdf) {
    return (
      <main className="flex h-dvh flex-col">
        <div className="flex h-12 items-center justify-between bg-ink-950 px-4">
          <Link href="/books" className="text-sm font-bold text-perx-light">← Books</Link>
        </div>
        <iframe src={`/api/books/${id}/file`} className="w-full flex-1 bg-white" title="PDF reader" />
      </main>
    );
  }

  return (
    <main className="fixed inset-0" style={{ background: THEME_STYLES[theme].bg }}>
      {!ready && (
        <p className="absolute inset-0 flex items-center justify-center text-ink-400 animate-pulse">
          Opening your book…
        </p>
      )}
      <div ref={viewerRef} className="h-full w-full" />

      {toast && (
        <div className="absolute left-1/2 top-14 z-30 -translate-x-1/2 rounded-full bg-perx px-4 py-1.5 text-sm font-bold text-ink-950 animate-pop">
          {toast}
        </div>
      )}

      {showUI && (
        <>
          <div className="absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between bg-ink-950/90 px-4 backdrop-blur-sm animate-fade-up">
            <Link href="/books" className="text-sm font-bold text-perx-light">← Books</Link>
            <span className="text-xs text-ink-400">{percent}%</span>
            <div className="flex items-center gap-3">
              <button onClick={addBookmark} className="text-lg" aria-label="Add bookmark">🔖</button>
              <button onClick={() => setShowBookmarks((s) => !s)} className="text-sm font-bold text-ink-400">
                {bookmarks.length}
              </button>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-ink-950/90 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur-sm animate-fade-up">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {(['dark', 'light', 'sepia'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    aria-label={`${t} theme`}
                    className={`h-8 w-8 rounded-full border-2 ${theme === t ? 'border-perx' : 'border-white/20'}`}
                    style={{ background: THEME_STYLES[t].bg }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setFontSize((f) => Math.max(70, f - 10))} className="h-9 w-9 rounded-md bg-white/10 text-sm font-bold text-white">A−</button>
                <button onClick={() => setFontSize((f) => Math.min(160, f + 10))} className="h-9 w-9 rounded-md bg-white/10 text-lg font-bold text-white">A+</button>
              </div>
            </div>
            <p className="text-center text-[11px] text-ink-500">Tap the sides to turn pages · middle to hide controls</p>
          </div>

          {showBookmarks && (
            <div className="absolute right-3 top-14 z-30 w-56 rounded-lg border border-white/10 bg-ink-950 p-2 shadow-dark-lift">
              <p className="px-2 py-1 text-xs font-bold text-ink-500">Bookmarks</p>
              {bookmarks.length === 0 && <p className="px-2 pb-2 text-xs text-ink-500">None yet — tap 🔖</p>}
              {bookmarks.map((b) => (
                <div key={b.id} className="flex items-center">
                  <button
                    className="flex-1 rounded-md px-2 py-2 text-left text-sm text-white active:bg-white/10"
                    onClick={() => {
                      renditionRef.current?.display(b.location);
                      setShowBookmarks(false);
                    }}
                  >
                    {b.label}
                  </button>
                  <button
                    className="px-2 text-ink-500"
                    aria-label="Delete bookmark"
                    onClick={async () => {
                      await fetch(`/api/books/${id}/bookmarks?bookmarkId=${b.id}`, { method: 'DELETE' });
                      setBookmarks((cur) => cur.filter((x) => x.id !== b.id));
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
