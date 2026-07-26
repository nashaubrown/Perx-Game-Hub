import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';

/**
 * Admin book upload — how local Maldivian authors and cafe-curated picks get
 * into the catalog. multipart/form-data: file (epub/pdf), cover (optional
 * image), title, author, genre, curated.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Send multipart form data.' }, { status: 400 });

  const file = form.get('file');
  const title = String(form.get('title') ?? '').trim();
  const author = String(form.get('author') ?? '').trim();
  const genre = String(form.get('genre') ?? 'Local').trim();
  const curated = form.get('curated') === 'true' || form.get('curated') === 'on';

  if (!(file instanceof File) || !title || !author) {
    return NextResponse.json({ error: 'File, title and author are required.' }, { status: 400 });
  }
  const ext = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : file.name.toLowerCase().endsWith('.epub') ? 'epub' : null;
  if (!ext) return NextResponse.json({ error: 'Only EPUB or PDF files.' }, { status: 400 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: 'Max 50 MB.' }, { status: 400 });

  const dir = path.join(process.cwd(), 'storage', 'uploads');
  fs.mkdirSync(dir, { recursive: true });

  const book = await db.book.create({
    data: { title, author, genre, curated, format: ext === 'pdf' ? 'PDF' : 'EPUB' },
  });

  const filePath = path.join(dir, `${book.id}.${ext}`);
  fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));

  let coverUrl: string | undefined;
  const cover = form.get('cover');
  if (cover instanceof File && cover.size > 0 && cover.size < 5 * 1024 * 1024) {
    const coverExt = (cover.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const coverName = `${book.id}-cover.${coverExt}`;
    const publicDir = path.join(process.cwd(), 'public', 'covers');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, coverName), Buffer.from(await cover.arrayBuffer()));
    coverUrl = `/covers/${coverName}`;
  }

  await db.book.update({ where: { id: book.id }, data: { filePath, coverUrl } });
  return NextResponse.json({ ok: true, bookId: book.id });
}
