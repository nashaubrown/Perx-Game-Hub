'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';

type Venue = {
  id: string;
  name: string;
  location: string | null;
  analyticsToken: string;
  webhook: { url: string; enabled: boolean } | null;
};

type Analytics = {
  lobbiesHosted: number;
  gamesPlayed: number;
  uniquePlayers: number;
  repeatVisitors: number;
  gamesByType: Record<string, number>;
  sessionsPerDay: Record<string, number>;
  peakHours: number[][];
  pointsEarned: number;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MerchantPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState('');
  const [data, setData] = useState<Analytics | null>(null);
  const [denied, setDenied] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookMsg, setWebhookMsg] = useState('');

  useEffect(() => {
    fetch('/api/merchant/venues')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        setVenues(d.venues ?? []);
        if (d.venues?.[0]) setVenueId(d.venues[0].id);
      })
      .catch(() => setDenied(true));
  }, []);

  useEffect(() => {
    if (!venueId) return;
    setData(null);
    const v = venues.find((x) => x.id === venueId);
    setWebhookUrl(v?.webhook?.url ?? '');
    fetch(`/api/merchant/venues/${venueId}/analytics`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [venueId, venues]);

  if (denied) {
    return (
      <main className="px-4 animate-fade-up">
        <TopBar back="/" title="Merchant" />
        <p className="mt-8 text-center text-ink-400">
          This area is for venue owners. <Link href="/login" className="font-bold text-perx-light">Log in</Link>{' '}
          with a merchant account (demo: @meraki / perxplay).
        </p>
      </main>
    );
  }

  const venue = venues.find((v) => v.id === venueId);
  const days = data ? Object.entries(data.sessionsPerDay).sort(([a], [b]) => a.localeCompare(b)).slice(-14) : [];
  const maxDay = Math.max(1, ...days.map(([, n]) => n));
  const peakMax = data ? Math.max(1, ...data.peakHours.flat()) : 1;

  async function saveWebhook() {
    setWebhookMsg('');
    const res = await fetch('/api/merchant/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, url: webhookUrl }),
    });
    const d = await res.json();
    setWebhookMsg(res.ok ? (d.removed ? 'Webhook removed.' : 'Saved. Events are signed with your secret.') : d.error);
  }

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar back="/" title="Merchant dashboard" />

      {venues.length > 1 && (
        <select className="input mb-4 appearance-none" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      )}

      <div className="mb-4 flex gap-2">
        <Link href="/merchant/validate" className="btn-primary h-11 flex-1 text-sm">Validate a code</Link>
        <Link href={`/merchant/rewards?venueId=${venueId}`} className="btn-ghost h-11 flex-1 text-sm">Manage rewards</Link>
      </div>

      {!data ? (
        <p className="pt-12 text-center text-ink-400 animate-pulse">Crunching the numbers…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['Games played', data.gamesPlayed, 'grad-number'],
                ['Unique players', data.uniquePlayers, 'grad-number-electric'],
                ['Lobbies hosted', data.lobbiesHosted, 'grad-number-electric'],
                ['Repeat visitors', data.repeatVisitors, 'grad-number'],
              ] as const
            ).map(([label, value, cls]) => (
              <div key={label} className="card p-4">
                <p className={`font-display text-3xl font-black ${cls}`}>{value}</p>
                <p className="text-xs text-ink-500">{label} · 30d</p>
              </div>
            ))}
          </div>

          <div className="card p-4">
            <p className="mb-3 text-sm font-bold">Games per day <span className="font-normal text-ink-500">· last 14 days</span></p>
            {days.length === 0 ? (
              <p className="text-sm text-ink-500">No games yet — put the table QR out and watch this fill up.</p>
            ) : (
              <div className="flex h-24 items-end gap-1">
                {days.map(([day, n]) => (
                  <div key={day} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t-sm bg-perx" style={{ height: `${(n / maxDay) * 100}%`, minHeight: 2 }} />
                    <span className="text-[8px] text-ink-500">{day.slice(8)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4">
            <p className="mb-3 text-sm font-bold">Peak play hours</p>
            <div className="flex flex-col gap-1">
              {data.peakHours.map((hours, d) => (
                <div key={d} className="flex items-center gap-1">
                  <span className="w-8 text-[10px] text-ink-500">{DAYS[d]}</span>
                  {hours.map((n, h) => (
                    <div
                      key={h}
                      className="h-3 flex-1 rounded-[2px]"
                      style={{ backgroundColor: n ? `rgba(52,199,89,${0.25 + 0.75 * (n / peakMax)})` : 'rgba(255,255,255,0.05)' }}
                      title={`${DAYS[d]} ${h}:00 — ${n}`}
                    />
                  ))}
                </div>
              ))}
              <div className="ml-8 flex justify-between text-[9px] text-ink-500"><span>12am</span><span>12pm</span><span>11pm</span></div>
            </div>
          </div>

          <div className="card p-4">
            <p className="mb-2 text-sm font-bold">Games by type</p>
            {Object.entries(data.gamesByType).map(([name, n]) => (
              <div key={name} className="mb-1 flex items-center justify-between text-sm">
                <span>{name}</span>
                <span className="font-mono font-bold">{n}</span>
              </div>
            ))}
            <p className="mt-3 border-t border-white/10 pt-2 text-sm">
              Points earned here: <span className="font-display font-black text-perx-light">{data.pointsEarned}</span>
            </p>
          </div>

          <div className="card p-4">
            <p className="mb-2 text-sm font-bold">Perx platform integration</p>
            <p className="mb-2 text-xs text-ink-500">
              GET /api/v1/venues/{venueId}/analytics with this bearer token:
            </p>
            <button
              onClick={() => setShowToken(!showToken)}
              className="w-full truncate rounded-md bg-white/5 px-3 py-2 text-left font-mono text-xs"
            >
              {showToken ? venue?.analyticsToken : '••••••••••••  (tap to reveal)'}
            </button>
            <p className="mb-2 mt-4 text-xs text-ink-500">
              Webhook URL — we POST game_started, game_finished, player_joined:
            </p>
            <div className="flex gap-2">
              <input
                className="input h-10 flex-1 text-sm"
                placeholder="https://your-server/hooks/perx-play"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <button onClick={saveWebhook} className="rounded-md bg-perx px-3 text-sm font-bold text-ink-950">Save</button>
            </div>
            {webhookMsg && <p className="mt-2 text-xs text-perx-light">{webhookMsg}</p>}
          </div>
        </div>
      )}
    </main>
  );
}
