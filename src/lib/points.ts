import { db } from './db';

/**
 * Every award is an immutable ledger row — balance is always SUM(amount).
 * All awards happen server-side with per-reason daily caps so nothing can
 * be farmed from the client.
 */

export const POINTS = {
  GAME_PLAYED: 10,
  GAME_WON: 50,
  SOLO_PLAYED: 5,
  DAILY_SOLVED: 30,
  DAILY_STREAK_BONUS: 10, // per day of streak, capped below
  READING_PER_5_MIN: 5,
  READING_DAILY_CAP: 60, // max reading points per day
  SOLO_DAILY_CAP: 50, // max points/day from solo games (excl. daily puzzle)
  SIGNUP_BONUS: 25,
};

type AwardInput = {
  userId?: string | null;
  guestId?: string | null;
  amount: number;
  reason: string;
  refType?: string;
  refId?: string;
  venueId?: string | null;
};

export async function award(input: AwardInput) {
  if (!input.userId && !input.guestId) return null;
  if (input.amount === 0) return null;
  return db.pointsLedger.create({
    data: {
      userId: input.userId ?? undefined,
      guestId: input.guestId ?? undefined,
      amount: Math.trunc(input.amount),
      reason: input.reason,
      refType: input.refType,
      refId: input.refId,
      venueId: input.venueId ?? undefined,
    },
  });
}

export async function balanceOf(userId: string): Promise<number> {
  const agg = await db.pointsLedger.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** Sum of points a user earned today for a given reason (for daily caps). */
export async function earnedToday(userId: string, reason: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const agg = await db.pointsLedger.aggregate({
    where: { userId, reason, createdAt: { gte: start }, amount: { gt: 0 } },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** When a guest signs up, move their ledger + results onto the new account. */
export async function convertGuest(guestId: string, userId: string) {
  await db.$transaction([
    db.pointsLedger.updateMany({ where: { guestId }, data: { userId } }),
    db.gameResult.updateMany({ where: { guestId }, data: { userId } }),
    db.guestSession.update({ where: { id: guestId }, data: { convertedUserId: userId } }),
  ]);
}
