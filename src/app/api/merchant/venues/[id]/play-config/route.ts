import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

/** Merchant lever for Play earning at their venue: on/off, rate, cap, multiplier, hours, presence IP. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });
  const allowed =
    user.role === 'ADMIN' ||
    (user.role === 'MERCHANT' &&
      (await db.merchantVenue.findUnique({
        where: { userId_venueId: { userId: user.id, venueId: params.id } },
      })));
  if (!allowed) return NextResponse.json({ error: 'Not your venue.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad JSON.' }, { status: 400 });

  const clampHour = (v: unknown) =>
    v === null || v === undefined || v === '' ? null : Math.min(23, Math.max(0, Math.trunc(Number(v))));

  const venue = await db.venue.update({
    where: { id: params.id },
    data: {
      playEarnEnabled: body.playEarnEnabled !== false,
      earnRatePer10: Math.min(10, Math.max(0, Math.trunc(Number(body.earnRatePer10 ?? 1)))),
      dailyCardCap: Math.min(500, Math.max(0, Math.trunc(Number(body.dailyCardCap ?? 30)))),
      multiplier: Math.min(5, Math.max(0.5, Number(body.multiplier ?? 1))),
      openHour: clampHour(body.openHour),
      closeHour: clampHour(body.closeHour),
      publicIp: body.publicIp ? String(body.publicIp).trim().slice(0, 45) : null,
      ...(user.role === 'ADMIN' && body.externalMerchantId !== undefined
        ? { externalMerchantId: body.externalMerchantId ? String(body.externalMerchantId).trim() : null }
        : {}),
    },
  });
  return NextResponse.json({
    ok: true,
    config: {
      playEarnEnabled: venue.playEarnEnabled,
      earnRatePer10: venue.earnRatePer10,
      dailyCardCap: venue.dailyCardCap,
      multiplier: venue.multiplier,
      openHour: venue.openHour,
      closeHour: venue.closeHour,
      publicIp: venue.publicIp,
      externalMerchantId: venue.externalMerchantId,
    },
  });
}
