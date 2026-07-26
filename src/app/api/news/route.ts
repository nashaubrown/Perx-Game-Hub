import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// parameterless GET — must opt out of Next's static caching or it serves build-time data
export const dynamic = 'force-dynamic';

/** A paid placement is live while featured=true AND the end date hasn't passed. */
function isFeatured(p: { featured: boolean; featuredUntil: Date | null }): boolean {
  return p.featured && (!p.featuredUntil || p.featuredUntil > new Date());
}

export async function GET() {
  const providers = await db.newsProvider.findMany({
    where: { active: true },
    orderBy: [{ featured: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, slug: true, logoUrl: true, language: true, featured: true, featuredUntil: true },
  });
  const items = await db.newsItem.findMany({
    where: { provider: { active: true } },
    orderBy: { publishedAt: 'desc' },
    take: 60,
    include: {
      provider: { select: { id: true, name: true, language: true, featured: true, featuredUntil: true } },
    },
  });
  return NextResponse.json({
    providers: providers.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      logoUrl: p.logoUrl,
      language: p.language,
      featured: isFeatured(p),
    })),
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      summary: i.summary,
      url: i.url,
      imageUrl: i.imageUrl,
      publishedAt: i.publishedAt,
      provider: {
        id: i.provider.id,
        name: i.provider.name,
        language: i.provider.language,
        featured: isFeatured(i.provider),
      },
    })),
  });
}
