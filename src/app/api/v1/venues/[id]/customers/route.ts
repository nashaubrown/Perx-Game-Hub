import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { venueCustomers } from '@/lib/analytics';

/**
 * Per-customer play profiles for the Perx Merchant portal's customer views
 * and churn model. Same bearer auth as the analytics endpoint. Only includes
 * customers who played venue-tagged games at THIS venue — never app-wide
 * behavior. Rows with perxUserId null are Play-only accounts the portal
 * can't join yet (they show up once the customer links MyPerx).
 *
 *   GET /api/v1/venues/:id/customers?days=90&linkedOnly=1
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const venue = await db.venue.findUnique({ where: { id: params.id } });
  if (!venue || !token || venue.analyticsToken !== token) {
    return NextResponse.json({ error: 'Invalid token for this venue.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days') ?? 90)));
  const linkedOnly = url.searchParams.get('linkedOnly') === '1';

  let customers = await venueCustomers(params.id, days);
  if (linkedOnly) customers = customers.filter((c) => c.perxUserId);

  return NextResponse.json({ venueId: params.id, windowDays: days, count: customers.length, customers });
}
