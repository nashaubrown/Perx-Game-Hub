import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { generateJoinCode } from '@/lib/join-code';

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in to host a game.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const gameId = String(body?.gameId ?? '');
  const venueId = body?.venueId ? String(body.venueId) : null;

  const game = await db.game.findUnique({ where: { id: gameId } });
  if (!game || !game.multi) return NextResponse.json({ error: 'Pick a multiplayer game.' }, { status: 400 });
  if (venueId) {
    const venue = await db.venue.findUnique({ where: { id: venueId } });
    if (!venue) return NextResponse.json({ error: 'Unknown venue.' }, { status: 400 });
  }

  // join codes collide rarely; retry a few times on the unique constraint
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const lobby = await db.lobby.create({
        data: { code: generateJoinCode(), gameId, hostUserId: user.id, venueId },
      });
      return NextResponse.json({ ok: true, code: lobby.code });
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }
  return NextResponse.json({ error: 'Could not create a lobby. Try again.' }, { status: 500 });
}
