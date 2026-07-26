'use client';

import { useEffect, useMemo, useState } from 'react';
import type { useLobby } from '@/hooks/useLobby';

type ChessState = {
  fen: string;
  turnKey: string;
  whiteKey: string;
  blackKey: string;
  inCheck: boolean;
  lastMove: { from: string; to: string } | null;
  moveCount: number;
  moves: { from: string; to: string; promotion?: string }[];
};

const GLYPHS: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
};

const FILES = 'abcdefgh';

/** Parse the board section of a FEN into a map of square → piece code. */
function parseFen(fen: string): Record<string, string> {
  const board: Record<string, string> = {};
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else {
        const square = FILES[file] + (8 - r);
        board[square] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase();
        file++;
      }
    }
  });
  return board;
}

export function ChessView({ lobby }: { lobby: ReturnType<typeof useLobby> }) {
  const [state, setState] = useState<ChessState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const { on } = lobby;
  useEffect(() => {
    on('chess:state', (s: ChessState) => {
      setState(s);
      setSelected(null);
    });
  }, [on]);

  const board = useMemo(() => (state ? parseFen(state.fen) : {}), [state]);

  if (!state) return <p className="pt-24 text-center text-ink-400 animate-pulse">Setting up the board…</p>;

  const iAmBlack = lobby.you === state.blackKey;
  const myTurn = lobby.you === state.turnKey;
  const opponentKey = iAmBlack ? state.whiteKey : state.blackKey;
  const opponent = lobby.state?.players.find((p) => p.key === opponentKey);

  // ranks/files ordered from the viewer's side
  const ranks = iAmBlack ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = iAmBlack ? [...FILES].reverse() : [...FILES];

  const targets = selected ? state.moves.filter((m) => m.from === selected).map((m) => m.to) : [];
  const myPrefix = iAmBlack ? 'b' : 'w';

  function tap(square: string) {
    if (!myTurn) return;
    if (selected && targets.includes(square)) {
      lobby.send({ type: 'move', from: selected, to: square, promotion: 'q' });
      setSelected(null);
      return;
    }
    setSelected(board[square]?.startsWith(myPrefix) ? square : null);
  }

  return (
    <div className="flex flex-col gap-3 pt-4 animate-fade-up">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-400">
          vs <span className="font-bold text-white">{opponent?.nickname ?? '…'}</span>
          {opponent && !opponent.connected && <span className="text-warning"> (reconnecting)</span>}
        </span>
        <span className={`font-bold ${myTurn ? 'text-perx-light' : 'text-ink-500'}`}>
          {myTurn ? (state.inCheck ? 'Your move — check!' : 'Your move') : state.inCheck ? 'Check!' : 'Their move'}
        </span>
      </div>

      <div className="mx-auto grid w-full max-w-[352px] grid-cols-8 overflow-hidden rounded-md border border-white/15">
        {ranks.map((rank) =>
          files.map((file) => {
            const square = file + rank;
            const piece = board[square];
            const dark = (FILES.indexOf(file) + rank) % 2 === 0;
            const isLast = state.lastMove && (state.lastMove.from === square || state.lastMove.to === square);
            const isTarget = targets.includes(square);
            return (
              <button
                key={square}
                onClick={() => tap(square)}
                className={`relative flex aspect-square items-center justify-center text-[26px] leading-none transition-colors duration-[160ms] ${
                  dark ? 'bg-[#3D4A3E]' : 'bg-[#9CA88F]'
                } ${selected === square ? '!bg-perx' : ''} ${isLast ? 'ring-2 ring-inset ring-warning/70' : ''}`}
              >
                {piece && (
                  <span className={piece.startsWith('w') ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]' : 'text-ink-950'}>
                    {GLYPHS[piece]}
                  </span>
                )}
                {isTarget && (
                  <span
                    className={`absolute inset-0 m-auto rounded-full ${
                      piece ? 'h-full w-full ring-4 ring-inset ring-perx/80' : 'h-3 w-3 bg-perx/80'
                    }`}
                  />
                )}
              </button>
            );
          })
        )}
      </div>

      <p className="text-center text-xs text-ink-500">
        Move {Math.floor(state.moveCount / 2) + 1} · pawns promote to queens · you play {iAmBlack ? 'black' : 'white'}
      </p>

      <button
        onClick={() => {
          if (confirm('Resign this game?')) lobby.send({ type: 'resign' });
        }}
        className="mx-auto text-sm text-ink-500 underline-offset-2 active:underline"
      >
        Resign
      </button>
    </div>
  );
}
