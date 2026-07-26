/** Maldives time (UTC+5) — daily puzzles and streaks roll over on local midnight. */
export function todayMV(): string {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function yesterdayMV(): string {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}
