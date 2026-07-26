'use client';

import { useState } from 'react';
import { TopBar } from '@/components/TopBar';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setDone(true);
  }

  return (
    <main className="px-4 animate-fade-up">
      <TopBar back="/login" title="Reset password" />
      {done ? (
        <p className="mt-6 text-ink-400">
          If that email has an account, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <input
            className="input"
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn-primary">Send reset link</button>
        </form>
      )}
    </main>
  );
}
