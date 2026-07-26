'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Avatar } from '@/components/Avatar';
import { track } from '@/lib/track';
import type { useLobby } from '@/hooks/useLobby';

export type FinalPayload = {
  standings: { key: string; nickname: string; score: number; rank: number; won: boolean; isGuest: boolean }[];
  pointsPerPlayer: number;
  pointsForWin: number;
  breakdown?: Record<string, { word: string; points: number; unique: boolean }[]>;
  reason?: string;
  draw?: boolean;
  title?: string;
};

const MEDALS = ['🥇', '🥈', '🥉'];

export function FinalView({
  payload,
  lobby,
  isGuest,
}: {
  payload: FinalPayload;
  lobby: ReturnType<typeof useLobby>;
  isGuest: boolean;
}) {
  const me = payload.standings.find((s) => s.key === lobby.you);
  const isHost = lobby.you === lobby.state?.hostKey;
  const myWords = payload.breakdown && lobby.you ? payload.breakdown[lobby.you] : undefined;

  // measure how often guests see the keep-your-points prompt (conversion funnel)
  useEffect(() => {
    if (isGuest) track('signup_prompt_shown', { game: lobby.state?.gameId });
  }, [isGuest, lobby.state?.gameId]);

  return (
    <div className="flex flex-col gap-5 pt-8 animate-fade-up">
      <div className="text-center">
        <p className="text-5xl">{payload.draw ? '🤝' : me?.won ? '🏆' : '🎉'}</p>
        <h2 className="mt-2 font-display text-2xl font-black">
          {payload.title
            ? payload.title
            : payload.draw
              ? "It's a draw"
              : me?.won
                ? 'You won!'
                : `${payload.standings.find((s) => s.won)?.nickname ?? payload.standings[0]?.nickname} wins`}
        </h2>
        {payload.reason && <p className="mt-1 text-sm text-ink-400">{payload.reason}</p>}
        {me && (
          <p className="mt-1 text-ink-400">
            You scored <span className="grad-number font-display text-xl font-black">{me.score}</span> ·{' '}
            +{payload.pointsPerPlayer + (me.won ? payload.pointsForWin : 0)} Perx points
          </p>
        )}
      </div>

      <div className="card p-4">
        <ul className="flex flex-col gap-3">
          {payload.standings.map((s) => (
            <li key={s.key} className={`flex items-center gap-3 ${s.key === lobby.you ? 'font-bold' : ''}`}>
              <span className="w-7 text-lg">{MEDALS[s.rank - 1] ?? s.rank}</span>
              <Avatar name={s.nickname} size={32} />
              <span className="flex-1 truncate">{s.nickname}</span>
              <span className="font-mono font-bold">{s.score}</span>
            </li>
          ))}
        </ul>
      </div>

      {myWords && myWords.length > 0 && (
        <div className="card p-4">
          <p className="mb-2 text-sm font-bold text-ink-400">Your words</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {myWords.map((w) => (
              <span key={w.word} className={`rounded-full px-2.5 py-1 ${w.unique ? 'bg-perx/20 text-perx-light' : 'bg-white/10'}`}>
                {w.word.toUpperCase()} +{w.points}{w.unique && ' ×2'}
              </span>
            ))}
          </div>
        </div>
      )}

      {isGuest && (
        <Link href="/signup?from=game" className="card block border-perx/40 p-4 text-sm active:bg-white/10">
          <span className="font-bold text-perx-light">Keep your points →</span> Sign up with a Perx handle
          and everything you earned today is saved.
        </Link>
      )}

      <div className="flex flex-col gap-2">
        {isHost && (
          <button className="btn-primary" onClick={() => lobby.start()}>
            Play again — same table
          </button>
        )}
        <Link href="/" onClick={() => lobby.leave()} className="btn-ghost">
          Back to home
        </Link>
      </div>
    </div>
  );
}
