import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { balanceOf } from '@/lib/points';
import { db } from '@/lib/db';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null });

  const [balance, gamesPlayed, wins, booksRead] = await Promise.all([
    balanceOf(user.id),
    db.gameResult.count({ where: { userId: user.id } }),
    db.gameResult.count({ where: { userId: user.id, won: true } }),
    db.readingProgress.count({ where: { userId: user.id, finished: true } }),
  ]);

  return NextResponse.json({
    user: {
      id: user.id,
      handle: user.handle,
      role: user.role,
      balance,
      gamesPlayed,
      wins,
      winRate: gamesPlayed ? Math.round((wins / gamesPlayed) * 100) : 0,
      booksRead,
      dailyStreak: user.dailyStreak,
    },
  });
}
