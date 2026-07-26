import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';

/**
 * Streams the book file. Gutenberg books are fetched once and cached under
 * storage/books; admin uploads are already on disk.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const book = await db.book.findUnique({ where: { id: params.id } });
  if (!book) return NextResponse.json({ error: 'Book not found.' }, { status: 404 });

  let filePath = book.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    if (!book.sourceUrl) return NextResponse.json({ error: 'No file for this book yet.' }, { status: 404 });
    const dir = path.join(process.cwd(), 'storage', 'books');
    fs.mkdirSync(dir, { recursive: true });
    filePath = path.join(dir, `${book.id}.${book.format.toLowerCase()}`);
    try {
      const res = await fetch(book.sourceUrl, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
      await db.book.update({ where: { id: book.id }, data: { filePath } });
    } catch {
      return NextResponse.json(
        { error: 'Could not fetch this book right now. Try again in a minute.' },
        { status: 502 }
      );
    }
  }

  const data = fs.readFileSync(filePath);
  return new NextResponse(data, {
    headers: {
      'Content-Type': book.format === 'PDF' ? 'application/pdf' : 'application/epub+zip',
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
