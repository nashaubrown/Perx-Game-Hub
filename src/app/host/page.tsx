'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { useMe } from '@/hooks/useMe';

type Game = { id: string; name: string; tagline: string; multi: boolean; minPlayers: number; maxPlayers: number };
type Venue = { id: string; name: string; location: string | null };

const GAME_ICONS: Record<string, string> = {
  trivia: '🧠',
  wordrush: '🔤',
  emoji: '😜',
  chess: '♟️',
  rummy: '🃏',
  ludo: '🎲',
};

export default function HostPage() {
  const router = useRouter();
  const me = useMe();
  const [games, setGames] = useState<Game[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [gameId, setGameId] = useState('trivia');
  const [venueId, setVenueId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/games').then((r) => r.json()).then((d) => setGames((d.games ?? []).filter((g: Game) => g.multi)));
    fetch('/api/venues').then((r) => r.json()).then((d) => setVenues(d.venues ?? []));
  }, []);

  useEffect(() => {
    if (me === null) router.replace('/login');
  }, [me, router]);

  async function host() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/lobbies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, venueId: venueId || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? 'Could not create the lobby.');
    router.push(`/lobby/${data.code}`);
  }

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar back="/" title="Host a game" />

      <div className="mt-4 flex flex-col gap-3">
        {games.map((g) => (
          <button
            key={g.id}
            onClick={() => setGameId(g.id)}
            className={`card flex items-center gap-4 p-4 text-left transition-colors duration-[160ms] ${
              gameId === g.id ? 'border-perx bg-perx/10' : ''
            }`}
          >
            <span className="text-3xl">{GAME_ICONS[g.id] ?? '🎮'}</span>
            <div className="flex-1">
              <p className="font-bold">{g.name}</p>
              <p className="text-sm text-ink-400">{g.tagline}</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {g.minPlayers}–{g.maxPlayers} players
              </p>
            </div>
            <span
              className={`h-5 w-5 rounded-full border-2 ${
                gameId === g.id ? 'border-perx bg-perx' : 'border-white/30'
              }`}
            />
          </button>
        ))}
      </div>

      <div className="mt-6">
        <label className="mb-2 block text-sm font-bold text-ink-400">Where are you playing?</label>
        <select className="input appearance-none" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          <option value="">No venue — just playing</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.location ? ` — ${v.location}` : ''}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <button onClick={host} disabled={busy} className="btn-primary mt-6">
        {busy ? 'Creating lobby…' : 'Create lobby'}
      </button>
    </main>
  );
}
