/**
 * Pre-downloads the seeded Project Gutenberg EPUBs into storage/books so the
 * reader works offline-ish. Optional — the app also fetches+caches each book
 * on first open (see /api/books/[id]/file).
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const dir = path.join(process.cwd(), 'storage', 'books');

async function main() {
  fs.mkdirSync(dir, { recursive: true });
  const books = await db.book.findMany({ where: { sourceUrl: { not: null }, filePath: null } });
  console.log(`Fetching ${books.length} book(s)…`);
  let ok = 0;
  for (const book of books) {
    const dest = path.join(dir, `${book.id}.epub`);
    try {
      const res = await fetch(book.sourceUrl!, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      await db.book.update({ where: { id: book.id }, data: { filePath: dest } });
      ok++;
      console.log(`  ✓ ${book.title} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.warn(`  ✗ ${book.title}: ${(err as Error).message} — will fetch on first open instead`);
    }
  }
  console.log(`Done — ${ok}/${books.length} cached locally.`);
}

main().finally(() => db.$disconnect());
