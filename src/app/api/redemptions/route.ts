import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

/** Redemption history — the user's own, or a venue's for merchants (?venueId=). */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });

  const venueId = new URL(req.url).searchParams.get('venueId');
  if (venueId) {
    const allowed =
      user.role === 'ADMIN' ||
      (user.role === 'MERCHANT' &&
        (await db.merchantVenue.findUnique({
          where: { userId_venueId: { userId: user.id, venueId } },
        })));
    if (!allowed) return NextResponse.json({ error: 'Not your venue.' }, { status: 403 });
    const rows = await db.redemption.findMany({
      where: { reward: { venueId } },
      include: { reward: { select: { name: true, costPoints: true } }, user: { select: { handle: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({
      redemptions: rows.map((r) => ({
        id: r.id,
        reward: r.reward.name,
        costPoints: r.reward.costPoints,
        customer: `@${r.user.handle}`,
        status: r.status,
        createdAt: r.createdAt,
        validatedAt: r.validatedAt,
      })),
    });
  }

  const rows = await db.redemption.findMany({
    where: { userId: user.id },
    include: { reward: { include: { venue: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({
    redemptions: rows.map((r) => ({
      id: r.id,
      reward: r.reward.name,
      venue: r.reward.venue.name,
      costPoints: r.reward.costPoints,
      code: r.status === 'PENDING' && r.expiresAt > new Date() ? r.code : undefined,
      status: r.status,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    })),
  });
}
