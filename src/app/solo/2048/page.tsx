'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from '@/components/TopBar';

type Grid = number[][];

const SIZE = 4;

function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function addTile(grid: Grid): Grid {
  const empty: [number, number][] = [];
  grid.forEach((row, r) => row.forEach((v, c) => v === 0 && empty.push([r, c])));
  if (!empty.length) return grid;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const next = grid.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function slideRow(row: number[]): { row: number[]; gained: number } {
  const vals = row.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === vals[i + 1]) {
      out.push(vals[i] * 2);
      gained += vals[i] * 2;
      i++;
    } else {
      out.push(vals[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { row: out, gained };
}

function move(grid: Grid, dir: 'left' | 'right' | 'up' | 'down'): { grid: Grid; gained: number; moved: boolean } {
  const rotate = (g: Grid): Grid => g[0].map((_, c) => g.map((row) => row[c]).reverse());
  let g = grid.map((r) => [...r]);
  const rotations = { left: 0, up: 1, right: 2, down: 3 }[dir];
  for (let i = 0; i < rotations; i++) g = rotate(g);
  let gained = 0;
  g = g.map((row) => {
    const res = slideRow(row);
    gained += res.gained;
    return res.row;
  });
  for (let i = 0; i < (4 - rotations) % 4; i++) g = rotate(g);
  const moved = JSON.stringify(g) !== JSON.stringify(grid);
  return { grid: g, gained, moved };
}

function canMove(grid: Grid): boolean {
  return (['left', 'right', 'up', 'down'] as const).some((d) => move(grid, d).moved);
}

const TILE_STYLE: Record<number, string> = {
  2: 'bg-white/10 text-white',
  4: 'bg-white/20 text-white',
  8: 'bg-grad-azure text-white',
  16: 'bg-grad-electric text-white',
  32: 'bg-grad-sunset text-white',
  64: 'bg-grad-berry text-white',
  128: 'bg-perx text-ink-950',
  256: 'bg-perx text-ink-950',
  512: 'bg-perx-light text-ink-950',
  1024: 'bg-perx-light text-ink-950',
  2048: 'bg-white text-ink-950',
};

export default function Game2048Page() {
  const [grid, setGrid] = useState<Grid>(() => addTile(addTile(emptyGrid())));
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [points, setPoints] = useState<number | null>(null);
  const touchStart = useRef<[number, number] | null>(null);
  const reported = useRef(false);

  const doMove = useCallback(
    (dir: 'left' | 'right' | 'up' | 'down') => {
      if (over) return;
      setGrid((g) => {
        const res = move(g, dir);
        if (!res.moved) return g;
        setScore((s) => s + res.gained);
        const next = addTile(res.grid);
        if (!canMove(next)) setOver(true);
        return next;
      });
    },
    [over]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      };
      if (map[e.key]) {
        e.preventDefault();
        doMove(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doMove]);

  useEffect(() => {
    if (over && !reported.current) {
      reported.current = true;
      fetch('/api/solo/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: '2048', score }),
      })
        .then((r) => r.json())
        .then((d) => setPoints(d.pointsAwarded ?? 0))
        .catch(() => setPoints(0));
    }
  }, [over, score]);

  function reset() {
    setGrid(addTile(addTile(emptyGrid())));
    setScore(0);
    setOver(false);
    setPoints(null);
    reported.current = false;
  }

  return (
    <main
      className="safe-bottom select-none px-4 animate-fade-up"
      onTouchStart={(e) => (touchStart.current = [e.touches[0].clientX, e.touches[0].clientY])}
      onTouchEnd={(e) => {
        if (!touchStart.current) return;
        const dx = e.changedTouches[0].clientX - touchStart.current[0];
        const dy = e.changedTouches[0].clientY - touchStart.current[1];
        touchStart.current = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      }}
    >
      <TopBar back="/" title="2048" />
      <p className="mb-4 text-sm text-ink-400">
        Score <span className="grad-number-electric font-display text-lg font-black">{score}</span> · swipe to move tiles
      </p>

      <div className="mx-auto grid w-full max-w-xs grid-cols-4 gap-2 rounded-lg bg-white/5 p-2">
        {grid.flat().map((v, i) => (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded-md font-display font-black transition-all duration-[160ms] ${
              v === 0 ? 'bg-white/[0.03]' : TILE_STYLE[v] ?? 'bg-white text-ink-950'
            } ${v >= 1000 ? 'text-lg' : v >= 100 ? 'text-xl' : 'text-2xl'}`}
          >
            {v || ''}
          </div>
        ))}
      </div>

      {over && (
        <div className="card mt-5 flex flex-col items-center gap-3 p-5 text-center animate-pop">
          <p className="font-bold">Game over — {score} points on the board</p>
          {points !== null && points > 0 && <p className="grad-number font-display text-2xl font-black">+{points} pts</p>}
          <button onClick={reset} className="btn-primary">
            Play again
          </button>
        </div>
      )}
    </main>
  );
}
