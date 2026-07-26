import { db } from './db';

/**
 * Venue engagement analytics — used by the merchant dashboard AND the
 * token-authed /api/v1/venues/:id/analytics endpoint the main Perx platform
 * consumes. One computation, two doors.
 */
export async function venueAnalytics(venueId: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const prevSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

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

  // previous window of the same length — powers "up/down vs last period"
  const [prevGames, prevLobbies, prevPointsAgg, prevResults] = await Promise.all([
    db.gameSession.count({ where: { venueId, startedAt: { gte: prevSince, lt: since } } }),
    db.lobby.count({ where: { venueId, createdAt: { gte: prevSince, lt: since } } }),
    db.pointsLedger.aggregate({
      where: { venueId, createdAt: { gte: prevSince, lt: since }, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    db.gameResult.findMany({
      where: { session: { venueId, startedAt: { gte: prevSince, lt: since } } },
      select: { userId: true, guestId: true },
    }),
  ]);
  const prevUnique = new Set(
    prevResults.map((r) => (r.userId ? `user:${r.userId}` : r.guestId ? `guest:${r.guestId}` : '')).filter(Boolean)
  ).size;

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
    previous: {
      gamesPlayed: prevGames,
      lobbiesHosted: prevLobbies,
      uniquePlayers: prevUnique,
      pointsEarned: prevPointsAgg._sum.amount ?? 0,
    },
  };
}

export type ChurnSignal = 'active' | 'cooling' | 'at_risk';

/**
 * Per-customer play profiles for one venue — only customers who actually
 * played venue-tagged games or redeemed there (never app-wide behavior).
 * Keyed by perxUserId where linked so the Perx Merchant portal can join them
 * to its own customer records and feed its churn model.
 */
export async function venueCustomers(venueId: string, days = 90) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const results = await db.gameResult.findMany({
    where: { session: { venueId, startedAt: { gte: since } }, userId: { not: null } },
    include: {
      user: { select: { id: true, handle: true, perxUserId: true } },
      session: { select: { startedAt: true, _count: { select: { results: true } } } },
    },
  });

  type Row = {
    userId: string;
    handle: string;
    perxUserId: string | null;
    gamesPlayed: number;
    wins: number;
    lastPlayedAt: Date;
    firstPlayedAt: Date;
    groupSizes: number[];
  };
  const byUser = new Map<string, Row>();
  for (const r of results) {
    if (!r.user) continue;
    const row = byUser.get(r.user.id) ?? {
      userId: r.user.id,
      handle: r.user.handle,
      perxUserId: r.user.perxUserId,
      gamesPlayed: 0,
      wins: 0,
      lastPlayedAt: r.session.startedAt,
      firstPlayedAt: r.session.startedAt,
      groupSizes: [],
    };
    row.gamesPlayed++;
    if (r.won) row.wins++;
    if (r.session.startedAt > row.lastPlayedAt) row.lastPlayedAt = r.session.startedAt;
    if (r.session.startedAt < row.firstPlayedAt) row.firstPlayedAt = r.session.startedAt;
    row.groupSizes.push(r.session._count.results);
    byUser.set(r.user.id, row);
  }

  const userIds = [...byUser.keys()];
  const [redemptions, invites] = await Promise.all([
    db.redemption.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, reward: { venueId }, status: 'VALIDATED' },
      _count: true,
    }),
    db.interactionEvent.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, venueId, type: 'share_invite', createdAt: { gte: since } },
      _count: true,
    }),
  ]);
  const redemptionsByUser = Object.fromEntries(redemptions.map((r) => [r.userId, r._count]));
  const invitesByUser = Object.fromEntries(invites.map((r) => [r.userId!, r._count]));

  const now = Date.now();
  return [...byUser.values()]
    .map((row) => {
      const daysSinceLastPlay = Math.floor((now - row.lastPlayedAt.getTime()) / (24 * 60 * 60 * 1000));
      const activeWeeks = Math.max(1, (now - row.firstPlayedAt.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const playsPerWeek = Math.round((row.gamesPlayed / activeWeeks) * 10) / 10;
      // simple recency signal the portal's churn model can consume or override
      const churnSignal: ChurnSignal =
        daysSinceLastPlay <= 7 ? 'active' : daysSinceLastPlay <= 21 ? 'cooling' : 'at_risk';
      return {
        perxUserId: row.perxUserId, // null until the customer links MyPerx
        handle: `@${row.handle}`,
        gamesPlayed: row.gamesPlayed,
        wins: row.wins,
        lastPlayedAt: row.lastPlayedAt,
        daysSinceLastPlay,
        playsPerWeek,
        avgGroupSize:
          Math.round((row.groupSizes.reduce((s, n) => s + n, 0) / Math.max(1, row.groupSizes.length)) * 10) / 10,
        redemptions: redemptionsByUser[row.userId] ?? 0,
        invitesSent: invitesByUser[row.userId] ?? 0,
        churnSignal,
      };
    })
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}
