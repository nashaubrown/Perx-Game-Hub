import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { award, earnedToday, POINTS } from '@/lib/points';
import { todayMV, yesterdayMV } from '@/lib/dates';
import words from '../../../../../data/daily-words.json';

const MAX_GUESSES = 6;

/** Word of the day — deterministic from the date, never sent to the client. */
function wordOfTheDay(date: string): string {
  const pool = (words as string[]).filter((w) => w.length === 5);
  const hash = crypto.createHash('sha256').update(`perx-daily-${date}`).digest();
  return pool[hash.readUInt32BE(0) % pool.length];
}

function evaluate(guess: string, answer: string): ('hit' | 'near' | 'miss')[] {
  const result: ('hit' | 'near' | 'miss')[] = Array(5).fill('miss');
  const remaining: Record<string, number> = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) result[i] = 'hit';
    else remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'miss' && remaining[guess[i]] > 0) {
      result[i] = 'near';
      remaining[guess[i]]--;
    }
  }
  return result;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ loginRequired: true });
  const date = todayMV();
  const row = await db.dailyPuzzleResult.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });
  const guesses = (row?.guesses as string[] | undefined) ?? [];
  const answer = wordOfTheDay(date);
  return NextResponse.json({
    date,
    guesses,
    marks: guesses.map((g) => evaluate(g, answer)),
    finished: row?.finished ?? false,
    won: row?.won ?? false,
    streak: user.dailyStreak,
    maxGuesses: MAX_GUESSES,
    // only reveal the answer once the puzzle is over
    answer: row?.finished ? answer : undefined,
  });
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in to play the daily word.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const guess = String(body?.guess ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (guess.length !== 5) return NextResponse.json({ error: 'Guess a 5-letter word.' }, { status: 400 });
  if (!(words as string[]).includes(guess)) {
    return NextResponse.json({ error: 'Not in the word list.' }, { status: 422 });
  }

  const date = todayMV();
  const answer = wordOfTheDay(date);
  const row = await db.dailyPuzzleResult.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });
  if (row?.finished) return NextResponse.json({ error: 'Come back tomorrow for a new word.' }, { status: 409 });

  const guesses = [...(((row?.guesses as string[] | undefined) ?? [])), guess];
  const won = guess === answer;
  const finished = won || guesses.length >= MAX_GUESSES;

  let streakAfter = user.dailyStreak;
  let pointsAwarded = 0;
  if (finished) {
    if (won) {
      const continued = user.lastDailyDate?.toISOString().slice(0, 10) === yesterdayMV()
        || (user.lastDailyDate && user.lastDailyDate.toISOString().slice(0, 10) === date);
      streakAfter = continued ? user.dailyStreak + 1 : 1;
      await db.user.update({
        where: { id: user.id },
        data: { dailyStreak: streakAfter, lastDailyDate: new Date() },
      });
      const already = await earnedToday(user.id, 'daily_streak');
      if (already === 0) {
        pointsAwarded = POINTS.DAILY_SOLVED + Math.min(streakAfter, 7) * POINTS.DAILY_STREAK_BONUS;
        await award({
          userId: user.id,
          amount: pointsAwarded,
          reason: 'daily_streak',
          refType: 'puzzle',
          refId: date,
        });
      }
    } else {
      streakAfter = 0;
      await db.user.update({ where: { id: user.id }, data: { dailyStreak: 0 } });
    }
  }

  await db.dailyPuzzleResult.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, guesses, won, finished, streakAfter },
    update: { guesses, won, finished, streakAfter },
  });

  return NextResponse.json({
    marks: evaluate(guess, answer),
    guesses,
    won,
    finished,
    streak: streakAfter,
    pointsAwarded,
    answer: finished ? answer : undefined,
  });
}
