'use client';

/**
 * Generated identicon — a deterministic 5x5 mirrored pixel grid from the
 * handle/nickname, tinted from a small brand-adjacent palette. No uploads
 * needed for MVP.
 */
const COLORS = ['#34C759', '#5BA6FE', '#F0398F', '#F59E0B', '#8B45D4', '#00A6FF'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const h = hash(name);
  const color = COLORS[h % COLORS.length];
  const cells: boolean[] = [];
  for (let i = 0; i < 15; i++) cells.push(((h >> i % 28) & 1) === 1 || ((h >> ((i * 7) % 28)) & 3) === 3);

  return (
    <svg width={size} height={size} viewBox="0 0 5 5" className="rounded-md bg-white/10" aria-hidden>
      {cells.map((on, i) => {
        if (!on) return null;
        const row = Math.floor(i / 3);
        const col = i % 3;
        return (
          <g key={i} fill={color}>
            <rect x={col} y={row} width={1.05} height={1.05} />
            {col < 2 && <rect x={4 - col} y={row} width={1.05} height={1.05} />}
          </g>
        );
      })}
    </svg>
  );
}
