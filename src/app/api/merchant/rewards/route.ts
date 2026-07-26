import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

async function requireVenueAccess(userId: string, role: string, venueId: string) {
  if (role === 'ADMIN') return true;
  if (role !== 'MERCHANT') return false;
  return !!(await db.merchantVenue.findUnique({
    where: { userId_venueId: { userId, venueId } },
  }));
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const venueId = String(body?.venueId ?? '');
  const name = String(body?.name ?? '').trim().slice(0, 80);
  const description = String(body?.description ?? '').trim().slice(0, 200) || null;
  const costPoints = Math.trunc(Number(body?.costPoints ?? 0));

  if (!(await requireVenueAccess(user.id, user.role, venueId))) {
    return NextResponse.json({ error: 'Not your venue.' }, { status: 403 });
  }
  if (!name || costPoints < 1) {
    return NextResponse.json({ error: 'Name and a positive point cost are required.' }, { status: 400 });
  }

  const reward = await db.reward.create({ data: { venueId, name, description, costPoints } });
  return NextResponse.json({ ok: true, reward });
}

export async function PATCH(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const rewardId = String(body?.rewardId ?? '');
  const reward = await db.reward.findUnique({ where: { id: rewardId } });
  if (!reward || !(await requireVenueAccess(user.id, user.role, reward.venueId))) {
    return NextResponse.json({ error: 'Not your venue.' }, { status: 403 });
  }
  const updated = await db.reward.update({
    where: { id: rewardId },
    data: { active: body?.active !== false },
  });
  return NextResponse.json({ ok: true, reward: updated });
}
