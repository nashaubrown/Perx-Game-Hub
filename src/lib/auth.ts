import { cookies } from 'next/headers';
import { db } from './db';
import { AUTH_COOKIE, GUEST_COOKIE, verifyToken } from './jwt';

export { AUTH_COOKIE, GUEST_COOKIE, signToken, verifyToken } from './jwt';

/** Reads the httpOnly auth cookie in a server component / route handler. */
export async function currentUser() {
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return db.user.findUnique({ where: { id: payload.sub } });
}

export function currentGuestId(): string | null {
  return cookies().get(GUEST_COOKIE)?.value ?? null;
}

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
