'use client';

import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';

type Provider = {
  id: string;
  name: string;
  feedUrl: string | null;
  language: string;
  featured: boolean;
  active: boolean;
  _count: { items: number };
};

/** Admin: manage news providers. "Featured" is the paid placement you sell. */
export default function AdminNewsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [name, setName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [msg, setMsg] = useState('');

  const load = () =>
    fetch('/api/admin/news-providers')
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? []));

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/admin/news-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, feedUrl: feedUrl || undefined, language }),
    });
    const d = await res.json();
    if (!res.ok) return setMsg(d.error ?? 'Failed.');
    setMsg(
      d.refresh
        ? d.refresh.error
          ? `Added — feed fetch failed (${d.refresh.error}), will retry hourly.`
          : `Added — pulled ${d.refresh.added} headlines.`
        : 'Added.'
    );
    setName('');
    setFeedUrl('');
    load();
  }

  async function toggle(p: Provider, field: 'featured' | 'active') {
    await fetch('/api/admin/news-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: p.id, [field]: !p[field] }),
    });
    load();
  }

  async function refresh() {
    setMsg('Refreshing feeds…');
    const d = await fetch('/api/admin/news-refresh', { method: 'POST' }).then((r) => r.json());
    setMsg(
      (d.results ?? [])
        .map((r: { provider: string; added: number; error?: string }) =>
          r.error ? `${r.provider}: ${r.error}` : `${r.provider}: +${r.added}`
        )
        .join(' · ') || 'No feeds configured.'
    );
    load();
  }

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar back="/admin" title="News providers" />

      <form onSubmit={add} className="card mt-2 flex flex-col gap-3 p-4">
        <p className="text-sm font-bold">Add a provider</p>
        <input className="input" placeholder="Name (e.g. Mihaaru)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="RSS feed URL (optional)" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} />
        <select className="input appearance-none" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en">English</option>
          <option value="dv">Dhivehi (RTL)</option>
        </select>
        <button className="btn-primary h-11 text-sm">Add provider</button>
      </form>

      <button onClick={refresh} className="btn-ghost mt-3 h-11 text-sm">
        Refresh all feeds now
      </button>
      {msg && <p className="mt-2 text-xs text-perx-light">{msg}</p>}

      <ul className="mt-4 flex flex-col gap-2">
        {providers.map((p) => (
          <li key={p.id} className="card flex items-center gap-3 p-3 text-sm">
            <div className="flex-1">
              <p className="font-bold">
                {p.name} <span className="font-normal text-ink-500">· {p._count.items} headlines · {p.language}</span>
              </p>
              <p className="truncate text-xs text-ink-500">{p.feedUrl ?? 'no feed — manual only'}</p>
            </div>
            <button
              onClick={() => toggle(p, 'featured')}
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.featured ? 'bg-perx text-ink-950' : 'bg-white/10 text-ink-400'}`}
            >
              ★ Featured
            </button>
            <button
              onClick={() => toggle(p, 'active')}
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.active ? 'bg-white/15' : 'bg-danger/30'}`}
            >
              {p.active ? 'On' : 'Off'}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
