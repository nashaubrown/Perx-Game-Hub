'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TopBar } from '@/components/TopBar';

type Book = {
  id: string;
  title: string;
  author: string;
  genre: string;
  format: string;
  coverUrl: string | null;
  curated: boolean;
  percent: number;
};

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [genre, setGenre] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/books')
      .then((r) => r.json())
      .then((d) => setBooks(d.books ?? []))
      .finally(() => setLoading(false));
  }, []);

  const genres = useMemo(() => ['All', ...Array.from(new Set(books.map((b) => b.genre))).sort()], [books]);
  const shown = genre === 'All' ? books : books.filter((b) => b.genre === genre);
  const reading = books.filter((b) => b.percent > 0 && b.percent < 98);

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar title="Books" />
      <p className="text-sm text-ink-400">Read while you wait — 5 pts per 5 minutes, up to 60/day.</p>

      {reading.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Continue reading</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {reading.map((b) => (
              <Link key={b.id} href={`/read/${b.id}`} className="w-24 shrink-0">
                <Cover book={b} />
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-perx" style={{ width: `${b.percent}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {genres.map((g) => (
          <button
            key={g}
            onClick={() => setGenre(g)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors duration-[160ms] ${
              genre === g ? 'bg-perx text-ink-950' : 'bg-white/10 text-ink-400'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="pt-16 text-center text-ink-400 animate-pulse">Loading the shelf…</p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5">
          {shown.map((b) => (
            <Link key={b.id} href={`/read/${b.id}`}>
              <Cover book={b} />
              <p className="mt-1.5 line-clamp-2 text-xs font-bold leading-tight">{b.title}</p>
              <p className="line-clamp-1 text-[11px] text-ink-500">{b.author}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

function Cover({ book }: { book: Book }) {
  return (
    <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-white/10">
      {book.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full items-center justify-center p-2 text-center text-[10px] font-bold text-ink-400">
          {book.title}
        </div>
      )}
      {book.curated && (
        <span className="absolute left-1 top-1 rounded-full bg-perx px-1.5 py-0.5 text-[9px] font-bold text-ink-950">
          Curated
        </span>
      )}
    </div>
  );
}
