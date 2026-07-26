'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { useMe } from '@/hooks/useMe';

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = params.get('code');
    if (c) setCode(c.toUpperCase());
  }, [params]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, '');
    if (clean.length !== 6) return setError('Codes are 6 characters.');

    setBusy(true);
    // guests get a lightweight session first — no account needed to play
    if (me === null) {
      if (nickname.trim().length < 2) {
        setBusy(false);
        return setError('Pick a nickname so friends know who you are.');
      }
      const res = await fetch('/api/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      if (!res.ok) {
        setBusy(false);
        return setError('Could not start a guest session. Try again.');
      }
    }
    router.push(`/lobby/${clean}`);
  }

  return (
    <main className="px-4 animate-fade-up">
      <TopBar back="/" title="Join a game" />
      <form onSubmit={join} className="mt-6 flex flex-col gap-4">
        <input
          className="input text-center font-mono text-2xl font-bold uppercase tracking-[0.4em]"
          placeholder="ABC123"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
        />
        {me === null && (
          <div>
            <input
              className="input"
              placeholder="Your nickname"
              value={nickname}
              maxLength={20}
              onChange={(e) => setNickname(e.target.value)}
            />
            <p className="mt-1 text-xs text-ink-500">
              No account needed — you can sign up after the game to keep your points.
            </p>
          </div>
        )}
        {me && <p className="text-sm text-ink-400">Joining as <span className="font-bold text-white">@{me.handle}</span></p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Joining…' : 'Join lobby'}
        </button>
      </form>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
