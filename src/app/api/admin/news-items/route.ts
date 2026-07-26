import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

/** Manual headline entry — for providers without an integration yet. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Admins only.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const providerId = String(body?.providerId ?? '');
  const title = String(body?.title ?? '').trim().slice(0, 300);
  const url = String(body?.url ?? '').trim();
  if (!providerId || !title || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'Provider, title and a valid link are required.' }, { status: 400 });
  }
  const provider = await db.newsProvider.findUnique({ where: { id: providerId } });
  if (!provider) return NextResponse.json({ error: 'Unknown provider.' }, { status: 404 });

  const item = await db.newsItem.upsert({
    where: { providerId_url: { providerId, url } },
    create: {
      providerId,
      title,
      url,
      summary: body?.summary ? String(body.summary).slice(0, 300) : null,
      publishedAt: new Date(),
    },
    update: { title, summary: body?.summary ? String(body.summary).slice(0, 300) : undefined },
  });
  return NextResponse.json({ ok: true, item });
}
