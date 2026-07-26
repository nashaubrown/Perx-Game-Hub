import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { award, earnedToday, POINTS } from '@/lib/points';

/**
 * Solo game completion (memory, 2048). The client reports the outcome, but
 * awards are fixed-size and hard-capped per day server-side, and scores are
 * sanity-bounded — there is nothing worth farming here.
 */
const BOUNDS: Record<string, { maxScore: number }> = {
  memory: { maxScore: 10000 },
  '2048': { maxScore: 250000 },
};

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: true, anonymous: true, pointsAwarded: 0 });

  const body = await req.json().catch(() => null);
  const gameId = String(body?.gameId ?? '');
  const bounds = BOUNDS[gameId];
  if (!bounds) return NextResponse.json({ error: 'Unknown game.' }, { status: 400 });

  const score = Math.max(0, Math.min(bounds.maxScore, Math.trunc(Number(body?.score ?? 0))));

  const session = await db.gameSession.create({
    data: { gameId, endedAt: new Date() },
  });
  await db.gameResult.create({
    data: { sessionId: session.id, userId: user.id, score, rank: 1 },
  });

  let pointsAwarded = 0;
  const alreadyToday = await earnedToday(user.id, 'solo_played');
  if (alreadyToday < POINTS.SOLO_DAILY_CAP) {
    pointsAwarded = Math.min(POINTS.SOLO_PLAYED, POINTS.SOLO_DAILY_CAP - alreadyToday);
    await award({
      userId: user.id,
      amount: pointsAwarded,
      reason: 'solo_played',
      refType: 'session',
      refId: session.id,
    });
  }

  return NextResponse.json({ ok: true, pointsAwarded, capReached: pointsAwarded === 0 });
}
