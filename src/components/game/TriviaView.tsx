'use client';

import { useEffect, useState } from 'react';
import type { useLobby } from '@/hooks/useLobby';
import { Countdown } from './Countdown';
import { Scoreboard } from './Scoreboard';

type Question = { index: number; total: number; category: string; q: string; choices: string[]; endsAt: number };
type Reveal = {
  index: number;
  correct: number;
  deltas: Record<string, number>;
  scoreboard: { key: string; nickname: string; score: number }[];
  isLast: boolean;
};

const CHOICE_COLORS = ['bg-grad-electric', 'bg-grad-sunset', 'bg-grad-berry', 'bg-grad-azure'];

export function TriviaView({ lobby }: { lobby: ReturnType<typeof useLobby> }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [locked, setLocked] = useState<number | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);

  const { on } = lobby;
  useEffect(() => {
    on('trivia:question', (q: Question) => {
      setQuestion(q);
      setReveal(null);
      setLocked(null);
      setAnsweredCount(0);
    });
    on('trivia:locked', (p: { choice: number }) => setLocked(p.choice));
    on('trivia:answered-count', (p: { count: number }) => setAnsweredCount(p.count));
    on('trivia:reveal', (r: Reveal) => setReveal(r));
  }, [on]);

  if (!question) return <p className="pt-24 text-center text-ink-400 animate-pulse">Getting questions ready…</p>;

  const myDelta = reveal && lobby.you ? reveal.deltas[lobby.you] : undefined;

  return (
    <div className="flex flex-col gap-4 pt-6 animate-fade-up" key={question.index}>
      <div className="flex items-center justify-between text-sm text-ink-400">
        <span>
          Q{question.index + 1}/{question.total} · {question.category}
        </span>
        {!reveal && <Countdown endsAt={question.endsAt} />}
      </div>

      <h2 className="min-h-20 font-display text-2xl font-black leading-snug">{question.q}</h2>

      {!reveal ? (
        <>
          <div className="grid grid-cols-1 gap-3">
            {question.choices.map((choice, i) => (
              <button
                key={i}
                disabled={locked !== null}
                onClick={() => lobby.send({ type: 'answer', choice: i })}
                className={`${CHOICE_COLORS[i % 4]} min-h-14 rounded-md px-4 py-3 text-left font-bold text-white transition-all duration-[160ms] active:scale-[0.98] ${
                  locked !== null && locked !== i ? 'opacity-30' : ''
                } ${locked === i ? 'ring-4 ring-white' : ''}`}
              >
                {choice}
              </button>
            ))}
          </div>
          <p className="text-center text-sm text-ink-500">
            {locked !== null ? 'Locked in — faster answers score more' : `${answeredCount} answered`}
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-2">
            {question.choices.map((choice, i) => (
              <div
                key={i}
                className={`rounded-md px-4 py-3 font-bold ${
                  i === reveal.correct
                    ? 'bg-perx text-ink-950'
                    : locked === i
                      ? 'bg-danger/30 text-white'
                      : 'bg-white/5 text-ink-500'
                }`}
              >
                {choice}
                {i === reveal.correct && ' ✓'}
              </div>
            ))}
          </div>
          <p className="text-center font-bold">
            {myDelta ? (
              <span className="grad-number text-2xl">+{myDelta}</span>
            ) : locked !== null ? (
              <span className="text-danger">Not this time</span>
            ) : (
              <span className="text-ink-500">Too slow!</span>
            )}
          </p>
          <Scoreboard entries={reveal.scoreboard} you={lobby.you} deltas={reveal.deltas} />
          {!reveal.isLast && <p className="text-center text-xs text-ink-500">Next question coming up…</p>}
        </div>
      )}
    </div>
  );
}
