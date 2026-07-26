import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * News provider push API — the integration path for Maldivian news outlets.
 * Each provider gets a bearer token (shown in /admin/news); their CMS pushes
 * headlines here the moment they publish. Idempotent on (provider, url).
 *
 *   POST /api/v1/news/items
 *   Authorization: Bearer <provider apiToken>
 *   { "title": "...", "url": "https://...", "summary"?, "imageUrl"?, "publishedAt"? }
 *
 * Also accepts { "items": [ ...same shape... ] } for batch pushes (max 20).
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 });

  const provider = await db.newsProvider.findUnique({ where: { apiToken: token } });
  if (!provider || !provider.active) {
    return NextResponse.json({ error: 'Invalid or inactive provider token.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad JSON.' }, { status: 400 });
  const raw = Array.isArray(body.items) ? body.items.slice(0, 20) : [body];

  const results: { url: string; ok: boolean; error?: string }[] = [];
  for (const item of raw) {
    const title = String(item?.title ?? '').trim().slice(0, 300);
    const url = String(item?.url ?? '').trim();
    if (!title || !/^https?:\/\//.test(url)) {
      results.push({ url, ok: false, error: 'title and a valid http(s) url are required' });
      continue;
    }
    const publishedAt =
      item?.publishedAt && !isNaN(Date.parse(item.publishedAt)) ? new Date(item.publishedAt) : new Date();
    await db.newsItem.upsert({
      where: { providerId_url: { providerId: provider.id, url } },
      create: {
        providerId: provider.id,
        title,
        url,
        summary: item?.summary ? String(item.summary).slice(0, 300) : null,
        imageUrl: item?.imageUrl && /^https?:\/\//.test(String(item.imageUrl)) ? String(item.imageUrl) : null,
        publishedAt,
      },
      update: { title, summary: item?.summary ? String(item.summary).slice(0, 300) : undefined },
    });
    results.push({ url, ok: true });
  }
  return NextResponse.json({ provider: provider.name, results });
}
