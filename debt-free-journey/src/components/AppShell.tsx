'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'
import { cn } from './ui'

const NAV = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/plan', label: 'Plan', icon: '🗓️' },
  { href: '/debts', label: 'Debts', icon: '📋' },
  { href: '/simulator', label: 'Simulate', icon: '🧮' },
  { href: '/payments', label: 'Payments', icon: '💸' },
  { href: '/imports', label: 'Imports', icon: '📄' },
  { href: '/insights', label: 'Insights', icon: '📊' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

const MOBILE_NAV = NAV.slice(0, 4).concat([{ href: '/more', label: 'More', icon: '⋯' }])

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border bg-surface p-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2 text-lg font-bold">
          <span>🧭</span> Debt-Free Journey
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.href) ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface2 hover:text-text',
              )}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto px-2 text-[11px] leading-4 text-muted">
          Projections are estimates. This is a planning tool, not financial advice.
        </p>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span>🧭</span> Debt-Free Journey
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-4 md:pb-10 md:pl-60 md:pr-6 lg:pl-64">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 backdrop-blur md:hidden">
        {MOBILE_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
              isActive(item.href) ? 'text-primary' : 'text-muted',
            )}
          >
            <span className="text-base" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
