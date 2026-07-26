'use client';

import { useEffect, useMemo, useState } from 'react';
import { TopBar } from '@/components/TopBar';

type Provider = { id: string; name: string; slug: string; logoUrl: string | null; language: string; featured: boolean };
type Item = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  imageUrl: string | null;
  publishedAt: string;
  provider: { id: string; name: string; language: string; featured: boolean };
};

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function NewsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/news')
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.providers ?? []);
        setItems(d.items ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.provider.id === filter)),
    [items, filter]
  );
  const featured = filter === 'all' ? shown.filter((i) => i.provider.featured).slice(0, 3) : [];
  const rest = filter === 'all' ? shown.filter((i) => !featured.includes(i)) : shown;

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar title="Daily news" />
      <p className="text-sm text-ink-400">Headlines from the Maldives while your order's on the way.</p>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilter('all')}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold ${
            filter === 'all' ? 'bg-perx text-ink-950' : 'bg-white/10 text-ink-400'
          }`}
        >
          All
        </button>
        {providers.map((p) => (
          <button
            key={p.id}
            onClick={() => setFilter(p.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold ${
              filter === p.id ? 'bg-perx text-ink-950' : 'bg-white/10 text-ink-400'
            }`}
          >
            {p.name}
            {p.featured && ' ★'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="pt-16 text-center text-ink-400 animate-pulse">Fetching headlines…</p>
      ) : shown.length === 0 ? (
        <p className="pt-16 text-center text-ink-500">
          No headlines yet — feeds refresh hourly, or an admin can trigger a refresh.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {featured.map((item) => (
            <NewsCard key={item.id} item={item} featured />
          ))}
          {rest.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}

function NewsCard({ item, featured }: { item: Item; featured?: boolean }) {
  const rtl = item.provider.language === 'dv'; // Dhivehi (Thaana) reads right-to-left
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`card block p-4 active:bg-white/10 ${featured ? 'border-perx/50' : ''}`}
    >
      <div className="mb-1.5 flex items-center gap-2 text-xs text-ink-500">
        <span className="font-bold text-ink-400">{item.provider.name}</span>
        <span>· {timeAgo(item.publishedAt)}</span>
        {featured && (
          <span className="ml-auto rounded-full bg-perx/20 px-2 py-0.5 font-bold text-perx-light">Featured</span>
        )}
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <p className="font-bold leading-snug" dir={rtl ? 'rtl' : 'ltr'}>
            {item.title}
          </p>
          {item.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-ink-400" dir={rtl ? 'rtl' : 'ltr'}>
              {item.summary}
            </p>
          )}
        </div>
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" loading="lazy" />
        )}
      </div>
    </a>
  );
}
