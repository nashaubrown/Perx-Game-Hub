'use client'

import Link from 'next/link'
import { Card } from '@/components/ui'

const LINKS = [
  { href: '/payments', label: 'Payments', icon: '💸', hint: 'Log and review every payment' },
  { href: '/imports', label: 'Statement imports', icon: '📄', hint: 'Upload bank & card statements' },
  { href: '/insights', label: 'Spending insights', icon: '📊', hint: 'Where the money actually goes' },
  { href: '/settings', label: 'Settings', icon: '⚙️', hint: 'Profile, budget, rules, themes' },
]

export default function MorePage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">More</h1>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href}>
          <Card className="flex items-center gap-3 transition-colors hover:border-primary/50">
            <span className="text-2xl" aria-hidden>
              {l.icon}
            </span>
            <div>
              <p className="font-medium">{l.label}</p>
              <p className="text-sm text-muted">{l.hint}</p>
            </div>
          </Card>
        </Link>
      ))}
      <p className="mt-4 text-center text-xs text-muted">
        Projections are estimates. This is a planning tool, not financial advice.
      </p>
    </div>
  )
}
