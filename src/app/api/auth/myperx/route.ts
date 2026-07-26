import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';
import { AUTH_COOKIE, HANDLE_RE, signToken } from '@/lib/auth';

/**
 * MyPerx SSO — the MyPerx app opens Play (webview tab or deep link) and posts
 * its own auth token here. We verify it, link-or-create the Play profile, and
 * set Play's normal httpOnly cookie. Users never see a second login.
 *
 * Token contract (see PERX-INTEGRATION.md): HS256 JWT signed with
 * MYPERX_TOKEN_SECRET, claims { sub: <myperx user id>, handle?, email? }.
 * Swap the verify call for your JWKS if MyPerx moves to RS256.
 */
const TOKEN_SECRET = process.env.MYPERX_TOKEN_SECRET || 'dev-myperx-token-secret';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? '');
  if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 });

  let claims: { sub?: string; handle?: string; email?: string };
  try {
    claims = jwt.verify(token, TOKEN_SECRET) as typeof claims;
  } catch {
    return NextResponse.json({ error: 'Invalid MyPerx token.' }, { status: 401 });
  }
  if (!claims.sub) return NextResponse.json({ error: 'Token missing sub claim.' }, { status: 400 });

  let user = await db.user.findUnique({ where: { perxUserId: claims.sub } });

  if (!user && claims.email) {
    // same email already has a Play account → link it instead of duplicating
    const byEmail = await db.user.findUnique({ where: { email: claims.email.toLowerCase() } });
    if (byEmail && !byEmail.perxUserId) {
      user = await db.user.update({ where: { id: byEmail.id }, data: { perxUserId: claims.sub } });
    }
  }

  if (!user) {
    // provision a Play profile for this MyPerx account
    let handle = String(claims.handle ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
    if (!HANDLE_RE.test(handle)) handle = `perx_${claims.sub.replace(/[^a-z0-9]/gi, '').slice(0, 10).toLowerCase()}`;
    let final = handle;
    let n = 2;
    while (await db.user.findUnique({ where: { handle: final } })) final = `${handle}${n++}`.slice(0, 20);
    user = await db.user.create({
      data: {
        handle: final,
        email: claims.email?.toLowerCase(),
        perxUserId: claims.sub,
        passwordHash: 'myperx-sso', // never a valid bcrypt hash — password login stays impossible
      },
    });
  }

  const res = NextResponse.json({ ok: true, handle: user.handle, linked: true });
  res.cookies.set(AUTH_COOKIE, signToken({ sub: user.id, handle: user.handle, role: user.role }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
  return res;
}
