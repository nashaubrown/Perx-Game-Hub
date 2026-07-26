'use client';

import { useEffect, useState } from 'react';

export type Me = {
  id: string;
  handle: string;
  role: string;
  balance: number;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  booksRead: number;
  dailyStreak: number;
};

export function useMe() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = loading
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);
  return me;
}
