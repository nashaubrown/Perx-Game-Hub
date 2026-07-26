'use client';

import { useEffect, useRef, useState } from 'react';
import type { useLobby } from '@/hooks/useLobby';
import { Scoreboard } from './Scoreboard';

type State = {
  round: number;
  total: number;
  currentKey: string;
  phase: 'choose' | 'doing';
  kind: 'truth' | 'dare' | null;
  prompt: string | null;
  scoreboard: { key: string; nickname: string; score: number }[];
};

export function TruthDareView({ lobby }: { lobby: ReturnType<typeof useLobby> }) {
  const [state, setState] = useState<State | null>(null);
  const [flash, setFlash] = useState('');
  const flashTimer = useRef<NodeJS.Timeout | null>(null);

  const { on } = lobby;
  useEffect(() => {
    on('tod:state', (s: State) => setState(s));
    on('tod:result', (r: { nickname: string; done: boolean; kind: string }) => {
      setFlash(r.done ? `${r.nickname} did the ${r.kind}! +10` : `${r.nickname} chickened out 🐔`);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(''), 2200);
    });
  }, [on]);

  if (!state) return <p className="pt-24 text-center text-ink-400 animate-pulse">Shuffling the decks…</p>;

  const myTurn = lobby.you === state.currentKey;
  const current = lobby.state?.players.find((p) => p.key === state.currentKey);

  return (
    <div className="flex min-h-dvh flex-col gap-4 pt-6 pb-8 animate-fade-up">
      <div className="flex items-center justify-between text-sm text-ink-400">
        <span>
          Round {state.round + 1} of {state.total}
        </span>
        <span>
          On the spot: <span className="font-bold text-white">{myTurn ? 'you 😳' : current?.nickname}</span>
        </span>
      </div>

      {flash && <p className="text-center text-sm font-bold text-perx-light animate-pop">{flash}</p>}

      {state.phase === 'choose' ? (
        myTurn ? (
          <div className="flex flex-1 flex-col justify-center gap-4">
            <p className="text-center font-display text-2xl font-black">Pick your poison</p>
            <button
              onClick={() => lobby.send({ type: 'pick', kind: 'truth' })}
              className="card flex items-center justify-center gap-3 bg-grad-azure p-8 text-2xl font-black text-white active:scale-[0.98]"
            >
              💬 Truth
            </button>
            <button
              onClick={() => lobby.send({ type: 'pick', kind: 'dare' })}
              className="card flex items-center justify-center gap-3 bg-grad-sunset p-8 text-2xl font-black text-white active:scale-[0.98]"
            >
              🔥 Dare
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-5xl">🤔</p>
            <p className="font-bold">{current?.nickname} is choosing…</p>
            <p className="text-sm text-ink-500">Truth or dare — place your bets.</p>
          </div>
        )
      ) : (
        <div className="flex flex-1 flex-col gap-4" key={state.round}>
          <div
            className={`card flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center ${
              state.kind === 'dare' ? 'border-danger/40' : 'border-info/40'
            }`}
          >
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide">
              {state.kind === 'dare' ? '🔥 Dare' : '💬 Truth'}
            </span>
            <p className="font-display text-2xl font-black leading-snug animate-fade-up">{state.prompt}</p>
            {!myTurn && <p className="text-sm text-ink-400">Watch {current?.nickname} squirm. You're the judges.</p>}
          </div>

          {myTurn && (
            <div className="flex gap-2">
              <button onClick={() => lobby.send({ type: 'chicken' })} className="btn-ghost flex-1">
                Chicken out 🐔
              </button>
              <button onClick={() => lobby.send({ type: 'done' })} className="btn-primary flex-[2]">
                Done it · +10
              </button>
            </div>
          )}
        </div>
      )}

      <Scoreboard entries={state.scoreboard} you={lobby.you} />
    </div>
  );
}
