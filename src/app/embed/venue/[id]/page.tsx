'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

/**
 * Embeddable venue insights — chromeless page for the Perx Merchant portal
 * to iframe until it renders the API natively:
 *
 *   <iframe src="https://play.perx.mv/embed/venue/VENUE_ID?token=ANALYTICS_TOKEN" />
 *
 * Auth is the venue's analytics bearer token passed as ?token= (same
 * credential the portal already uses server-side). Shows counts AND
 * deltas vs the previous period, plus the per-customer table with churn
 * signals.
 */

type Analytics = {
  windowDays: number;
  gamesPlayed: number;
  uniquePlayers: number;
  lobbiesHosted: number;
  repeatVisitors: number;
  pointsEarned: number;
  peakHours: number[][];
  gamesByType: Record<string, number>;
  interactions?: { invitesShared: number; guestSignupPrompts: number; rewardRedeemTaps: number };
  previous?: { gamesPlayed: number; uniquePlayers: number; lobbiesHosted: number; pointsEarned: number };
};

type Customer = {
  perxUserId: string | null;
  handle: string;
  gamesPlayed: number;
  daysSinceLastPlay: number;
  playsPerWeek: number;
  avgGroupSize: number;
  redemptions: number;
  invitesSent: number;
  churnSignal: 'active' | 'cooling' | 'at_risk';
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CHURN_STYLE = {
  active: 'bg-perx/20 text-perx-light',
  cooling: 'bg-warning/20 text-warning',
  at_risk: 'bg-danger/20 text-danger',
};

function Delta({ now, prev }: { now: number; prev?: number }) {
  if (prev === undefined) return null;
  if (prev === 0 && now === 0) return <span className="text-xs text-ink-500">—</span>;
  const pct = prev === 0 ? 100 : Math.round(((now - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <span className={`text-xs font-bold ${up ? 'text-perx-light' : 'text-danger'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

function EmbedInner() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get('token') ?? '';
  const [data, setData] = useState<Analytics | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`/api/v1/venues/${id}/analytics`, { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject('Invalid embed token')))
      .then(setData)
      .catch((e) => setError(String(e)));
    fetch(`/api/v1/venues/${id}/customers?days=90`, { headers })
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => {});
  }, [id, token]);

  if (error) return <p className="p-6 text-center text-sm text-danger">{error}</p>;
  if (!data) return <p className="p-6 text-center text-sm text-ink-400 animate-pulse">Loading Play insights…</p>;

  // busiest slot sentence — merchants respond to conclusions, not heatmaps
  let peak = { day: 0, hour: 0, n: 0 };
  data.peakHours.forEach((hours, d) =>
    hours.forEach((n, h) => {
      if (n > peak.n) peak = { day: d, hour: h, n };
    })
  );

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold">Perx Play at your venue <span className="font-normal text-ink-500">· last {data.windowDays} days</span></p>
        {peak.n > 0 && (
          <p className="text-xs text-ink-400">
            Busiest: <span className="font-bold text-perx-light">{DAYS[peak.day]} {peak.hour}:00</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['Games played', data.gamesPlayed, data.previous?.gamesPlayed],
            ['Unique players', data.uniquePlayers, data.previous?.uniquePlayers],
            ['Lobbies hosted', data.lobbiesHosted, data.previous?.lobbiesHosted],
            ['Points earned', data.pointsEarned, data.previous?.pointsEarned],
          ] as const
        ).map(([label, now, prev]) => (
          <div key={label} className="card p-3">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-2xl font-black">{now}</p>
              <Delta now={now} prev={prev} />
            </div>
            <p className="text-[11px] text-ink-500">{label}</p>
          </div>
        ))}
      </div>

      {data.interactions && (
        <p className="mt-3 text-xs text-ink-400">
          {data.interactions.invitesShared} invites shared from your tables · {data.interactions.guestSignupPrompts}{' '}
          new guests prompted to join Perx · {data.interactions.rewardRedeemTaps} reward taps
        </p>
      )}

      <div className="card mt-4 overflow-x-auto p-3">
        <p className="mb-2 text-sm font-bold">Your players <span className="font-normal text-ink-500">· 90 days</span></p>
        {customers.length === 0 ? (
          <p className="text-sm text-ink-500">No registered players yet — guests appear once they create accounts.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-ink-500">
              <tr>
                <th className="py-1 pr-2 font-medium">Customer</th>
                <th className="py-1 pr-2 font-medium">Games</th>
                <th className="py-1 pr-2 font-medium">Last played</th>
                <th className="py-1 pr-2 font-medium">Per week</th>
                <th className="py-1 pr-2 font-medium">Group</th>
                <th className="py-1 pr-2 font-medium">Redeemed</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.slice(0, 20).map((c) => (
                <tr key={c.handle} className="border-t border-white/5">
                  <td className="py-1.5 pr-2 font-bold">
                    {c.handle}
                    {!c.perxUserId && <span className="ml-1 font-normal text-ink-600">(unlinked)</span>}
                  </td>
                  <td className="py-1.5 pr-2 font-mono">{c.gamesPlayed}</td>
                  <td className="py-1.5 pr-2">{c.daysSinceLastPlay === 0 ? 'today' : `${c.daysSinceLastPlay}d ago`}</td>
                  <td className="py-1.5 pr-2 font-mono">{c.playsPerWeek}</td>
                  <td className="py-1.5 pr-2 font-mono">{c.avgGroupSize}</td>
                  <td className="py-1.5 pr-2 font-mono">{c.redemptions}</td>
                  <td className="py-1.5">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${CHURN_STYLE[c.churnSignal]}`}>
                      {c.churnSignal.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function EmbedVenuePage() {
  return (
    <Suspense>
      <EmbedInner />
    </Suspense>
  );
}
