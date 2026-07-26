'use client';

import { Avatar } from '@/components/Avatar';

export function Scoreboard({
  entries,
  you,
  deltas,
}: {
  entries: { key: string; nickname: string; score: number }[];
  you: string | null;
  deltas?: Record<string, number>;
}) {
  return (
    <div className="card p-3">
      <ul className="flex flex-col gap-2">
        {entries.map((e, i) => (
          <li
            key={e.key}
            className={`flex items-center gap-2 rounded-md px-2 py-1 ${e.key === you ? 'bg-perx/10' : ''}`}
          >
            <span className="w-5 text-center text-sm font-bold text-ink-500">{i + 1}</span>
            <Avatar name={e.nickname} size={28} />
            <span className="flex-1 truncate text-sm font-medium">{e.nickname}</span>
            {deltas?.[e.key] ? <span className="text-xs font-bold text-perx-light">+{deltas[e.key]}</span> : null}
            <span className="font-mono text-sm font-bold">{e.score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
