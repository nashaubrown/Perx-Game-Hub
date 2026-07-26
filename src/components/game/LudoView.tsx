'use client';

import { useEffect, useState } from 'react';
import type { useLobby } from '@/hooks/useLobby';

type LudoState = {
  players: { key: string; nickname?: string; color: string; tokens: number[] }[];
  turnKey: string;
  phase: 'roll' | 'move';
  dice: number;
  movable: number[];
  event?: string;
};

// same geometry as the server engine: 52-cell loop on a 15x15 grid
const TRACK: [number, number][] = [];
for (let c = 0; c <= 5; c++) TRACK.push([6, c]);
for (let r = 5; r >= 0; r--) TRACK.push([r, 6]);
TRACK.push([0, 7]);
for (let r = 0; r <= 5; r++) TRACK.push([r, 8]);
for (let c = 9; c <= 14; c++) TRACK.push([6, c]);
TRACK.push([7, 14]);
for (let c = 14; c >= 9; c--) TRACK.push([8, c]);
for (let r = 9; r <= 14; r++) TRACK.push([r, 8]);
TRACK.push([14, 7]);
TRACK.push([14, 6]);
for (let r = 13; r >= 9; r--) TRACK.push([r, 6]);
for (let c = 5; c >= 0; c--) TRACK.push([8, c]);
TRACK.push([7, 0]);

const STARTS: Record<string, number> = { red: 1, green: 14, yellow: 27, blue: 40 };
const SAFE = new Set([1, 14, 27, 40, 9, 22, 35, 48]);
const HOME_COLS: Record<string, [number, number][]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};
const YARD_SPOTS: Record<string, [number, number][]> = {
  red: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  green: [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  yellow: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
  blue: [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
};
const YARD_AREA: Record<string, [number, number]> = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };

const COLOR_HEX: Record<string, string> = {
  red: '#F43F5E',
  green: '#34C759',
  yellow: '#F59E0B',
  blue: '#3B82F6',
};

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function cellFor(color: string, pos: number, tokenIdx: number): [number, number] {
  if (pos === -1) return YARD_SPOTS[color][tokenIdx];
  if (pos === 56) return [7, 7];
  if (pos >= 51) return HOME_COLS[color][pos - 51];
  return TRACK[(STARTS[color] + pos) % 52];
}

export function LudoView({ lobby }: { lobby: ReturnType<typeof useLobby> }) {
  const [state, setState] = useState<LudoState | null>(null);
  const [notice, setNotice] = useState('');

  const { on } = lobby;
  useEffect(() => {
    on('ludo:state', (s: LudoState) => {
      setState(s);
      if (s.event === 'capture') setNotice('Capture! Back to the yard 😈');
      else if (s.event === 'no-move') setNotice('No possible move');
      else if (s.event === 'triple-six') setNotice('Three sixes — turn lost!');
      else setNotice('');
    });
  }, [on]);

  if (!state) return <p className="pt-24 text-center text-ink-400 animate-pulse">Setting up the board…</p>;

  const me = state.players.find((p) => p.key === lobby.you);
  const myTurn = lobby.you === state.turnKey;
  const turnPlayer = state.players.find((p) => p.key === state.turnKey);

  const CELL = 100 / 15; // percentage grid

  return (
    <div className="flex flex-col gap-3 pt-4 animate-fade-up">
      <div className="flex items-center justify-between text-sm">
        <div className="flex gap-2">
          {state.players.map((p) => (
            <span
              key={p.key}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                p.key === state.turnKey ? 'bg-white/15' : 'opacity-60'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR_HEX[p.color] }} />
              {p.key === lobby.you ? 'you' : p.nickname}
            </span>
          ))}
        </div>
      </div>

      {/* board */}
      <div className="relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden rounded-lg border border-white/15 bg-[#141414]">
        {/* yards */}
        {Object.entries(YARD_AREA).map(([color, [r, c]]) => (
          <div
            key={color}
            className="absolute rounded-md"
            style={{
              top: `${(r + 0.4) * CELL}%`,
              left: `${(c + 0.4) * CELL}%`,
              width: `${5.2 * CELL}%`,
              height: `${5.2 * CELL}%`,
              background: `${COLOR_HEX[color]}22`,
              border: `2px solid ${COLOR_HEX[color]}`,
            }}
          />
        ))}
        {/* track cells */}
        {TRACK.map(([r, c], i) => (
          <div
            key={i}
            className="absolute rounded-[3px] border border-white/10"
            style={{
              top: `${r * CELL + 0.4}%`,
              left: `${c * CELL + 0.4}%`,
              width: `${CELL - 0.8}%`,
              height: `${CELL - 0.8}%`,
              background: SAFE.has(i)
                ? Object.entries(STARTS).find(([, s]) => s === i)
                  ? `${COLOR_HEX[Object.entries(STARTS).find(([, s]) => s === i)![0]]}55`
                  : 'rgba(255,255,255,0.22)'
                : 'rgba(255,255,255,0.08)',
            }}
          >
            {SAFE.has(i) && !Object.values(STARTS).includes(i) && (
              <span className="flex h-full w-full items-center justify-center text-[8px] text-white/70">★</span>
            )}
          </div>
        ))}
        {/* home columns */}
        {Object.entries(HOME_COLS).map(([color, cells]) =>
          cells.map(([r, c], i) => (
            <div
              key={`${color}-${i}`}
              className="absolute rounded-[3px]"
              style={{
                top: `${r * CELL + 0.4}%`,
                left: `${c * CELL + 0.4}%`,
                width: `${CELL - 0.8}%`,
                height: `${CELL - 0.8}%`,
                background: `${COLOR_HEX[color]}66`,
              }}
            />
          ))
        )}
        {/* center goal */}
        <div
          className="absolute flex items-center justify-center rounded-md text-lg"
          style={{ top: `${6 * CELL}%`, left: `${6 * CELL}%`, width: `${3 * CELL}%`, height: `${3 * CELL}%`, background: 'rgba(255,255,255,0.1)' }}
        >
          🏠
        </div>
        {/* tokens */}
        {state.players.map((p) =>
          p.tokens.map((pos, i) => {
            const [r, c] = cellFor(p.color, pos, i);
            const mine = p.key === lobby.you;
            const movable = mine && myTurn && state.phase === 'move' && state.movable.includes(i);
            // spread stacked tokens slightly
            const stack = p.tokens.filter((t, j) => j < i && t === pos && pos !== -1 && pos !== 56).length;
            return (
              <button
                key={`${p.key}-${i}`}
                disabled={!movable}
                onClick={() => lobby.send({ type: 'move', token: i })}
                className={`absolute z-10 rounded-full border-2 transition-all duration-[240ms] ${
                  movable ? 'animate-pop border-white ring-2 ring-white/70' : 'border-black/40'
                }`}
                style={{
                  top: `${r * CELL + 0.15 * CELL + stack * 1.2}%`,
                  left: `${c * CELL + 0.15 * CELL + stack * 1.2}%`,
                  width: `${CELL * 0.7}%`,
                  height: `${CELL * 0.7}%`,
                  background: COLOR_HEX[p.color],
                }}
                aria-label={`${p.color} token ${i + 1}`}
              />
            );
          })
        )}
      </div>

      {notice && <p className="text-center text-sm font-bold text-warning animate-pop">{notice}</p>}

      <div className="flex items-center justify-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-md bg-white/10 text-4xl">
          {state.dice ? DICE_FACES[state.dice] : '·'}
        </div>
        {myTurn ? (
          state.phase === 'roll' ? (
            <button onClick={() => lobby.send({ type: 'roll' })} className="btn-primary h-12 max-w-44">
              Roll the dice
            </button>
          ) : (
            <p className="text-sm font-bold text-perx-light">Tap a glowing token</p>
          )
        ) : (
          <p className="text-sm text-ink-400">
            {turnPlayer?.key === lobby.you ? '' : `${turnPlayer?.nickname ?? 'Someone'} is ${state.phase === 'roll' ? 'rolling' : 'moving'}…`}
          </p>
        )}
      </div>
      {me && (
        <p className="text-center text-xs text-ink-500">
          Roll a 6 to leave the yard · 6 rolls again · ★ squares are safe
        </p>
      )}
    </div>
  );
}
