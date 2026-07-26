import { db } from './db';

/**
 * Daily News — pulls headlines from Maldivian news providers' RSS/Atom feeds.
 * Providers with `featured: true` are the sellable unit: pinned to the top of
 * the news tab with a Featured chip. Fetching is best-effort; a dead feed
 * never breaks the tab (old items keep serving).
 */

function strip(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? strip(m[1]) : null;
}

type ParsedItem = { title: string; url: string; summary?: string; imageUrl?: string; publishedAt: Date };

/** Minimal RSS 2.0 + Atom parser — enough for news headlines, zero dependencies. */
export function parseFeed(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const atomEntries = rssItems.length ? [] : xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];

  for (const block of rssItems) {
    const title = tag(block, 'title');
    const url = tag(block, 'link') || tag(block, 'guid');
    if (!title || !url || !/^https?:\/\//.test(url)) continue;
    const date = tag(block, 'pubDate') || tag(block, 'dc:date');
    const img =
      block.match(/<(?:media:content|media:thumbnail|enclosure)[^>]*url="([^"]+)"/i)?.[1] ?? undefined;
    items.push({
      title,
      url,
      summary: tag(block, 'description')?.slice(0, 300) || undefined,
      imageUrl: img,
      publishedAt: date && !isNaN(Date.parse(date)) ? new Date(date) : new Date(),
    });
  }

  for (const block of atomEntries) {
    const title = tag(block, 'title');
    const url = block.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    if (!title || !url) continue;
    const date = tag(block, 'updated') || tag(block, 'published');
    items.push({
      title,
      url,
      summary: tag(block, 'summary')?.slice(0, 300) || undefined,
      publishedAt: date && !isNaN(Date.parse(date)) ? new Date(date) : new Date(),
    });
  }

  return items.slice(0, 25);
}

export async function refreshFeeds(): Promise<{ provider: string; added: number; error?: string }[]> {
  const providers = await db.newsProvider.findMany({ where: { active: true, feedUrl: { not: null } } });
  const results: { provider: string; added: number; error?: string }[] = [];

  for (const provider of providers) {
    try {
      const res = await fetch(provider.feedUrl!, {
        headers: { 'User-Agent': 'PerxPlay/1.0 (+https://perx.mv)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseFeed(await res.text());
      let added = 0;
      for (const item of items) {
        const created = await db.newsItem.upsert({
          where: { providerId_url: { providerId: provider.id, url: item.url } },
          create: {
            providerId: provider.id,
            title: item.title,
            url: item.url,
            summary: item.summary,
            imageUrl: item.imageUrl,
            publishedAt: item.publishedAt,
          },
          update: {}, // never rewrite an already-fetched headline
        });
        if (created.fetchedAt.getTime() > Date.now() - 5000) added++;
      }
      results.push({ provider: provider.name, added });
    } catch (err) {
      results.push({ provider: provider.name, added: 0, error: (err as Error).message });
    }
  }
  return results;
}
