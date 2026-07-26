import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const games = await db.game.findMany({ orderBy: [{ multi: 'desc' }, { name: 'asc' }] });
  return NextResponse.json({ games });
}
