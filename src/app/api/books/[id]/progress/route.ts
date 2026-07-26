import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { award, earnedToday, POINTS } from '@/lib/points';
import { todayMV } from '@/lib/dates';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ progress: null, bookmarks: [] });
  const [progress, bookmarks] = await Promise.all([
    db.readingProgress.findUnique({ where: { userId_bookId: { userId: user.id, bookId: params.id } } }),
    db.bookmark.findMany({ where: { userId: user.id, bookId: params.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  return NextResponse.json({ progress, bookmarks });
}

/**
 * Reader heartbeat: saves exact position and counts reading minutes
 * server-side. Points come from minutes, capped per day so reading can't be
 * farmed (heartbeats are once a minute; anything faster is ignored).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: true, anonymous: true });

  const body = await req.json().catch(() => null);
  const location = body?.location ? String(body.location).slice(0, 500) : undefined;
  const percent = Math.min(100, Math.max(0, Number(body?.percent ?? 0)));
  const tick = body?.tick === true; // one reading-minute heartbeat

  const progress = await db.readingProgress.upsert({
    where: { userId_bookId: { userId: user.id, bookId: params.id } },
    create: { userId: user.id, bookId: params.id, location, percent, finished: percent >= 98 },
    update: { location, percent, finished: percent >= 98 ? true : undefined, lastReadAt: new Date() },
  });

  let pointsAwarded = 0;
  if (tick) {
    const date = todayMV();
    const day = await db.readingDay.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: { userId: user.id, date, minutes: 1 },
      update: { minutes: { increment: 1 } },
    });
    // 5 points per 5 minutes, capped per day
    const shouldHave = Math.min(
      POINTS.READING_DAILY_CAP,
      Math.floor(day.minutes / 5) * POINTS.READING_PER_5_MIN
    );
    if (shouldHave > day.pointsAwarded) {
      pointsAwarded = shouldHave - day.pointsAwarded;
      const alreadyToday = await earnedToday(user.id, 'reading');
      if (alreadyToday < POINTS.READING_DAILY_CAP) {
        await award({
          userId: user.id,
          amount: Math.min(pointsAwarded, POINTS.READING_DAILY_CAP - alreadyToday),
          reason: 'reading',
          refType: 'book',
          refId: params.id,
        });
        await db.readingDay.update({
          where: { userId_date: { userId: user.id, date } },
          data: { pointsAwarded: shouldHave },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, percent: progress.percent, pointsAwarded });
}
