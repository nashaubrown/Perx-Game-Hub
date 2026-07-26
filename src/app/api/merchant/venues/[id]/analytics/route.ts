import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { venueAnalytics } from '@/lib/analytics';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });
  const allowed =
    user.role === 'ADMIN' ||
    (user.role === 'MERCHANT' &&
      (await db.merchantVenue.findUnique({
        where: { userId_venueId: { userId: user.id, venueId: params.id } },
      })));
  if (!allowed) return NextResponse.json({ error: 'Not your venue.' }, { status: 403 });

  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get('days') ?? 30)));
  return NextResponse.json(await venueAnalytics(params.id, days));
}
