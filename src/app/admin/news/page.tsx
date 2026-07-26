'use client';

import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';

type Provider = {
  id: string;
  name: string;
  feedUrl: string | null;
  apiToken: string | null;
  language: string;
  featured: boolean;
  featuredUntil: string | null;
  active: boolean;
  _count: { items: number };
};

/**
 * Admin: manage news providers. "Featured" is the paid placement you sell —
 * set the window in days when you activate it. Each provider gets an API
 * token for the push integration; manual entry covers outlets without one.
 */
export default function AdminNewsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [name, setName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [msg, setMsg] = useState('');
  const [showToken, setShowToken] = useState<string | null>(null);
  const [featuredDays, setFeaturedDays] = useState('30');
  // manual headline form
  const [mProvider, setMProvider] = useState('');
  const [mTitle, setMTitle] = useState('');
  const [mUrl, setMUrl] = useState('');

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
    setMsg('Added — the API token below goes to the outlet for their integration.');
    setName('');
    setFeedUrl('');
    load();
  }

  async function toggleFeatured(p: Provider) {
    await fetch('/api/admin/news-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: p.id,
        featured: !p.featured,
        featuredDays: Number(featuredDays) || 30,
      }),
    });
    load();
  }

  async function toggleActive(p: Provider) {
    await fetch('/api/admin/news-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: p.id, active: !p.active }),
    });
    load();
  }

  async function addHeadline(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/admin/news-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: mProvider, title: mTitle, url: mUrl }),
    });
    const d = await res.json();
    setMsg(res.ok ? 'Headline published.' : d.error ?? 'Failed.');
    if (res.ok) {
      setMTitle('');
      setMUrl('');
      load();
    }
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
        <input className="input" placeholder="RSS feed URL (optional fallback)" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} />
        <select className="input appearance-none" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en">English</option>
          <option value="dv">Dhivehi (RTL)</option>
        </select>
        <button className="btn-primary h-11 text-sm">Add provider</button>
      </form>

      <form onSubmit={addHeadline} className="card mt-3 flex flex-col gap-3 p-4">
        <p className="text-sm font-bold">Publish a headline manually</p>
        <select className="input appearance-none" value={mProvider} onChange={(e) => setMProvider(e.target.value)}>
          <option value="">Pick a provider…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input className="input" placeholder="Headline" value={mTitle} onChange={(e) => setMTitle(e.target.value)} />
        <input className="input" placeholder="Link to the article (https://…)" value={mUrl} onChange={(e) => setMUrl(e.target.value)} />
        <button className="btn-ghost h-11 text-sm" disabled={!mProvider || !mTitle || !mUrl}>
          Publish headline
        </button>
      </form>

      <div className="mt-3 flex items-center gap-2">
        <button onClick={refresh} className="btn-ghost h-11 flex-1 text-sm">
          Refresh feeds now
        </button>
        <label className="text-xs text-ink-400">
          Featured days
          <input
            className="input mt-1 h-9 w-20 text-sm"
            inputMode="numeric"
            value={featuredDays}
            onChange={(e) => setFeaturedDays(e.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>
      {msg && <p className="mt-2 text-xs text-perx-light">{msg}</p>}

      <ul className="mt-4 flex flex-col gap-2">
        {providers.map((p) => (
          <li key={p.id} className="card p-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="font-bold">
                  {p.name}{' '}
                  <span className="font-normal text-ink-500">· {p._count.items} headlines · {p.language}</span>
                </p>
                {p.featured && (
                  <p className="text-xs text-perx-light">
                    ★ Featured{p.featuredUntil ? ` until ${new Date(p.featuredUntil).toLocaleDateString()}` : ' (open-ended)'}
                  </p>
                )}
              </div>
              <button
                onClick={() => toggleFeatured(p)}
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.featured ? 'bg-perx text-ink-950' : 'bg-white/10 text-ink-400'}`}
              >
                ★
              </button>
              <button
                onClick={() => toggleActive(p)}
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.active ? 'bg-white/15' : 'bg-danger/30'}`}
              >
                {p.active ? 'On' : 'Off'}
              </button>
            </div>
            <button
              onClick={() => setShowToken(showToken === p.id ? null : p.id)}
              className="mt-2 w-full truncate rounded-md bg-white/5 px-2 py-1.5 text-left font-mono text-[11px] text-ink-400"
            >
              {showToken === p.id ? `API token: ${p.apiToken ?? '—'}` : 'API token (tap to reveal) — for the outlet’s push integration'}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
