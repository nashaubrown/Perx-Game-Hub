'use client';

import { useEffect, useState } from 'react';
import type { useLobby } from '@/hooks/useLobby';

type State = {
  index: number;
  total: number;
  question: string;
  tier: 'light' | 'medium' | 'deep';
  answererKey: string;
  passesLeft: Record<string, number>;
};

const TIER_STYLE: Record<string, { label: string; cls: string }> = {
  light: { label: 'warm-up', cls: 'bg-grad-azure' },
  medium: { label: 'getting real', cls: 'bg-grad-electric' },
  deep: { label: 'deep water', cls: 'bg-grad-berry' },
};

export function TwentyOneView({ lobby }: { lobby: ReturnType<typeof useLobby> }) {
  const [state, setState] = useState<State | null>(null);

  const { on } = lobby;
  useEffect(() => {
    on('21q:state', (s: State) => setState(s));
  }, [on]);

  if (!state) return <p className="pt-24 text-center text-ink-400 animate-pulse">Shuffling the deck…</p>;

  const myTurn = lobby.you === state.answererKey;
  const answerer = lobby.state?.players.find((p) => p.key === state.answererKey);
  const passesLeft = lobby.you ? state.passesLeft[lobby.you] ?? 0 : 0;
  const tier = TIER_STYLE[state.tier] ?? TIER_STYLE.light;

  return (
    <div className="flex min-h-dvh flex-col gap-4 pt-6 pb-8 animate-fade-up">
      <div className="flex items-center justify-between text-sm text-ink-400">
        <span>
          Question {state.index + 1} of {state.total}
        </span>
        <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${tier.cls}`}>{tier.label}</span>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-perx transition-all duration-[480ms]"
          style={{ width: `${(state.index / state.total) * 100}%` }}
        />
      </div>

      <div className="card flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center" key={state.index}>
        <p className="font-display text-2xl font-black leading-snug animate-fade-up">{state.question}</p>
        <p className="text-sm text-ink-400">
          {myTurn ? (
            <span className="font-bold text-perx-light">Your turn — answer out loud</span>
          ) : (
            <>
              <span className="font-bold text-white">{answerer?.nickname}</span> is answering — no phones, just
              listen 👀
            </>
          )}
        </p>
      </div>

      {myTurn ? (
        <div className="flex flex-col gap-2">
          <button onClick={() => lobby.send({ type: 'answered' })} className="btn-primary">
            Answered — next question
          </button>
          <button
            onClick={() => lobby.send({ type: 'pass' })}
            disabled={passesLeft <= 0}
            className="btn-ghost"
          >
            Pass ({passesLeft} left)
          </button>
        </div>
      ) : (
        <p className="pb-2 text-center text-sm text-ink-500">They control the deck for this one.</p>
      )}
    </div>
  );
}
