import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const venues = await db.venue.findMany({
    select: { id: true, name: true, location: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ venues });
}
