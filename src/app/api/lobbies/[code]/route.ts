import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { normalizeJoinCode } from '@/lib/join-code';

export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeJoinCode(params.code);
  const lobby = await db.lobby.findUnique({
    where: { code },
    include: { game: true, venue: { select: { id: true, name: true } } },
  });
  if (!lobby || lobby.status === 'CLOSED') {
    return NextResponse.json({ error: 'No lobby with that code.' }, { status: 404 });
  }

  const joinUrl = `${process.env.APP_URL || 'http://localhost:3000'}/join?code=${lobby.code}`;
  const qr = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 480,
    color: { dark: '#0A0A0A', light: '#FFFFFF' },
  });

  return NextResponse.json({
    code: lobby.code,
    status: lobby.status,
    game: { id: lobby.game.id, name: lobby.game.name, tagline: lobby.game.tagline, minPlayers: lobby.game.minPlayers, maxPlayers: lobby.game.maxPlayers },
    venue: lobby.venue,
    joinUrl,
    qr,
  });
}
