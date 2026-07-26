'use client';

import { useState } from 'react';
import { TopBar } from '@/components/TopBar';

/** Staff screen: enter the customer's 6-digit code, confirm the reward. */
export default function ValidatePage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string; sub?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function validate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const res = await fetch('/api/merchant/redeem/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setResult({ ok: true, text: `✓ ${data.reward}`, sub: `${data.customer} · ${data.pointsDeducted} points deducted` });
      setCode('');
    } else {
      setResult({ ok: false, text: data.error ?? 'Validation failed.' });
    }
  }

  return (
    <main className="px-4 animate-fade-up">
      <TopBar back="/merchant" title="Validate a redemption" />
      <form onSubmit={validate} className="mt-8 flex flex-col gap-4">
        <input
          className="input h-16 text-center font-mono text-3xl font-black tracking-[0.3em]"
          placeholder="000000"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <button className="btn-primary" disabled={busy || code.length !== 6}>
          {busy ? 'Checking…' : 'Validate code'}
        </button>
      </form>
      {result && (
        <div
          className={`card mt-6 p-5 text-center animate-pop ${result.ok ? 'border-perx/50' : 'border-danger/50'}`}
        >
          <p className={`text-lg font-bold ${result.ok ? 'text-perx-light' : 'text-danger'}`}>{result.text}</p>
          {result.sub && <p className="mt-1 text-sm text-ink-400">{result.sub}</p>}
        </div>
      )}
    </main>
  );
}
