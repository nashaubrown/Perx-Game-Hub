'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TopBar } from '@/components/TopBar';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? 'Login failed.');
    router.push(data.role === 'MERCHANT' ? '/merchant' : '/');
    router.refresh();
  }

  return (
    <main className="px-4 animate-fade-up">
      <TopBar back="/" title="Log in" />
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <input
          className="input"
          placeholder="@handle or email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoCapitalize="none"
          autoComplete="username"
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot" className="text-ink-400">
          Forgot password?
        </Link>
        <Link href="/signup" className="font-bold text-perx-light">
          Create account
        </Link>
      </div>
    </main>
  );
}
