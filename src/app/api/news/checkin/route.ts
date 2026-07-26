import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { award, earnedToday } from '@/lib/points';

const DAILY_BRIEF_POINTS = 5;

/** First news visit of the day → small habit bonus. Once per day, Play points only. */
export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ awarded: 0 });
  const already = await earnedToday(user.id, 'daily_brief');
  if (already > 0) return NextResponse.json({ awarded: 0 });
  await award({ userId: user.id, amount: DAILY_BRIEF_POINTS, reason: 'daily_brief', refType: 'news' });
  return NextResponse.json({ awarded: DAILY_BRIEF_POINTS });
}
