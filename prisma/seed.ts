import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import books from '../data/books.json';

const db = new PrismaClient();

async function main() {
  // ---- game registry -------------------------------------------------------
  const games = [
    { id: 'trivia', name: 'Trivia Battle', tagline: 'Fast answers score more. 10 questions.', multi: true, minPlayers: 2, maxPlayers: 8 },
    { id: 'wordrush', name: 'Word Rush', tagline: 'One grid, 90 seconds. Unique words score double.', multi: true, minPlayers: 2, maxPlayers: 8 },
    { id: 'emoji', name: 'Emoji Guess', tagline: 'One player picks emojis, everyone races to guess.', multi: true, minPlayers: 3, maxPlayers: 8 },
    { id: 'chess', name: 'Chess', tagline: 'The classic. No clock — cafe pace.', multi: true, minPlayers: 2, maxPlayers: 2 },
    { id: 'rummy', name: 'Gin Rummy', tagline: 'Draw, meld, knock under 10 deadwood.', multi: true, minPlayers: 2, maxPlayers: 2 },
    { id: 'ludo', name: 'Ludo', tagline: 'Roll a 6, race your four home, capture on the way.', multi: true, minPlayers: 2, maxPlayers: 4 },
    { id: '21q', name: '21 Questions', tagline: 'Date night. 21 questions, light to deep — answer out loud.', multi: true, minPlayers: 2, maxPlayers: 2 },
    { id: 'truthdare', name: 'Truth or Dare', tagline: 'Cafe-friendly truths and table dares. Chicken at your peril.', multi: true, minPlayers: 2, maxPlayers: 8 },
    { id: 'memory', name: 'Memory Match', tagline: 'Find all the pairs in as few flips as you can.', multi: false, minPlayers: 1, maxPlayers: 1 },
    { id: '2048', name: '2048', tagline: 'Swipe tiles, merge numbers, reach 2048.', multi: false, minPlayers: 1, maxPlayers: 1 },
    { id: 'daily', name: 'Daily Word', tagline: 'One word a day. Keep your streak alive.', multi: false, minPlayers: 1, maxPlayers: 1 },
    { id: 'pacman', name: 'Pac-Man', tagline: 'Clear the maze, dodge the ghosts.', multi: false, minPlayers: 1, maxPlayers: 1 },
  ];
  for (const g of games) {
    await db.game.upsert({ where: { id: g.id }, create: g, update: g });
  }

  // ---- demo users ----------------------------------------------------------
  const password = await bcrypt.hash('perxplay', 10);
  const mkUser = (handle: string, email: string, role: 'PLAYER' | 'MERCHANT' | 'ADMIN' = 'PLAYER') =>
    db.user.upsert({
      where: { handle },
      create: { handle, email, passwordHash: password, role },
      update: {},
    });

  const nashau = await mkUser('nashau', 'nashau@perx.mv');
  const aisha = await mkUser('aisha', 'aisha@example.com');
  const hassan = await mkUser('hassan', 'hassan@example.com');
  await mkUser('mariyam', 'mariyam@example.com');
  const admin = await mkUser('admin', 'admin@perx.mv', 'ADMIN');
  const merchant = await mkUser('meraki', 'owner@meraki.mv', 'MERCHANT');

  // ---- venues --------------------------------------------------------------
  const meraki = await db.venue.upsert({
    where: { slug: 'meraki-coffee' },
    create: {
      name: 'Meraki Coffee Roasters',
      slug: 'meraki-coffee',
      location: 'Malé, Maldives',
      analyticsToken: crypto.randomBytes(24).toString('hex'),
    },
    update: {},
  });
  const seahouse = await db.venue.upsert({
    where: { slug: 'sea-house' },
    create: {
      name: 'Sea House Café',
      slug: 'sea-house',
      location: 'Hulhumalé, Maldives',
      analyticsToken: crypto.randomBytes(24).toString('hex'),
    },
    update: {},
  });
  await db.merchantVenue.upsert({
    where: { userId_venueId: { userId: merchant.id, venueId: meraki.id } },
    create: { userId: merchant.id, venueId: meraki.id },
    update: {},
  });
  await db.merchantVenue.upsert({
    where: { userId_venueId: { userId: merchant.id, venueId: seahouse.id } },
    create: { userId: merchant.id, venueId: seahouse.id },
    update: {},
  });

  // ---- rewards -------------------------------------------------------------
  const rewards = [
    { venueId: meraki.id, name: 'Free flat white', description: 'Any size, any milk.', costPoints: 500 },
    { venueId: meraki.id, name: '20% off your table', description: 'Whole bill, dine-in.', costPoints: 1200 },
    { venueId: seahouse.id, name: 'Free mango juice', description: 'Fresh, not from concentrate.', costPoints: 400 },
    { venueId: seahouse.id, name: 'Free dessert', description: 'Chef’s pick of the day.', costPoints: 800 },
  ];
  for (const r of rewards) {
    const existing = await db.reward.findFirst({ where: { venueId: r.venueId, name: r.name } });
    if (!existing) await db.reward.create({ data: r });
  }

  // ---- book catalog (Project Gutenberg classics) ---------------------------
  for (const b of books) {
    await db.book.upsert({
      where: { gutenbergId: b.gutenbergId },
      create: {
        title: b.title,
        author: b.author,
        genre: b.genre,
        format: 'EPUB',
        gutenbergId: b.gutenbergId,
        sourceUrl: `https://www.gutenberg.org/cache/epub/${b.gutenbergId}/pg${b.gutenbergId}-images.epub`,
        coverUrl: `https://www.gutenberg.org/cache/epub/${b.gutenbergId}/pg${b.gutenbergId}.cover.medium.jpg`,
      },
      update: {},
    });
  }

  // ---- demo lobby so the product is playable immediately -------------------
  const demo = await db.lobby.upsert({
    where: { code: 'PERX23' },
    create: {
      code: 'PERX23',
      gameId: 'trivia',
      hostUserId: nashau.id,
      venueId: meraki.id,
      status: 'OPEN',
    },
    update: { status: 'OPEN' },
  });
  for (const u of [nashau, aisha, hassan]) {
    await db.lobbyPlayer.upsert({
      where: { lobbyId_nickname: { lobbyId: demo.id, nickname: `@${u.handle}` } },
      create: { lobbyId: demo.id, userId: u.id, nickname: `@${u.handle}` },
      update: {},
    });
  }

  // ---- starter points so leaderboards aren't empty -------------------------
  const starterLedger = await db.pointsLedger.findFirst({ where: { reason: 'signup_bonus' } });
  if (!starterLedger) {
    for (const [u, amount] of [
      [nashau, 25],
      [aisha, 25],
      [hassan, 25],
      [admin, 25],
    ] as const) {
      await db.pointsLedger.create({
        data: { userId: u.id, amount, reason: 'signup_bonus' },
      });
    }
  }

  console.log('Seeded. Demo login: any of @nashau / @aisha / @hassan / @admin / @meraki — password "perxplay".');
  console.log('Demo lobby code: PERX23 (Trivia Battle at Meraki Coffee).');
  console.log(`Analytics tokens — Meraki: ${meraki.analyticsToken}  SeaHouse: ${seahouse.analyticsToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
