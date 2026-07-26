import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

export async function GET() {
  const user = await currentUser();
  if (!user || (user.role !== 'MERCHANT' && user.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Merchant account required.' }, { status: 403 });
  }
  const links = await db.merchantVenue.findMany({
    where: user.role === 'ADMIN' ? {} : { userId: user.id },
    include: { venue: { include: { webhookConfig: { select: { url: true, enabled: true } } } } },
  });
  const venues =
    user.role === 'ADMIN' && links.length === 0
      ? await db.venue.findMany({ include: { webhookConfig: { select: { url: true, enabled: true } } } })
      : links.map((l) => l.venue);
  return NextResponse.json({
    venues: venues.map((v) => ({
      id: v.id,
      name: v.name,
      slug: v.slug,
      location: v.location,
      analyticsToken: v.analyticsToken,
      webhook: v.webhookConfig ?? null,
    })),
  });
}
