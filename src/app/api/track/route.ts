import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth';

/**
 * Interaction collector. The client tracker batches events and posts them
 * here (sendBeacon on page hide, fetch otherwise). Anonymous visitors get a
 * long-lived sid cookie so DAU and funnels include people who never sign up.
 * Fire-and-forget by design: this endpoint never returns an error the UI
 * would care about, and unknown event types are dropped, not stored.
 */

const ALLOWED_TYPES = new Set([
  'page_view',
  'game_host_tap',
  'game_join_tap',
  'share_invite',
  'news_click',
  'book_open',
  'reward_view',
  'redeem_tap',
  'signup_prompt_shown',
  'install_prompt',
]);

const SID_COOKIE = 'perx_sid';
const MAX_BATCH = 20;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(body?.events) ? body.events.slice(0, MAX_BATCH) : [];

  // identify the actor: logged-in user > anonymous sid
  let userId: string | null = null;
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token) userId = verifyToken(token)?.sub ?? null;
  let sid = req.cookies.get(SID_COOKIE)?.value ?? null;
  const newSid = !sid;
  if (!sid) sid = crypto.randomBytes(12).toString('hex');
  const actorKey = userId ? `user:${userId}` : `sid:${sid}`;

  const rows = raw
    .map((e: any) => ({
      type: String(e?.type ?? ''),
      path: e?.path ? String(e.path).slice(0, 200) : null,
      venueId: e?.venueId ? String(e.venueId).slice(0, 40) : null,
      meta:
        e?.meta && typeof e.meta === 'object'
          ? JSON.parse(JSON.stringify(e.meta).slice(0, 1000))
          : undefined,
    }))
    .filter((e) => ALLOWED_TYPES.has(e.type));

  if (rows.length) {
    await db.interactionEvent
      .createMany({
        data: rows.map((e) => ({ ...e, actorKey, userId, sid: userId ? null : sid })),
      })
      .catch(() => {}); // analytics must never break the app
  }

  const res = NextResponse.json({ ok: true });
  if (newSid) {
    res.cookies.set(SID_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
    });
  }
  return res;
}
