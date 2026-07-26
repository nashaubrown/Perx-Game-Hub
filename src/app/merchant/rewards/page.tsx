'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';

type Redemption = {
  id: string;
  reward: string;
  costPoints: number;
  customer: string;
  status: string;
  createdAt: string;
};

function RewardsManager() {
  const venueId = useSearchParams().get('venueId') ?? '';
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<Redemption[]>([]);

  useEffect(() => {
    if (!venueId) return;
    fetch(`/api/redemptions?venueId=${venueId}`)
      .then((r) => r.json())
      .then((d) => setHistory(d.redemptions ?? []))
      .catch(() => {});
  }, [venueId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/merchant/rewards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, name, description, costPoints: Number(cost) }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error ?? 'Could not create the reward.');
    setMsg(`"${name}" is live.`);
    setName('');
    setDescription('');
    setCost('');
    router.refresh();
  }

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar back="/merchant" title="Rewards" />

      <form onSubmit={create} className="card mt-2 flex flex-col gap-3 p-4">
        <p className="text-sm font-bold">New reward</p>
        <input className="input" placeholder="Free coffee" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className="input" placeholder="Cost in points, e.g. 500" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/\D/g, ''))} />
        {msg && <p className="text-sm text-perx-light">{msg}</p>}
        <button className="btn-primary">Add reward</button>
      </form>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Redemption history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink-500">No redemptions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((r) => (
              <li key={r.id} className="card flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-bold">{r.reward}</p>
                  <p className="text-xs text-ink-500">
                    {r.customer} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`text-xs font-bold ${
                    r.status === 'VALIDATED' ? 'text-perx-light' : r.status === 'PENDING' ? 'text-warning' : 'text-ink-500'
                  }`}
                >
                  {r.status.toLowerCase()} · {r.costPoints}p
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function MerchantRewardsPage() {
  return (
    <Suspense>
      <RewardsManager />
    </Suspense>
  );
}
