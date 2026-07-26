'use client';

import { useEffect, useState } from 'react';
import type { useLobby } from '@/hooks/useLobby';

type RummyState = {
  turnKey: string;
  phase: 'draw' | 'discard';
  discardTop: number | null;
  stockCount: number;
  counts: Record<string, number>;
};

type HandState = {
  hand: number[];
  deadwood: number;
  melds: number[][];
  canKnock: boolean;
  canGin: boolean;
};

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function Card({
  id,
  onClick,
  selected,
  melded,
  small,
}: {
  id: number | null;
  onClick?: () => void;
  selected?: boolean;
  melded?: boolean;
  small?: boolean;
}) {
  const size = small ? 'h-14 w-10 text-xs' : 'h-[72px] w-[52px] text-sm';
  if (id === null) {
    return <div className={`${size} rounded-md border border-dashed border-white/20`} />;
  }
  const suit = Math.floor(id / 13);
  const red = suit === 1 || suit === 2;
  return (
    <button
      onClick={onClick}
      className={`${size} flex shrink-0 flex-col items-center justify-center rounded-md border bg-white font-bold shadow-md transition-transform duration-[160ms] ${
        red ? 'text-[#C0303A]' : 'text-ink-950'
      } ${selected ? '-translate-y-2 border-perx ring-2 ring-perx' : 'border-ink-200'} ${
        melded ? 'border-perx/60' : ''
      }`}
    >
      <span>{RANKS[id % 13]}</span>
      <span className={small ? 'text-sm' : 'text-lg'}>{SUITS[suit]}</span>
      {melded && <span className="mt-0.5 h-1 w-4 rounded-full bg-perx" />}
    </button>
  );
}

export function RummyView({ lobby }: { lobby: ReturnType<typeof useLobby> }) {
  const [state, setState] = useState<RummyState | null>(null);
  const [hand, setHand] = useState<HandState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const { on } = lobby;
  useEffect(() => {
    on('rummy:state', (s: RummyState) => {
      setState(s);
      setSelected(null);
    });
    on('rummy:hand', (h: HandState) => setHand(h));
  }, [on]);

  if (!state || !hand) return <p className="pt-24 text-center text-ink-400 animate-pulse">Dealing…</p>;

  const myTurn = lobby.you === state.turnKey;
  const opponent = lobby.state?.players.find((p) => p.key !== lobby.you);
  const opponentCount = opponent ? state.counts[opponent.key] ?? 10 : 10;
  const meldedCards = new Set(hand.melds.flat());
  const mustDiscard = myTurn && state.phase === 'discard';

  return (
    <div className="flex min-h-dvh flex-col gap-4 pt-4 pb-6 animate-fade-up">
      {/* opponent */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-400">
          <span className="font-bold text-white">{opponent?.nickname ?? '…'}</span> · {opponentCount} cards
          {opponent && !opponent.connected && <span className="text-warning"> (reconnecting)</span>}
        </span>
        <span className={`font-bold ${myTurn ? 'text-perx-light' : 'text-ink-500'}`}>
          {myTurn ? (state.phase === 'draw' ? 'Draw a card' : 'Discard one') : 'Their turn'}
        </span>
      </div>

      {/* table: stock + discard */}
      <div className="flex flex-1 items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <button
            disabled={!myTurn || state.phase !== 'draw'}
            onClick={() => lobby.send({ type: 'draw', source: 'stock' })}
            className={`flex h-[72px] w-[52px] items-center justify-center rounded-md border border-white/25 bg-grad-electric text-2xl shadow-md ${
              myTurn && state.phase === 'draw' ? 'animate-pop' : 'opacity-80'
            }`}
          >
            🂠
          </button>
          <span className="text-xs text-ink-500">Stock · {state.stockCount}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Card
            id={state.discardTop}
            onClick={
              myTurn && state.phase === 'draw' && state.discardTop !== null
                ? () => lobby.send({ type: 'draw', source: 'discard' })
                : undefined
            }
          />
          <span className="text-xs text-ink-500">Discard</span>
        </div>
      </div>

      {/* deadwood + actions */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-400">
          Deadwood <span className={`font-display font-black ${hand.deadwood <= 10 ? 'text-perx-light' : 'text-white'}`}>{hand.deadwood}</span>
          <span className="text-xs"> · knock at ≤10</span>
        </span>
        {mustDiscard && (
          <div className="flex gap-2">
            <button
              disabled={selected === null}
              onClick={() => selected !== null && lobby.send({ type: 'discard', card: selected })}
              className="rounded-md bg-white/15 px-4 py-2 text-sm font-bold disabled:opacity-40"
            >
              Discard
            </button>
            {(hand.canKnock || hand.canGin) && (
              <button
                disabled={selected === null}
                onClick={() => selected !== null && lobby.send({ type: 'knock', card: selected })}
                className="rounded-md bg-perx px-4 py-2 text-sm font-bold text-ink-950 disabled:opacity-40"
              >
                {hand.canGin ? 'Gin!' : 'Knock'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* my hand */}
      <div className="flex gap-1.5 overflow-x-auto pb-2">
        {hand.hand.map((c) => (
          <Card
            key={c}
            id={c}
            selected={selected === c}
            melded={meldedCards.has(c)}
            onClick={() => setSelected(selected === c ? null : c)}
          />
        ))}
      </div>
      <p className="-mt-2 text-center text-[11px] text-ink-500">
        Green-marked cards are in melds. Tap a card, then Discard{hand.canKnock ? ' or Knock' : ''}.
      </p>
    </div>
  );
}
