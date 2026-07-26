import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { balanceOf } from '@/lib/points';

export async function GET() {
  const user = await currentUser();
  const venues = await db.venue.findMany({
    include: { rewards: { where: { active: true }, orderBy: { costPoints: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({
    balance: user ? await balanceOf(user.id) : null,
    venues: venues
      .filter((v) => v.rewards.length > 0)
      .map((v) => ({
        id: v.id,
        name: v.name,
        location: v.location,
        rewards: v.rewards.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          costPoints: r.costPoints,
        })),
      })),
  });
}
