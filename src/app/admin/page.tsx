'use client';

import { useState } from 'react';
import { TopBar } from '@/components/TopBar';

/** Admin: upload EPUB/PDF books — local Maldivian authors, cafe picks. */
export default function AdminPage() {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/admin/books', { method: 'POST', body: form });
    const data = await res.json();
    setBusy(false);
    setMsg(res.ok ? 'Book added to the catalog.' : data.error ?? 'Upload failed.');
    if (res.ok) (e.target as HTMLFormElement).reset();
  }

  return (
    <main className="safe-bottom px-4 animate-fade-up">
      <TopBar back="/profile" title="Add a book" />
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <input name="title" className="input" placeholder="Title" required />
        <input name="author" className="input" placeholder="Author" required />
        <input name="genre" className="input" placeholder="Genre (e.g. Local, Poetry)" />
        <label className="text-sm text-ink-400">
          Book file (EPUB or PDF)
          <input name="file" type="file" accept=".epub,.pdf" required className="input mt-1 pt-2.5" />
        </label>
        <label className="text-sm text-ink-400">
          Cover image (optional)
          <input name="cover" type="file" accept="image/*" className="input mt-1 pt-2.5" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="curated" type="checkbox" className="h-5 w-5 accent-perx" />
          Curated / local pick (badged in the catalog)
        </label>
        {msg && <p className="text-sm text-perx-light">{msg}</p>}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Uploading…' : 'Add book'}
        </button>
      </form>
    </main>
  );
}
