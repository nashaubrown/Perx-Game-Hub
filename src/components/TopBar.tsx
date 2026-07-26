'use client';

import Link from 'next/link';
import Image from 'next/image';

export function TopBar({ title, back }: { title?: string; back?: string }) {
  return (
    <header className="flex h-14 items-center gap-3 px-4">
      {back ? (
        <Link href={back} className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-xl text-ink-400 active:bg-white/10" aria-label="Back">
          ←
        </Link>
      ) : (
        <Link href="/" aria-label="Perx Play home">
          <Image src="/brand/wordmark-white.svg" alt="PERX" width={72} height={20} priority />
        </Link>
      )}
      {title && <h1 className="text-lg font-bold">{title}</h1>}
    </header>
  );
}
