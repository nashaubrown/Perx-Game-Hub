'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import type { useLobby } from '@/hooks/useLobby';

type LobbyInfo = {
  game: { name: string; tagline: string; minPlayers: number; maxPlayers: number };
  venue: { name: string } | null;
  joinUrl: string;
  qr: string;
};

export function WaitingRoom({ lobby }: { lobby: ReturnType<typeof useLobby> }) {
  const state = lobby.state!;
  const [info, setInfo] = useState<LobbyInfo | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    fetch(`/api/lobbies/${state.code}`)
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, [state.code]);

  const isHost = lobby.you === state.hostKey;
  const enough = info ? state.players.length >= info.game.minPlayers : state.players.length >= 2;

  async function share() {
    const url = info?.joinUrl ?? location.href;
    if (navigator.share) {
      navigator.share({ title: 'Join my Perx Play game', text: `Code: ${state.code}`, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
    }
  }

  return (
    <div className="flex flex-col gap-5 pt-6 animate-fade-up">
      <div className="text-center">
        <p className="text-sm text-ink-400">
          {info?.game.name ?? 'Loading…'}
          {info?.venue && <> · playing at <span className="text-perx-light">{info.venue.name}</span></>}
        </p>
        <button
          onClick={() => setShowQR(!showQR)}
          className="mt-2 inline-block rounded-lg bg-white/10 px-6 py-3 font-mono text-4xl font-black tracking-[0.3em]"
        >
          {state.code}
        </button>
        <p className="mt-2 text-xs text-ink-500">Friends join at /join with this code — tap it for a QR</p>
      </div>

      {showQR && info && (
        <div className="mx-auto animate-pop rounded-xl bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={info.qr} alt={`QR code to join lobby ${state.code}`} className="h-56 w-56" />
        </div>
      )}

      <div className="card p-4">
        <p className="mb-3 text-sm font-bold text-ink-400">
          {state.players.length} at the table
          {info && <span className="font-normal"> · {info.game.minPlayers}–{info.game.maxPlayers} players</span>}
        </p>
        <ul className="flex flex-col gap-3">
          {state.players.map((p) => (
            <li key={p.key} className="flex items-center gap-3">
              <Avatar name={p.nickname} size={36} />
              <span className="flex-1 font-medium">
                {p.nickname}
                {p.isHost && <span className="ml-2 rounded-full bg-perx/20 px-2 py-0.5 text-xs font-bold text-perx-light">host</span>}
              </span>
              <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-perx' : 'bg-ink-500'}`} />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        {isHost ? (
          <>
            <button
              className="btn-primary"
              disabled={!enough}
              onClick={() => lobby.start((res: any) => res?.error && setStartError(res.error))}
            >
              {enough ? 'Start the game' : `Waiting for players (${info?.game.minPlayers ?? 2} needed)`}
            </button>
            {startError && <p className="text-center text-sm text-danger">{startError}</p>}
          </>
        ) : (
          <p className="text-center text-sm text-ink-400">Waiting for the host to start…</p>
        )}
        <button onClick={share} className="btn-ghost">
          Share invite link
        </button>
        <Link href="/" onClick={() => lobby.leave()} className="py-2 text-center text-sm text-ink-500">
          Leave lobby
        </Link>
      </div>
    </div>
  );
}
