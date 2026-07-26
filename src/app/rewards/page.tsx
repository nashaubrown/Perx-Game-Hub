'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { Countdown } from '@/components/game/Countdown';
import { track } from '@/lib/track';

type Reward = { id: string; name: string; description: string | null; costPoints: number };
type VenueRewards = { id: string; name: string; location: string | null; rewards: Reward[] };
type ActiveCode = { code: string; reward: string; venue: string; expiresAt: string };

export default function RewardsPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [venues, setVenues] = useState<VenueRewards[]>([]);
  const [active, setActive] = useState<ActiveCode | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/rewards')
      .then((r) => r.json())
      .then((d) => {
        setBalance(d.balance);
        setVenues(d.venues ?? []);
      })
      .catch(() => {});
  }, []);

  async function redeem(reward: Reward, venueId?: string) {
    setError('');
    track('redeem_tap', { reward: reward.name, cost: reward.costPoints }, venueId);
    const res = await fetch(`/api/rewards/${reward.id}/redeem`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Could not redeem.');
    setActive({ code: data.code, reward: data.reward.name, venue: data.reward.venue, expiresAt: data.expiresAt });
  }

  if (active) {
    return (
      <main className="safe-bottom px-4 animate-fade-up">
        <TopBar back="/rewards" title="Show this to staff" />
        <div className="card mt-8 flex flex-col items-center gap-4 border-perx/40 p-8 text-center animate-pop">
          <p className="text-sm text-ink-400">{active.reward} · {active.venue}</p>
          <p className="font-mono text-5xl font-black tracking-[0.2em] text-perx-light">{active.code}</p>
          <p className="text-sm text-ink-400">
            Staff enters this code to confirm. Expires in{' '}
            <Countdown endsAt={new Date(active.expiresAt).getTime()} />
          </p>
          <button onClick={() => setActive(null)} className="btn-ghost">Done</button>
        </div>
      </main>
    );
  }

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar title="Rewards" />
      {balance === null ? (
        <p className="text-sm text-ink-400">
          <Link href="/login" className="font-bold text-perx-light">Log in</Link> to spend your points on real
          things at the counter.
        </p>
      ) : (
        <p className="text-sm text-ink-400">
          You have <span className="grad-number font-display text-lg font-black">{balance}</span> points to spend.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {venues.map((v) => (
        <section key={v.id} className="mt-6">
          <h2 className="mb-2 font-bold">
            {v.name} <span className="text-sm font-normal text-ink-500">{v.location}</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {v.rewards.map((r) => (
              <li key={r.id} className="card flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-bold">{r.name}</p>
                  {r.description && <p className="text-sm text-ink-400">{r.description}</p>}
                </div>
                <button
                  onClick={() => redeem(r, v.id)}
                  disabled={balance === null || balance < r.costPoints}
                  className="rounded-full bg-perx px-4 py-2 text-sm font-bold text-ink-950 disabled:bg-white/10 disabled:text-ink-500"
                >
                  {r.costPoints} pts
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
