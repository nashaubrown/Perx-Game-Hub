import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Reconciliation endpoint for MyPerx: list a venue's earn events by status.
 * Auth: the venue's analytics bearer token (same as /api/v1/venues/:id/analytics).
 * Query: venueId (required), status?, since? (ISO date), limit?
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const venueId = url.searchParams.get('venueId') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  const venue = await db.venue.findUnique({ where: { id: venueId } });
  if (!venue || !token || venue.analyticsToken !== token) {
    return NextResponse.json({ error: 'Invalid token for this venue.' }, { status: 403 });
  }

  const status = url.searchParams.get('status') ?? undefined;
  const since = url.searchParams.get('since');
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));

  const events = await db.playEarnEvent.findMany({
    where: {
      venueId,
      ...(status ? { status: status as never } : {}),
      ...(since && !isNaN(Date.parse(since)) ? { createdAt: { gte: new Date(since) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      ledgerRowId: true,
      perxUserId: true,
      merchantId: true,
      playPoints: true,
      cardPoints: true,
      day: true,
      status: true,
      presence: true,
      createdAt: true,
      confirmedAt: true,
      sentAt: true,
    },
  });
  return NextResponse.json({ venueId, count: events.length, events });
}
