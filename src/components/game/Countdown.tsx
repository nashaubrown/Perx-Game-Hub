'use client';

import { useEffect, useState } from 'react';

export function Countdown({ endsAt }: { endsAt: number }) {
  const [left, setLeft] = useState(Math.max(0, endsAt - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, endsAt - Date.now())), 200);
    return () => clearInterval(t);
  }, [endsAt]);
  const seconds = Math.ceil(left / 1000);
  return (
    <span className={`font-mono text-base font-bold ${seconds <= 5 ? 'text-danger' : 'text-perx-light'}`}>
      {seconds}s
    </span>
  );
}
