'use client';

import { useEffect, useRef, useState } from 'react';
import { TopBar } from '@/components/TopBar';

const EMOJIS = ['🍕', '☕', '🌴', '🐟', '🎮', '📚', '🌊', '🥭'];

type Card = { id: number; emoji: string; flipped: boolean; matched: boolean };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal(): Card[] {
  return shuffle([...EMOJIS, ...EMOJIS]).map((emoji, id) => ({ id, emoji, flipped: false, matched: false }));
}

export default function MemoryPage() {
  const [cards, setCards] = useState<Card[]>(deal);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [done, setDone] = useState<{ seconds: number; points: number } | null>(null);
  const busy = useRef(false);

  function flip(card: Card) {
    if (busy.current || card.flipped || card.matched || done) return;
    if (!startedAt) setStartedAt(Date.now());

    const open = cards.filter((c) => c.flipped && !c.matched);
    const next = cards.map((c) => (c.id === card.id ? { ...c, flipped: true } : c));
    setCards(next);

    if (open.length === 1) {
      setMoves((m) => m + 1);
      if (open[0].emoji === card.emoji) {
        setCards(next.map((c) => (c.emoji === card.emoji ? { ...c, matched: true } : c)));
      } else {
        busy.current = true;
        setTimeout(() => {
          setCards((cur) => cur.map((c) => (c.matched ? c : { ...c, flipped: false })));
          busy.current = false;
        }, 700);
      }
    }
  }

  useEffect(() => {
    if (cards.length && cards.every((c) => c.matched) && !done && startedAt) {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      const score = Math.max(100, 10000 - moves * 200 - seconds * 20);
      fetch('/api/solo/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: 'memory', score }),
      })
        .then((r) => r.json())
        .then((d) => setDone({ seconds, points: d.pointsAwarded ?? 0 }))
        .catch(() => setDone({ seconds, points: 0 }));
    }
  }, [cards, done, moves, startedAt]);

  function reset() {
    setCards(deal());
    setMoves(0);
    setStartedAt(null);
    setDone(null);
  }

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar back="/" title="Memory Match" />
      <p className="mb-4 text-sm text-ink-400">{moves} moves · find all 8 pairs</p>

      <div className="grid grid-cols-4 gap-2">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => flip(card)}
            className={`aspect-square rounded-md text-3xl transition-all duration-[240ms] ${
              card.flipped || card.matched
                ? card.matched
                  ? 'bg-perx/20'
                  : 'bg-white/15'
                : 'bg-white/5 active:bg-white/15'
            }`}
          >
            {(card.flipped || card.matched) && card.emoji}
          </button>
        ))}
      </div>

      {done && (
        <div className="card mt-5 flex flex-col items-center gap-3 p-5 text-center animate-pop">
          <p className="text-3xl">🎉</p>
          <p className="font-bold">
            Done in {moves} moves and {done.seconds}s
          </p>
          {done.points > 0 && <p className="grad-number font-display text-2xl font-black">+{done.points} pts</p>}
          <button onClick={reset} className="btn-primary">
            Play again
          </button>
        </div>
      )}
    </main>
  );
}
