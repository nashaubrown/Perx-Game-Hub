import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { AUTH_COOKIE, signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const identifier = String(body?.identifier ?? '').trim().toLowerCase().replace(/^@/, '');
  const password = String(body?.password ?? '');
  if (!identifier || !password) {
    return NextResponse.json({ error: 'Enter your handle/email and password.' }, { status: 400 });
  }

  const user = await db.user.findFirst({
    where: { OR: [{ handle: identifier }, { email: identifier }, { phone: identifier }] },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Wrong handle or password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, handle: user.handle, role: user.role });
  res.cookies.set(AUTH_COOKIE, signToken({ sub: user.id, handle: user.handle, role: user.role }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
  return res;
}
