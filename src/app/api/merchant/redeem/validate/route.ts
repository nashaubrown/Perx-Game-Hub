import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { award, balanceOf } from '@/lib/points';

/**
 * Redeem flow step 2: staff enters the customer's 6-digit code on the
 * validation screen. On success the points come off the ledger (as a negative
 * append-only row — never a mutation).
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || (user.role !== 'MERCHANT' && user.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'Merchant account required.' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });

  const redemption = await db.redemption.findFirst({
    where: { code, status: 'PENDING' },
    include: { reward: { include: { venue: true } }, user: { select: { id: true, handle: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!redemption) return NextResponse.json({ error: 'No pending redemption with that code.' }, { status: 404 });

  if (user.role === 'MERCHANT') {
    const link = await db.merchantVenue.findUnique({
      where: { userId_venueId: { userId: user.id, venueId: redemption.reward.venueId } },
    });
    if (!link) return NextResponse.json({ error: 'That code belongs to another venue.' }, { status: 403 });
  }

  if (redemption.expiresAt < new Date()) {
    await db.redemption.update({ where: { id: redemption.id }, data: { status: 'EXPIRED' } });
    return NextResponse.json({ error: 'That code expired. Ask the customer to redeem again.' }, { status: 410 });
  }

  const balance = await balanceOf(redemption.user.id);
  if (balance < redemption.reward.costPoints) {
    await db.redemption.update({ where: { id: redemption.id }, data: { status: 'CANCELLED' } });
    return NextResponse.json({ error: 'Customer no longer has enough points.' }, { status: 400 });
  }

  await db.redemption.update({
    where: { id: redemption.id },
    data: { status: 'VALIDATED', validatedAt: new Date() },
  });
  await award({
    userId: redemption.user.id,
    amount: -redemption.reward.costPoints,
    reason: 'redemption',
    refType: 'redemption',
    refId: redemption.id,
    venueId: redemption.reward.venueId,
  });

  return NextResponse.json({
    ok: true,
    reward: redemption.reward.name,
    customer: `@${redemption.user.handle}`,
    pointsDeducted: redemption.reward.costPoints,
  });
}
