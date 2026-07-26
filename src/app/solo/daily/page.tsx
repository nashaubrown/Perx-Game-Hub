'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';

type Mark = 'hit' | 'near' | 'miss';
type DailyState = {
  loginRequired?: boolean;
  guesses: string[];
  marks: Mark[][];
  finished: boolean;
  won: boolean;
  streak: number;
  maxGuesses: number;
  answer?: string;
};

const MARK_STYLE: Record<Mark, string> = {
  hit: 'bg-perx text-ink-950',
  near: 'bg-warning text-ink-950',
  miss: 'bg-white/10 text-ink-400',
};

const KEYS = ['qwertyuiop', 'asdfghjkl', '⏎zxcvbnm⌫'];

export default function DailyWordPage() {
  const [state, setState] = useState<DailyState | null>(null);
  const [current, setCurrent] = useState('');
  const [error, setError] = useState('');
  const [earned, setEarned] = useState(0);

  useEffect(() => {
    fetch('/api/solo/daily')
      .then((r) => r.json())
      .then(setState)
      .catch(() => {});
  }, []);

  async function submit() {
    if (!state || current.length !== 5) return;
    setError('');
    const res = await fetch('/api/solo/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guess: current }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Try another word.');
    setState((s) =>
      s
        ? {
            ...s,
            guesses: data.guesses,
            marks: [...s.marks, data.marks],
            finished: data.finished,
            won: data.won,
            streak: data.streak,
            answer: data.answer,
          }
        : s
    );
    if (data.pointsAwarded) setEarned(data.pointsAwarded);
    setCurrent('');
  }

  function press(k: string) {
    setError('');
    if (k === '⏎') return void submit();
    if (k === '⌫') return setCurrent((c) => c.slice(0, -1));
    setCurrent((c) => (c.length < 5 ? c + k : c));
  }

  if (!state) return <main className="px-4"><TopBar back="/" title="Daily Word" /><p className="pt-16 text-center text-ink-400 animate-pulse">Loading…</p></main>;

  if (state.loginRequired) {
    return (
      <main className="px-4 animate-fade-up">
        <TopBar back="/" title="Daily Word" />
        <div className="card mt-8 flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-3xl">📅</p>
          <p className="font-bold">One word a day, streaks tracked.</p>
          <p className="text-sm text-ink-400">The daily puzzle needs an account so your streak follows you.</p>
          <Link href="/login" className="btn-primary">Log in to play</Link>
        </div>
      </main>
    );
  }

  const rows = Array.from({ length: state.maxGuesses }, (_, i) => {
    if (i < state.guesses.length) return { word: state.guesses[i], marks: state.marks[i] };
    if (i === state.guesses.length && !state.finished) return { word: current, marks: null };
    return { word: '', marks: null };
  });

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar back="/" title="Daily Word" />
      <p className="mb-3 text-sm text-ink-400">
        Streak: <span className="font-bold text-perx-light">{state.streak} day{state.streak === 1 ? '' : 's'}</span> 🔥
      </p>

      <div className="mx-auto flex w-fit flex-col gap-1.5">
        {rows.map((row, r) => (
          <div key={r} className="flex gap-1.5">
            {Array.from({ length: 5 }, (_, c) => (
              <div
                key={c}
                className={`flex h-12 w-12 items-center justify-center rounded-sm text-xl font-black uppercase ${
                  row.marks ? MARK_STYLE[row.marks[c]] : row.word[c] ? 'border-2 border-white/40' : 'border-2 border-white/10'
                }`}
              >
                {row.word[c] ?? ''}
              </div>
            ))}
          </div>
        ))}
      </div>

      {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}

      {state.finished ? (
        <div className="card mt-4 flex flex-col items-center gap-2 p-5 text-center animate-pop">
          <p className="text-2xl">{state.won ? '🎉' : '😅'}</p>
          <p className="font-bold">
            {state.won ? `Solved in ${state.guesses.length}` : `The word was "${state.answer?.toUpperCase()}"`}
          </p>
          {earned > 0 && <p className="grad-number font-display text-2xl font-black">+{earned} pts</p>}
          <p className="text-sm text-ink-400">New word tomorrow — keep the streak going.</p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-1.5">
          {KEYS.map((row) => (
            <div key={row} className="flex gap-1">
              {[...row].map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  className={`flex h-11 items-center justify-center rounded-sm bg-white/10 font-bold uppercase active:bg-white/25 ${
                    k === '⏎' || k === '⌫' ? 'w-12 text-sm' : 'w-8'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
