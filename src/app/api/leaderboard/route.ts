import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const period = new URL(req.url).searchParams.get('period') === 'weekly' ? 'weekly' : 'all';
  const since = period === 'weekly' ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : undefined;

  const rows = await db.pointsLedger.groupBy({
    by: ['userId'],
    where: { userId: { not: null }, ...(since ? { createdAt: { gte: since } } : {}) },
    _sum: { amount: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: 50,
  });

  const users = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.userId!) } },
    select: { id: true, handle: true },
  });
  const handleById = Object.fromEntries(users.map((u) => [u.id, u.handle]));

  return NextResponse.json({
    period,
    entries: rows
      .filter((r) => (r._sum.amount ?? 0) > 0)
      .map((r, i) => ({
        rank: i + 1,
        handle: handleById[r.userId!] ?? 'player',
        points: r._sum.amount ?? 0,
      })),
  });
}
