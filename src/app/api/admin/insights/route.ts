import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Interaction insights for /admin/insights. Combines the interaction-event
 * stream (views, taps, clicks) with the transactional tables (sessions,
 * results, users, ledger) that games already write.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Admins only.' }, { status: 403 });

  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get('days') ?? 30)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // daily active actors (logged-in users + anonymous sids), Maldives days
  const daily = await db.$queryRaw<{ day: string; actors: bigint; events: bigint }[]>(Prisma.sql`
    SELECT to_char("createdAt" + interval '5 hours', 'YYYY-MM-DD') AS day,
           COUNT(DISTINCT "actorKey") AS actors,
           COUNT(*) AS events
    FROM "InteractionEvent"
    WHERE "createdAt" >= ${since}
    GROUP BY 1 ORDER BY 1
  `);

  const [byType, topScreens] = await Promise.all([
    db.interactionEvent.groupBy({
      by: ['type'],
      where: { createdAt: { gte: since } },
      _count: true,
      orderBy: { _count: { type: 'desc' } },
    }),
    db.$queryRaw<{ screen: string; views: bigint; actors: bigint }[]>(Prisma.sql`
      SELECT COALESCE(meta->>'screen', path, '?') AS screen,
             COUNT(*) AS views,
             COUNT(DISTINCT "actorKey") AS actors
      FROM "InteractionEvent"
      WHERE type = 'page_view' AND "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 12
    `),
  ]);

  // funnel: saw the app → tapped host/join → actually played → signed up
  const [visitors, tappedPlay, playedActors, gamesFinished, signups, newsViews, newsClicks, sharesSent, guestPrompts] =
    await Promise.all([
      db.interactionEvent
        .findMany({ where: { createdAt: { gte: since } }, distinct: ['actorKey'], select: { id: true } })
        .then((r) => r.length),
      db.interactionEvent
        .findMany({
          where: { createdAt: { gte: since }, type: { in: ['game_host_tap', 'game_join_tap'] } },
          distinct: ['actorKey'],
          select: { id: true },
        })
        .then((r) => r.length),
      db.gameResult
        .findMany({
          where: { session: { startedAt: { gte: since } } },
          distinct: ['userId', 'guestId'],
          select: { id: true },
        })
        .then((r) => r.length),
      db.gameSession.count({ where: { startedAt: { gte: since }, endedAt: { not: null } } }),
      db.user.count({ where: { createdAt: { gte: since } } }),
      db.interactionEvent.count({
        where: { createdAt: { gte: since }, type: 'page_view', meta: { path: ['screen'], equals: '/news' } },
      }),
      db.interactionEvent.count({ where: { createdAt: { gte: since }, type: 'news_click' } }),
      db.interactionEvent.count({ where: { createdAt: { gte: since }, type: 'share_invite' } }),
      db.interactionEvent.count({ where: { createdAt: { gte: since }, type: 'signup_prompt_shown' } }),
    ]);

  // news clicks by provider — what you show a featured partner
  const newsByProvider = await db.$queryRaw<{ provider: string; clicks: bigint }[]>(Prisma.sql`
    SELECT COALESCE(meta->>'provider', '?') AS provider, COUNT(*) AS clicks
    FROM "InteractionEvent"
    WHERE type = 'news_click' AND "createdAt" >= ${since}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `);

  const gamesByType = await db.gameSession.groupBy({
    by: ['gameId'],
    where: { startedAt: { gte: since }, endedAt: { not: null } },
    _count: true,
    orderBy: { _count: { gameId: 'desc' } },
  });

  const num = (v: bigint | number) => Number(v);

  return NextResponse.json({
    windowDays: days,
    daily: daily.map((d) => ({ day: d.day, actors: num(d.actors), events: num(d.events) })),
    totals: {
      uniqueActors: visitors,
      events: daily.reduce((s, d) => s + num(d.events), 0),
      gamesFinished,
      signups,
      sharesSent,
      guestPrompts,
    },
    byType: byType.map((t) => ({ type: t.type, count: t._count })),
    topScreens: topScreens.map((s) => ({ screen: s.screen, views: num(s.views), actors: num(s.actors) })),
    funnel: [
      { step: 'Opened the app', actors: visitors },
      { step: 'Tapped host/join', actors: tappedPlay },
      { step: 'Finished a game', actors: playedActors },
      { step: 'Signed up', actors: signups },
    ],
    news: {
      views: newsViews,
      clicks: newsClicks,
      ctr: newsViews ? Math.round((newsClicks / newsViews) * 100) : 0,
      byProvider: newsByProvider.map((p) => ({ provider: p.provider, clicks: num(p.clicks) })),
    },
    gamesByType: gamesByType.map((g) => ({ gameId: g.gameId, count: g._count })),
  });
}
