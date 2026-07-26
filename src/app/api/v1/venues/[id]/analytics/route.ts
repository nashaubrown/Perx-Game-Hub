import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { venueAnalytics } from '@/lib/analytics';

/**
 * Perx platform integration endpoint. Token auth:
 *   Authorization: Bearer <venue.analyticsToken>
 * The token is shown in the merchant dashboard.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 });

  const venue = await db.venue.findUnique({ where: { id: params.id } });
  if (!venue || venue.analyticsToken !== token) {
    return NextResponse.json({ error: 'Invalid token for this venue.' }, { status: 403 });
  }

  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get('days') ?? 30)));
  return NextResponse.json(await venueAnalytics(params.id, days));
}
