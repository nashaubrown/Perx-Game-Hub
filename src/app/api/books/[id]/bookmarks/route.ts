import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Log in to keep bookmarks.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const location = String(body?.location ?? '').slice(0, 500);
  const label = String(body?.label ?? 'Bookmark').slice(0, 80);
  if (!location) return NextResponse.json({ error: 'Missing location.' }, { status: 400 });
  const bookmark = await db.bookmark.create({
    data: { userId: user.id, bookId: params.id, location, label },
  });
  return NextResponse.json({ ok: true, bookmark });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  const bookmarkId = new URL(req.url).searchParams.get('bookmarkId') ?? '';
  await db.bookmark.deleteMany({ where: { id: bookmarkId, userId: user.id, bookId: params.id } });
  return NextResponse.json({ ok: true });
}
