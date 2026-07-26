import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

export async function GET() {
  const user = await currentUser();
  const [books, progress] = await Promise.all([
    db.book.findMany({ orderBy: [{ curated: 'desc' }, { title: 'asc' }] }),
    user
      ? db.readingProgress.findMany({ where: { userId: user.id }, select: { bookId: true, percent: true } })
      : Promise.resolve([]),
  ]);
  const progressMap = Object.fromEntries(progress.map((p) => [p.bookId, p.percent]));
  return NextResponse.json({
    books: books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      genre: b.genre,
      format: b.format,
      coverUrl: b.coverUrl,
      curated: b.curated,
      percent: progressMap[b.id] ?? 0,
    })),
  });
}
