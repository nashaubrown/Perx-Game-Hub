import crypto from 'crypto';
import { db } from './db';
import { todayMV, yesterdayMV } from './dates';

/**
 * Daily digest webhook — pushed once per venue-local day (morning, MV time)
 * to each venue's configured webhook URL, so the Perx Merchant portal can
 * store and trend Play activity without polling. Signed like every other
 * venue webhook. Idempotent via WebhookConfig.lastDigestDay.
 */

const MV_OFFSET_MS = 5 * 60 * 60 * 1000;

function mvDayRange(day: string): { start: Date; end: Date } {
  const start = new Date(new Date(`${day}T00:00:00Z`).getTime() - MV_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

async function venueDayStats(venueId: string, start: Date, end: Date) {
  const [sessions, results, redemptions, pointsAgg, interactions] = await Promise.all([
    db.gameSession.count({ where: { venueId, startedAt: { gte: start, lt: end }, endedAt: { not: null } } }),
    db.gameResult.findMany({
      where: { session: { venueId, startedAt: { gte: start, lt: end } } },
      select: { userId: true, guestId: true },
    }),
    db.redemption.count({
      where: { reward: { venueId }, status: 'VALIDATED', validatedAt: { gte: start, lt: end } },
    }),
    db.pointsLedger.aggregate({
      where: { venueId, createdAt: { gte: start, lt: end }, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    db.interactionEvent.groupBy({
      by: ['type'],
      where: { venueId, createdAt: { gte: start, lt: end } },
      _count: true,
    }),
  ]);
  const players = new Set(
    results.map((r) => (r.userId ? `u:${r.userId}` : r.guestId ? `g:${r.guestId}` : '')).filter(Boolean)
  );
  const guests = new Set(results.filter((r) => r.guestId).map((r) => `g:${r.guestId}`));
  return {
    gamesFinished: sessions,
    uniquePlayers: players.size,
    guestPlayers: guests.size,
    redemptionsValidated: redemptions,
    pointsEarned: pointsAgg._sum.amount ?? 0,
    invitesShared: interactions.find((i) => i.type === 'share_invite')?._count ?? 0,
    signupPromptsShown: interactions.find((i) => i.type === 'signup_prompt_shown')?._count ?? 0,
  };
}

/** Send digests for venues that haven't received today's yet. Returns per-venue outcomes. */
export async function sendDailyDigests(force = false) {
  const today = todayMV();
  const yesterday = yesterdayMV();
  const configs = await db.webhookConfig.findMany({
    where: { enabled: true, ...(force ? {} : { NOT: { lastDigestDay: today } }) },
    include: { venue: { select: { id: true, name: true, externalMerchantId: true } } },
  });

  const outcomes: { venue: string; ok: boolean; error?: string }[] = [];
  for (const config of configs) {
    const { start, end } = mvDayRange(yesterday);
    const stats = await venueDayStats(config.venueId, start, end);
    // same day last week, so the portal can show "vs last Tuesday"
    const lastWeekDay = new Date(new Date(`${yesterday}T00:00:00Z`).getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const lw = mvDayRange(lastWeekDay);
    const lastWeek = await venueDayStats(config.venueId, lw.start, lw.end);

    const body = JSON.stringify({
      event: 'daily_digest',
      venueId: config.venueId,
      merchantId: config.venue.externalMerchantId,
      day: yesterday,
      stats,
      sameDayLastWeek: lastWeek,
      at: new Date().toISOString(),
    });
    const signature = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Perx-Event': 'daily_digest',
          'X-Perx-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await db.webhookConfig.update({ where: { id: config.id }, data: { lastDigestDay: today } });
      outcomes.push({ venue: config.venue.name, ok: true });
    } catch (err) {
      // leave lastDigestDay unset — the hourly job retries later today
      outcomes.push({ venue: config.venue.name, ok: false, error: (err as Error).message });
    }
  }
  return outcomes;
}
