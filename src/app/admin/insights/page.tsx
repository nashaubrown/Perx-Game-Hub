'use client';

import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';

type Insights = {
  windowDays: number;
  daily: { day: string; actors: number; events: number }[];
  totals: { uniqueActors: number; events: number; gamesFinished: number; signups: number; sharesSent: number; guestPrompts: number };
  byType: { type: string; count: number }[];
  topScreens: { screen: string; views: number; actors: number }[];
  funnel: { step: string; actors: number }[];
  news: { views: number; clicks: number; ctr: number; byProvider: { provider: string; clicks: number }[] };
  gamesByType: { gameId: string; count: number }[];
};

const TYPE_LABELS: Record<string, string> = {
  page_view: 'Screen views',
  game_host_tap: 'Host taps',
  game_join_tap: 'Join taps',
  share_invite: 'Invites shared',
  news_click: 'News clicks',
  book_open: 'Books opened',
  reward_view: 'Rewards viewed',
  redeem_tap: 'Redeem taps',
  signup_prompt_shown: 'Guest signup prompts',
  install_prompt: 'Install prompts',
};

export default function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [days, setDays] = useState(30);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/insights?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setDenied(true));
  }, [days]);

  if (denied) {
    return (
      <main className="px-4 animate-fade-up">
        <TopBar back="/" title="Insights" />
        <p className="mt-8 text-center text-ink-400">Admins only — log in as @admin.</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="px-4">
        <TopBar back="/admin" title="Insights" />
        <p className="pt-16 text-center text-ink-400 animate-pulse">Crunching interactions…</p>
      </main>
    );
  }

  const maxDay = Math.max(1, ...data.daily.map((d) => d.actors));
  const maxFunnel = Math.max(1, ...data.funnel.map((f) => f.actors));

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar back="/admin" title="Interaction insights" />

      <div className="mb-4 flex gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${days === d ? 'bg-perx text-ink-950' : 'bg-white/10 text-ink-400'}`}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ['Unique visitors', data.totals.uniqueActors, 'grad-number-electric'],
            ['Interactions', data.totals.events, 'grad-number'],
            ['Games finished', data.totals.gamesFinished, 'grad-number'],
            ['New signups', data.totals.signups, 'grad-number-electric'],
          ] as const
        ).map(([label, value, cls]) => (
          <div key={label} className="card p-4">
            <p className={`font-display text-3xl font-black ${cls}`}>{value}</p>
            <p className="text-xs text-ink-500">{label} · {data.windowDays}d</p>
          </div>
        ))}
      </div>

      <div className="card mt-4 p-4">
        <p className="mb-3 text-sm font-bold">Daily active visitors</p>
        {data.daily.length === 0 ? (
          <p className="text-sm text-ink-500">No interactions recorded yet.</p>
        ) : (
          <div className="flex h-24 items-end gap-0.5">
            {data.daily.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.actors} visitors, ${d.events} events`}
                className="flex-1 rounded-t-sm bg-perx"
                style={{ height: `${(d.actors / maxDay) * 100}%`, minHeight: 2 }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card mt-4 p-4">
        <p className="mb-3 text-sm font-bold">Funnel <span className="font-normal text-ink-500">· open → play → sign up</span></p>
        <div className="flex flex-col gap-2">
          {data.funnel.map((f, i) => (
            <div key={f.step}>
              <div className="mb-0.5 flex justify-between text-xs">
                <span>{f.step}</span>
                <span className="font-mono font-bold">
                  {f.actors}
                  {i > 0 && data.funnel[0].actors > 0 && (
                    <span className="text-ink-500"> · {Math.round((f.actors / data.funnel[0].actors) * 100)}%</span>
                  )}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-grad-electric" style={{ width: `${(f.actors / maxFunnel) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-500">
          {data.totals.guestPrompts} guest signup prompts shown · {data.totals.sharesSent} invites shared
        </p>
      </div>

      <div className="card mt-4 p-4">
        <p className="mb-2 text-sm font-bold">Interactions by type</p>
        {data.byType.map((t) => (
          <div key={t.type} className="flex justify-between py-0.5 text-sm">
            <span>{TYPE_LABELS[t.type] ?? t.type}</span>
            <span className="font-mono font-bold">{t.count}</span>
          </div>
        ))}
      </div>

      <div className="card mt-4 p-4">
        <p className="mb-2 text-sm font-bold">Top screens</p>
        {data.topScreens.map((s) => (
          <div key={s.screen} className="flex justify-between py-0.5 text-sm">
            <span className="truncate">{s.screen}</span>
            <span className="ml-2 shrink-0 font-mono text-ink-400">
              {s.views} <span className="text-ink-600">· {s.actors} ppl</span>
            </span>
          </div>
        ))}
      </div>

      <div className="card mt-4 p-4">
        <p className="mb-2 text-sm font-bold">
          News engagement <span className="font-normal text-ink-500">· what you show featured partners</span>
        </p>
        <p className="text-sm">
          {data.news.views} tab views → {data.news.clicks} article clicks ·{' '}
          <span className="font-display font-black text-perx-light">{data.news.ctr}% CTR</span>
        </p>
        {data.news.byProvider.map((p) => (
          <div key={p.provider} className="flex justify-between py-0.5 text-sm text-ink-400">
            <span>{p.provider}</span>
            <span className="font-mono">{p.clicks} clicks</span>
          </div>
        ))}
      </div>

      <div className="card mt-4 mb-4 p-4">
        <p className="mb-2 text-sm font-bold">Games finished by type</p>
        {data.gamesByType.map((g) => (
          <div key={g.gameId} className="flex justify-between py-0.5 text-sm">
            <span className="capitalize">{g.gameId}</span>
            <span className="font-mono font-bold">{g.count}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
