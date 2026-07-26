import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { balanceOf } from '@/lib/points';

const CODE_TTL_MS = 10 * 60 * 1000; // staff has 10 minutes to validate

/**
 * Redeem flow step 1: user taps redeem → short-lived 6-digit code. Points are
 * NOT deducted yet — that happens when staff validates the code, so an
 * unused code costs nothing.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in to redeem.' }, { status: 401 });

  const reward = await db.reward.findUnique({ where: { id: params.id }, include: { venue: true } });
  if (!reward || !reward.active) return NextResponse.json({ error: 'Reward unavailable.' }, { status: 404 });

  const balance = await balanceOf(user.id);
  // count points already spoken for by pending codes
  const pending = await db.redemption.findMany({
    where: { userId: user.id, status: 'PENDING', expiresAt: { gt: new Date() } },
    include: { reward: { select: { costPoints: true } } },
  });
  const held = pending.reduce((sum, p) => sum + p.reward.costPoints, 0);
  if (balance - held < reward.costPoints) {
    return NextResponse.json(
      { error: `You need ${reward.costPoints} points — you have ${balance - held} available.` },
      { status: 400 }
    );
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const redemption = await db.redemption.create({
    data: {
      rewardId: reward.id,
      userId: user.id,
      code,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  return NextResponse.json({
    ok: true,
    code,
    redemptionId: redemption.id,
    reward: { name: reward.name, costPoints: reward.costPoints, venue: reward.venue.name },
    expiresAt: redemption.expiresAt,
  });
}
