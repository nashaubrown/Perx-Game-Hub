import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
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
    // featuredDays sets the placement window (sold per week/month); 0/undefined = open-ended
    const featuredUntil =
      body.featured && Number(body.featuredDays) > 0
        ? new Date(Date.now() + Number(body.featuredDays) * 24 * 60 * 60 * 1000)
        : body.featured
          ? null
          : undefined;
    const provider = await db.newsProvider.update({
      where: { id: String(body.providerId) },
      data: {
        ...(body.featured !== undefined ? { featured: !!body.featured, featuredUntil } : {}),
        ...(body.active !== undefined ? { active: !!body.active } : {}),
        ...(body.rotateToken ? { apiToken: crypto.randomBytes(24).toString('hex') } : {}),
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
      apiToken: crypto.randomBytes(24).toString('hex'), // hand this to the outlet for the push API
    },
  });
  const results = feedUrl ? await refreshFeeds() : [];
  return NextResponse.json({ ok: true, provider, refresh: results.find((r) => r.provider === name) });
}
