import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { AUTH_COOKIE, GUEST_COOKIE, HANDLE_RE, signToken } from '@/lib/auth';
import { award, convertGuest, POINTS } from '@/lib/points';

const schema = z.object({
  handle: z.string().toLowerCase(),
  email: z.string().email().optional(),
  phone: z.string().min(7).max(15).optional(),
  password: z.string().min(8, 'Password needs at least 8 characters'),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { handle, email, phone, password } = parsed.data;

  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { error: 'Handles are 3–20 characters: lowercase letters, numbers, underscores.' },
      { status: 400 }
    );
  }
  if (!email && !phone) {
    return NextResponse.json({ error: 'Add an email or a phone number.' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await db.user.create({ data: { handle, email, phone, passwordHash } });
  } catch (err: unknown) {
    const e = err as { code?: string; meta?: { target?: string[] } };
    if (e.code === 'P2002') {
      const field = e.meta?.target?.[0] ?? 'handle';
      const msg =
        field === 'handle' ? `@${handle} is taken. Try another handle.` : `That ${field} already has an account.`;
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    throw err;
  }

  await award({ userId: user.id, amount: POINTS.SIGNUP_BONUS, reason: 'signup_bonus' });

  // guest → account: carry their game history and points over
  const guestId = req.cookies.get(GUEST_COOKIE)?.value;
  if (guestId) {
    const guest = await db.guestSession.findUnique({ where: { id: guestId } });
    if (guest && !guest.convertedUserId) await convertGuest(guestId, user.id);
  }

  const res = NextResponse.json({ ok: true, handle: user.handle });
  res.cookies.set(AUTH_COOKIE, signToken({ sub: user.id, handle: user.handle, role: user.role }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
  res.cookies.delete(GUEST_COOKIE);
  return res;
}
