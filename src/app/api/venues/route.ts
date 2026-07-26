import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const venues = await db.venue.findMany({
    select: { id: true, name: true, location: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ venues });
}
