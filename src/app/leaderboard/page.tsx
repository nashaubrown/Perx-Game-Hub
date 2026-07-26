'use client';

import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { useMe } from '@/hooks/useMe';

type Entry = { rank: number; handle: string; points: number };

export default function LeaderboardPage() {
  const me = useMe();
  const [period, setPeriod] = useState<'all' | 'weekly'>('weekly');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard?period=${period}`)
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar title="Leaderboard" />
      <div className="flex gap-2">
        {(['weekly', 'all'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors duration-[160ms] ${
              period === p ? 'bg-perx text-ink-950' : 'bg-white/10 text-ink-400'
            }`}
          >
            {p === 'weekly' ? 'This week' : 'All time'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="pt-16 text-center text-ink-400 animate-pulse">Counting points…</p>
      ) : entries.length === 0 ? (
        <p className="pt-16 text-center text-ink-400">No points yet this week — go play something.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {entries.map((e) => (
            <li
              key={e.handle}
              className={`card flex items-center gap-3 p-3 ${me && e.handle === me.handle ? 'border-perx/50' : ''}`}
            >
              <span className="w-8 text-center font-display text-lg font-black text-ink-500">
                {e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}
              </span>
              <Avatar name={`@${e.handle}`} size={36} />
              <span className="flex-1 font-bold">@{e.handle}</span>
              <span className="grad-number-electric font-display text-lg font-black">{e.points}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
