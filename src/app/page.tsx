'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useMe } from '@/hooks/useMe';

type Game = { id: string; name: string; tagline: string; multi: boolean };

const SOLO_ICONS: Record<string, string> = { memory: '🃏', '2048': '🔢', daily: '📅', pacman: '🟡' };

export default function HomePage() {
  const me = useMe();
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    fetch('/api/games')
      .then((r) => r.json())
      .then((d) => setGames(d.games ?? []))
      .catch(() => {});
  }, []);

  const solo = games.filter((g) => !g.multi);

  return (
    <main className="safe-bottom flex flex-col gap-6 px-4 pt-8 animate-fade-up">
      <div className="flex items-center justify-between">
        <Image src="/brand/wordmark-white.svg" alt="PERX" width={88} height={24} priority />
        {me === null && (
          <Link href="/login" className="text-sm font-bold text-perx-light">
            Log in
          </Link>
        )}
        {me && (
          <Link href="/profile" className="text-sm font-medium text-ink-400">
            @{me.handle} · <span className="font-bold text-perx-light">{me.balance} pts</span>
          </Link>
        )}
      </div>

      <div>
        <h1 className="font-display text-3xl font-black leading-tight">
          Play at the table.
          <br />
          Earn points while you wait.
        </h1>
        <p className="mt-2 text-ink-400">
          Host a game, friends join with a 6-letter code. Winner takes 50 points.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link href="/host" className="btn-primary text-base">
          Host a game
        </Link>
        <Link href="/join" className="btn-ghost text-base">
          Join with a code
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Playing solo?</h2>
        <div className="grid grid-cols-2 gap-3">
          {(solo.length
            ? solo
            : [
                { id: 'memory', name: 'Memory Match', tagline: '' },
                { id: '2048', name: '2048', tagline: '' },
                { id: 'daily', name: 'Daily Word', tagline: '' },
                { id: 'pacman', name: 'Pac-Man', tagline: '' },
              ]
          ).map((g) => (
            <Link
              key={g.id}
              href={`/solo/${g.id}`}
              className="card flex flex-col items-center gap-2 p-4 text-center active:bg-white/10"
            >
              <span className="text-2xl">{SOLO_ICONS[g.id] ?? '🎮'}</span>
              <span className="text-xs font-bold">{g.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card flex items-center gap-4 p-4">
        <span className="text-3xl">📚</span>
        <div className="flex-1">
          <p className="font-bold">Read while you wait</p>
          <p className="text-sm text-ink-400">50+ classics, free. Reading earns points too.</p>
        </div>
        <Link href="/books" className="rounded-full bg-perx px-4 py-2 text-sm font-bold text-ink-950">
          Browse
        </Link>
      </section>
    </main>
  );
}
