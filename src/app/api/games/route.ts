import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const games = await db.game.findMany({ orderBy: [{ multi: 'desc' }, { name: 'asc' }] });
  return NextResponse.json({ games });
}
