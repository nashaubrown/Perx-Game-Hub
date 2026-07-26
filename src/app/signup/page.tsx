'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { TopBar } from '@/components/TopBar';

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const fromGame = params.get('from') === 'game';
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: handle.replace(/^@/, ''), email: email || undefined, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? 'Signup failed.');
    router.push('/');
    router.refresh();
  }

  return (
    <main className="px-4 animate-fade-up">
      <TopBar back="/" title="Create your account" />
      {fromGame && (
        <div className="card mt-4 border-perx/40 p-4 text-sm">
          <span className="font-bold text-perx-light">Nice game!</span> Sign up now and the points you
          just earned come with you.
        </div>
      )}
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <div>
          <input
            className="input"
            placeholder="@your_handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            autoCapitalize="none"
            autoComplete="username"
          />
          <p className="mt-1 text-xs text-ink-500">3–20 characters. Lowercase letters, numbers, underscores.</p>
        </div>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="input"
          type="password"
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account · +25 pts'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-400">
        Already have one?{' '}
        <Link href="/login" className="font-bold text-perx-light">
          Log in
        </Link>
      </p>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
