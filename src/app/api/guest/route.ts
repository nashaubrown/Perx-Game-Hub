import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { GUEST_COOKIE } from '@/lib/auth';

/** Guests join lobbies with just a nickname — no account, no friction. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nickname = String(body?.nickname ?? '').trim().slice(0, 20);
  if (nickname.length < 2) {
    return NextResponse.json({ error: 'Pick a nickname (2+ characters).' }, { status: 400 });
  }

  // reuse an existing guest session if the cookie is still valid
  const existingId = req.cookies.get(GUEST_COOKIE)?.value;
  if (existingId) {
    const existing = await db.guestSession.findUnique({ where: { id: existingId } });
    if (existing && !existing.convertedUserId) {
      await db.guestSession.update({ where: { id: existingId }, data: { nickname } });
      return NextResponse.json({ ok: true, guestId: existingId, nickname });
    }
  }

  const guest = await db.guestSession.create({ data: { nickname } });
  const res = NextResponse.json({ ok: true, guestId: guest.id, nickname });
  res.cookies.set(GUEST_COOKIE, guest.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
  return res;
}
