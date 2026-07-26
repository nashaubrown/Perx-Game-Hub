import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { refreshFeeds } from '@/lib/news';

export async function POST() {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  return NextResponse.json({ results: await refreshFeeds() });
}
