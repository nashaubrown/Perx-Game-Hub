'use client';

import { useEffect, useState } from 'react';
import type { useLobby } from '@/hooks/useLobby';
import { Countdown } from './Countdown';
import { Scoreboard } from './Scoreboard';

type Round = { round: number; total: number; presenterKey: string; presenterName?: string; phase: string; endsAt: number };
type Board = { emojis: string; wordCount: number; category: string; endsAt: number };
type Chat = { key: string; nickname: string; text: string; correct: boolean }[];

const EMOJI_PALETTE = [
  '😀','😂','😍','😎','🤔','😱','🥳','😴','🤤','🥶','🤯','👻','💀','👽','🤖','❤️','💔','⭐','🔥','💧','⚡','🌈','☀️','🌙','🌊','🏝️','🌴','🐟','🦈','🐢','🐙','🦀','🐦','🐔','🐄','🍕','🍔','🍟','🍚','🍜','🍞','🧀','🥭','🍌','🍓','🍰','🍦','☕','🧃','🥤','🍽️','👨‍🍳','🏃','💃','🏊','🚗','✈️','🚤','⛵','🏠','🏖️','⛰️','🎬','🎵','🎮','⚽','🏀','📱','💻','📚','💰','🎁','👑','💍','🔑','🕐','🌧️','❄️','💨','🙈','💤','🎂','🎉','🕷️','🦁','🐘','🎸','🥁','🔫','🗡️','🧙','🧜‍♀️','🧛','🦸','📺','📰','🛍️','🛒','📞','🔋','🪫','🚦','🧊','🧠'
];

export function EmojiView({ lobby }: { lobby: ReturnType<typeof useLobby> }) {
  const [round, setRound] = useState<Round | null>(null);
  const [options, setOptions] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [composed, setComposed] = useState('');
  const [board, setBoard] = useState<Board | null>(null);
  const [chat, setChat] = useState<Chat>([]);
  const [guess, setGuess] = useState('');
  const [revealData, setRevealData] = useState<{ phrase: string; scoreboard: any[] } | null>(null);

  const { on } = lobby;
  useEffect(() => {
    on('emoji:round', (r: Round) => {
      setRound(r);
      setOptions(null);
      setPicked(null);
      setComposed('');
      setBoard(null);
      setChat([]);
      setRevealData(null);
    });
    on('emoji:options', (p: { options: string[] }) => setOptions(p.options));
    on('emoji:board', (b: Board) => setBoard(b));
    on('emoji:chat', (p: { chat: Chat }) => setChat(p.chat));
    on('emoji:reveal', (p: { phrase: string; scoreboard: any[] }) => setRevealData(p));
  }, [on]);

  if (!round) return <p className="pt-24 text-center text-ink-400 animate-pulse">Setting up rounds…</p>;

  const isPresenter = lobby.you === round.presenterKey;

  if (revealData) {
    return (
      <div className="flex flex-col gap-4 pt-8 text-center animate-fade-up">
        <p className="text-sm text-ink-400">The phrase was</p>
        <p className="font-display text-3xl font-black capitalize">{revealData.phrase}</p>
        <Scoreboard entries={revealData.scoreboard} you={lobby.you} />
      </div>
    );
  }

  // presenter: choose phrase + compose emojis
  if (isPresenter && !board) {
    return (
      <div className="flex flex-col gap-4 pt-6 animate-fade-up">
        <div className="flex items-center justify-between text-sm text-ink-400">
          <span>Round {round.round + 1}/{round.total} · you present</span>
          <Countdown endsAt={round.endsAt} />
        </div>
        {!options ? (
          <p className="text-center text-ink-400 animate-pulse">Getting your phrases…</p>
        ) : picked === null ? (
          <>
            <h2 className="font-display text-xl font-black">Pick a phrase to act out in emojis</h2>
            {options.map((opt, i) => (
              <button key={i} onClick={() => setPicked(i)} className="card p-4 text-left font-bold capitalize active:bg-white/10">
                {opt}
              </button>
            ))}
          </>
        ) : (
          <>
            <p className="text-sm text-ink-400">
              Your phrase: <span className="font-bold capitalize text-white">{options[picked]}</span>
            </p>
            <div className="flex min-h-14 items-center justify-center rounded-md bg-white/5 px-3 text-3xl tracking-wide">
              {composed || <span className="text-sm text-ink-500">Tap emojis below</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setComposed('')} className="btn-ghost h-11 flex-1 text-sm">Clear</button>
              <button
                onClick={() => lobby.send({ type: 'pick', option: picked, emojis: composed })}
                disabled={!composed}
                className="btn-primary h-11 flex-[2] text-sm"
              >
                Show the table
              </button>
            </div>
            <div className="card grid max-h-64 grid-cols-8 gap-1 overflow-y-auto p-2">
              {EMOJI_PALETTE.map((e) => (
                <button key={e} onClick={() => setComposed((c) => (c + e).slice(0, 32))} className="rounded p-1 text-2xl active:bg-white/20">
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // waiting for presenter
  if (!board) {
    return (
      <div className="flex flex-col items-center gap-4 pt-24 text-center animate-fade-up">
        <p className="text-5xl">🤫</p>
        <p className="font-bold">{round.presenterName ?? 'Someone'} is picking emojis…</p>
        <Countdown endsAt={round.endsAt} />
      </div>
    );
  }

  // guessing phase
  return (
    <div className="flex min-h-dvh flex-col gap-3 pt-4 pb-4 animate-fade-up">
      <div className="flex items-center justify-between text-sm text-ink-400">
        <span>
          {round.presenterName} · {board.category} · {board.wordCount} word{board.wordCount > 1 ? 's' : ''}
        </span>
        <Countdown endsAt={board.endsAt} />
      </div>

      <div className="flex min-h-24 items-center justify-center rounded-lg bg-white/5 px-4 text-5xl leading-snug tracking-wider">
        {board.emojis}
      </div>

      <div className="card flex-1 space-y-1.5 overflow-y-auto p-3 text-sm">
        {chat.length === 0 && <p className="text-ink-500">Guesses show up here…</p>}
        {chat.map((c, i) => (
          <p key={i} className={c.correct ? 'font-bold text-perx-light' : ''}>
            <span className="font-bold">{c.nickname}:</span> {c.text}
          </p>
        ))}
      </div>

      {isPresenter ? (
        <p className="text-center text-sm text-ink-400">You earn 25 pts per correct guess — root for them!</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (guess.trim()) lobby.send({ type: 'guess', text: guess.trim() });
            setGuess('');
          }}
          className="flex gap-2"
        >
          <input
            className="input h-11 flex-1"
            placeholder="Type your guess…"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            autoComplete="off"
          />
          <button className="btn-primary h-11 w-20 text-sm">Guess</button>
        </form>
      )}
    </div>
  );
}
