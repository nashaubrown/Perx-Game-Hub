import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { refreshFeeds } from '@/lib/news';

export async function GET() {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  const providers = await db.newsProvider.findMany({
    orderBy: [{ featured: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json({ providers });
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  const body = await req.json().catch(() => null);

  // toggle featured / active on an existing provider
  if (body?.providerId) {
    const provider = await db.newsProvider.update({
      where: { id: String(body.providerId) },
      data: {
        ...(body.featured !== undefined ? { featured: !!body.featured } : {}),
        ...(body.active !== undefined ? { active: !!body.active } : {}),
      },
    });
    return NextResponse.json({ ok: true, provider });
  }

  const name = String(body?.name ?? '').trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  const feedUrl = body?.feedUrl ? String(body.feedUrl).trim() : null;
  if (feedUrl && !/^https?:\/\//.test(feedUrl)) {
    return NextResponse.json({ error: 'Feed URL must be http(s).' }, { status: 400 });
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const provider = await db.newsProvider.create({
    data: {
      name,
      slug: `${slug}-${Date.now() % 10000}`.replace(/^-/, 'p-'),
      feedUrl,
      language: body?.language === 'dv' ? 'dv' : 'en',
      featured: !!body?.featured,
    },
  });
  const results = feedUrl ? await refreshFeeds() : [];
  return NextResponse.json({ ok: true, provider, refresh: results.find((r) => r.provider === name) });
}
