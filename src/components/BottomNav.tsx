'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Play', icon: '🎮' },
  { href: '/books', label: 'Books', icon: '📚' },
  { href: '/news', label: 'News', icon: '📰' },
  { href: '/leaderboard', label: 'Ranks', icon: '🏆' },
  { href: '/rewards', label: 'Rewards', icon: '🎁' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

// hidden during gameplay + reading so the whole screen belongs to the game/book
const HIDDEN_PREFIXES = ['/lobby/', '/read/', '/login', '/signup', '/forgot', '/reset'];

export function BottomNav() {
  const pathname = usePathname();
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors duration-[160ms] ${
                active ? 'text-perx-light' : 'text-ink-400'
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
