import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

/** Configure the engagement-event webhook (game_started, game_finished, player_joined) per venue. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || (user.role !== 'MERCHANT' && user.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Merchant account required.' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const venueId = String(body?.venueId ?? '');
  const url = String(body?.url ?? '').trim();
  const enabled = body?.enabled !== false;

  const allowed =
    user.role === 'ADMIN' ||
    (await db.merchantVenue.findUnique({ where: { userId_venueId: { userId: user.id, venueId } } }));
  if (!allowed) return NextResponse.json({ error: 'Not your venue.' }, { status: 403 });

  if (url && !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'Webhook URL must be http(s).' }, { status: 400 });
  }

  if (!url) {
    await db.webhookConfig.deleteMany({ where: { venueId } });
    return NextResponse.json({ ok: true, removed: true });
  }

  const existing = await db.webhookConfig.findUnique({ where: { venueId } });
  const secret = existing?.secret ?? crypto.randomBytes(24).toString('hex');
  await db.webhookConfig.upsert({
    where: { venueId },
    create: { venueId, url, secret, enabled },
    update: { url, enabled },
  });
  return NextResponse.json({ ok: true, secret });
}
