'use client';

import { useEffect, useRef, useState } from 'react';
import type { useLobby } from '@/hooks/useLobby';
import { Countdown } from './Countdown';

type StartPayload = { grid: string[][]; endsAt: number };

/**
 * Tap adjacent letters to build a word, or type it — both submit to the
 * server for validation (dictionary + grid path). Touch-first: big cells,
 * submit button in thumb reach.
 */
export function WordRushView({ lobby }: { lobby: ReturnType<typeof useLobby> }) {
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [endsAt, setEndsAt] = useState(0);
  const [path, setPath] = useState<[number, number][]>([]);
  const [words, setWords] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const flashTimer = useRef<NodeJS.Timeout | null>(null);

  const { on } = lobby;
  useEffect(() => {
    on('wordrush:start', (p: StartPayload) => {
      setGrid(p.grid);
      setEndsAt(p.endsAt);
    });
    on('wordrush:mine', (p: { words: string[] }) => setWords(p.words));
    on('wordrush:result', (p: { word: string; ok: boolean; reason: string }) => {
      if (p.ok) setWords((w) => [...w, p.word]);
      setFlash({ ok: p.ok, text: p.ok ? `${p.word.toUpperCase()} ✓` : `${p.word.toUpperCase()} — ${p.reason}` });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 1400);
    });
    on('wordrush:counts', (p: { counts: Record<string, number> }) => setCounts(p.counts));
  }, [on]);

  if (!grid) return <p className="pt-24 text-center text-ink-400 animate-pulse">Shuffling letters…</p>;

  const word = path.map(([r, c]) => grid[r][c]).join('');

  function tap(r: number, c: number) {
    const idx = path.findIndex(([pr, pc]) => pr === r && pc === c);
    if (idx === path.length - 1) return setPath(path.slice(0, -1)); // tap last = undo
    if (idx !== -1) return;
    if (path.length > 0) {
      const [lr, lc] = path[path.length - 1];
      if (Math.abs(lr - r) > 1 || Math.abs(lc - c) > 1) return; // adjacency
    }
    setPath([...path, [r, c]]);
  }

  function submit() {
    if (word.length >= 3) lobby.send({ type: 'word', word });
    setPath([]);
  }

  return (
    <div className="flex flex-col gap-3 pt-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-400">
          {words.length} word{words.length === 1 ? '' : 's'} · unique score double
        </span>
        <Countdown endsAt={endsAt} />
      </div>

      <div className="flex h-10 items-center justify-center rounded-md bg-white/5 font-mono text-xl font-black tracking-widest">
        {word.toUpperCase() || <span className="text-sm font-normal normal-case tracking-normal text-ink-500">Tap letters to build a word</span>}
      </div>

      {flash && (
        <p className={`text-center text-sm font-bold ${flash.ok ? 'text-perx-light' : 'text-danger'} animate-pop`}>
          {flash.text}
        </p>
      )}

      <div className="mx-auto grid w-full max-w-xs grid-cols-5 gap-1.5">
        {grid.map((row, r) =>
          row.map((letter, c) => {
            const active = path.some(([pr, pc]) => pr === r && pc === c);
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => tap(r, c)}
                className={`aspect-square rounded-md text-xl font-black uppercase transition-all duration-[160ms] ${
                  active ? 'bg-perx text-ink-950 scale-95' : 'bg-white/10 text-white active:bg-white/20'
                }`}
              >
                {letter}
              </button>
            );
          })
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setPath([])} className="btn-ghost h-11 flex-1 text-sm">
          Clear
        </button>
        <button onClick={submit} disabled={word.length < 3} className="btn-primary h-11 flex-[2] text-sm">
          Submit word
        </button>
      </div>

      <div className="card max-h-28 overflow-y-auto p-3">
        <p className="mb-1 text-xs font-bold text-ink-500">Your words</p>
        <p className="text-sm leading-relaxed">
          {words.length ? words.map((w) => w.toUpperCase()).join(' · ') : <span className="text-ink-500">None yet — 3+ letters, adjacent tiles</span>}
        </p>
      </div>

      {Object.keys(counts).length > 0 && (
        <p className="text-center text-xs text-ink-500">
          {lobby.state?.players
            .map((p) => `${p.nickname}: ${counts[p.key] ?? 0}`)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}
