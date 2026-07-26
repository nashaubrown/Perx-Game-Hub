import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const providers = await db.newsProvider.findMany({
    where: { active: true },
    orderBy: [{ featured: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, slug: true, logoUrl: true, language: true, featured: true },
  });
  const items = await db.newsItem.findMany({
    where: { provider: { active: true } },
    orderBy: { publishedAt: 'desc' },
    take: 60,
    include: { provider: { select: { id: true, name: true, language: true, featured: true } } },
  });
  return NextResponse.json({
    providers,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      summary: i.summary,
      url: i.url,
      imageUrl: i.imageUrl,
      publishedAt: i.publishedAt,
      provider: i.provider,
    })),
  });
}
