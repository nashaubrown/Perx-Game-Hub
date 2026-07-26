'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { useMe } from '@/hooks/useMe';

type Redemption = {
  id: string;
  reward: string;
  venue: string;
  costPoints: number;
  status: string;
  code?: string;
  createdAt: string;
};

export default function ProfilePage() {
  const me = useMe();
  const router = useRouter();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);

  useEffect(() => {
    if (me === null) router.replace('/login');
    if (me) {
      fetch('/api/redemptions')
        .then((r) => r.json())
        .then((d) => setRedemptions(d.redemptions ?? []))
        .catch(() => {});
    }
  }, [me, router]);

  if (!me) return <main className="px-4"><TopBar title="Profile" /><p className="pt-16 text-center text-ink-400 animate-pulse">Loading…</p></main>;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  const stats: [string, string | number][] = [
    ['Points', me.balance],
    ['Games', me.gamesPlayed],
    ['Win rate', `${me.winRate}%`],
    ['Books read', me.booksRead],
    ['Streak', `${me.dailyStreak}🔥`],
  ];

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar title="Profile" />
      <div className="flex items-center gap-4">
        <Avatar name={`@${me.handle}`} size={64} />
        <div>
          <p className="font-display text-xl font-black">@{me.handle}</p>
          <p className="grad-number font-display text-2xl font-black">{me.balance} pts</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {stats.slice(1).map(([label, value]) => (
          <div key={label} className="card p-3 text-center">
            <p className="font-display text-xl font-black">{value}</p>
            <p className="text-xs text-ink-500">{label}</p>
          </div>
        ))}
      </div>

      {(me.pendingCardPoints?.length ?? 0) > 0 && (
        <div className="card mt-5 border-warning/50 p-4">
          <p className="mb-1 text-sm font-bold text-warning">Pending merchant points</p>
          {me.pendingCardPoints!.map((p) => (
            <p key={p.venueId} className="text-sm text-ink-400">
              <span className="font-bold text-white">{p.cardPoints} pts</span> at {p.venue} — any purchase
              there today unlocks them.
            </p>
          ))}
        </div>
      )}

      {(me.role === 'MERCHANT' || me.role === 'ADMIN') && (
        <div className="mt-5 flex flex-col gap-2">
          {me.role === 'ADMIN' && (
            <Link href="/admin" className="btn-ghost">Admin — upload books</Link>
          )}
          <Link href="/merchant" className="btn-ghost">Merchant dashboard</Link>
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Redemption history</h2>
        {redemptions.length === 0 ? (
          <p className="text-sm text-ink-500">
            Nothing redeemed yet — <Link href="/rewards" className="font-bold text-perx-light">browse rewards</Link>.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {redemptions.map((r) => (
              <li key={r.id} className="card flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-bold">{r.reward}</p>
                  <p className="text-xs text-ink-500">{r.venue} · {new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  {r.code ? (
                    <p className="font-mono text-lg font-black text-perx-light">{r.code}</p>
                  ) : (
                    <p className={`text-xs font-bold ${r.status === 'VALIDATED' ? 'text-perx-light' : 'text-ink-500'}`}>
                      {r.status.toLowerCase()}
                    </p>
                  )}
                  <p className="text-xs text-ink-500">−{r.costPoints} pts</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button onClick={logout} className="btn-ghost mt-8">
        Log out
      </button>
    </main>
  );
}
