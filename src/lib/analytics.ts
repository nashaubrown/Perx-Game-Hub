import { db } from './db';

/**
 * Venue engagement analytics — used by the merchant dashboard AND the
 * token-authed /api/v1/venues/:id/analytics endpoint the main Perx platform
 * consumes. One computation, two doors.
 */
export async function venueAnalytics(venueId: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sessions = await db.gameSession.findMany({
    where: { venueId, startedAt: { gte: since } },
    include: { results: true, game: { select: { name: true } } },
  });

  const lobbies = await db.lobby.count({ where: { venueId, createdAt: { gte: since } } });

  // unique + repeat players (identified users and guests both count)
  const playerSessions = new Map<string, number>();
  for (const s of sessions) {
    const seen = new Set<string>();
    for (const r of s.results) {
      const key = r.userId ? `user:${r.userId}` : r.guestId ? `guest:${r.guestId}` : null;
      if (key && !seen.has(key)) {
        seen.add(key);
        playerSessions.set(key, (playerSessions.get(key) ?? 0) + 1);
      }
    }
  }
  const uniquePlayers = playerSessions.size;
  const repeatVisitors = [...playerSessions.values()].filter((n) => n > 1).length;

  // games played by type
  const gamesByType: Record<string, number> = {};
  for (const s of sessions) {
    gamesByType[s.game.name] = (gamesByType[s.game.name] ?? 0) + 1;
  }

  // sessions per day (for the "over time" chart)
  const perDay: Record<string, number> = {};
  for (const s of sessions) {
    const day = s.startedAt.toISOString().slice(0, 10);
    perDay[day] = (perDay[day] ?? 0) + 1;
  }

  // peak play hours: [dayOfWeek 0-6][hour 0-23] counts (venue-local UTC+5)
  const peakHours: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const s of sessions) {
    const local = new Date(s.startedAt.getTime() + 5 * 60 * 60 * 1000);
    peakHours[local.getUTCDay()][local.getUTCHours()]++;
  }

  const pointsAgg = await db.pointsLedger.aggregate({
    where: { venueId, createdAt: { gte: since }, amount: { gt: 0 } },
    _sum: { amount: true },
  });

  // venue-scoped interaction events (shares from this venue's lobbies,
  // signup prompts after games here, taps on this venue's rewards)
  const interactionRows = await db.interactionEvent.groupBy({
    by: ['type'],
    where: { venueId, createdAt: { gte: since } },
    _count: true,
  });
  const interactionActors = await db.interactionEvent.findMany({
    where: { venueId, createdAt: { gte: since } },
    distinct: ['actorKey'],
    select: { id: true },
  });
  const interactions = {
    byType: Object.fromEntries(interactionRows.map((r) => [r.type, r._count])),
    uniqueActors: interactionActors.length,
    invitesShared: interactionRows.find((r) => r.type === 'share_invite')?._count ?? 0,
    guestSignupPrompts: interactionRows.find((r) => r.type === 'signup_prompt_shown')?._count ?? 0,
    rewardRedeemTaps: interactionRows.find((r) => r.type === 'redeem_tap')?._count ?? 0,
  };

  return {
    venueId,
    windowDays: days,
    lobbiesHosted: lobbies,
    gamesPlayed: sessions.length,
    uniquePlayers,
    repeatVisitors,
    gamesByType,
    sessionsPerDay: perDay,
    peakHours,
    pointsEarned: pointsAgg._sum.amount ?? 0,
    interactions,
  };
}
