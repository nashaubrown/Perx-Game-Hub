'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Button, Card, CardTitle, EmptyState, Spinner } from '@/components/ui'
import { SpendChart } from '@/components/charts'
import { useApi } from '@/lib/client'
import { formatMoney } from '@/lib/money'

interface InsightsPayload {
  byMonth: Array<{ month: string; category: string; total: number }>
  actualAverages: Record<string, number>
  manualExpenses: Array<{ id: string; name: string; amount: number }>
  momChanges: Array<{ category: string; latest: number; previous: number; change: number }>
  leaks: Array<{ description: string; category: string; monthsSeen: number; monthlyAverage: number; monthsCloser: number }>
  hasTransactions: boolean
}

export default function InsightsPage() {
  const { data, loading } = useApi<InsightsPayload>('/api/insights')

  const chart = useMemo(() => {
    if (!data) return { rows: [] as Array<Record<string, number | string>>, categories: [] as string[] }
    const months = [...new Set(data.byMonth.map((r) => r.month))].sort()
    const categories = [...new Set(data.byMonth.map((r) => r.category))]
    const rows = months.map((month) => {
      const row: Record<string, number | string> = { month }
      for (const c of categories) {
        row[c] = data.byMonth.find((r) => r.month === month && r.category === c)?.total ?? 0
      }
      return row
    })
    return { rows, categories }
  }, [data])

  if (loading) return <Spinner />
  if (!data?.hasTransactions) {
    return (
      <EmptyState
        title="No spending data yet"
        hint="Import a bank or card statement and this page fills with real spending insights — including money leaks you could redirect at your debts."
        action={
          <Link href="/imports">
            <Button>Import a statement</Button>
          </Link>
        }
      />
    )
  }

  const manualTotal = data.manualExpenses.reduce((a, e) => a + e.amount, 0)
  const actualTotal = Object.values(data.actualAverages).reduce((a, v) => a + v, 0)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Spending insights</h1>

      <Card>
        <CardTitle>Spend by category</CardTitle>
        <SpendChart data={chart.rows} categories={chart.categories} currency="MVR" />
      </Card>

      <Card>
        <CardTitle>Estimated vs actual monthly spend</CardTitle>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted">Your estimates (onboarding)</p>
            <p className="text-lg font-bold">{formatMoney(manualTotal)}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {data.manualExpenses.map((e) => (
                <li key={e.id} className="flex justify-between">
                  <span className="text-muted">{e.name}</span>
                  <span className="tabular-nums">{formatMoney(e.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs text-muted">Actual (3-month rolling average)</p>
            <p className="text-lg font-bold">{formatMoney(actualTotal)}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {Object.entries(data.actualAverages)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, v]) => (
                  <li key={cat} className="flex justify-between">
                    <span className="text-muted">{cat}</span>
                    <span className="tabular-nums">{formatMoney(v)}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Once statements are imported, the plan uses your <em>actual</em> averages — not the estimates — to compute
          free cash flow and your debt-free date.
        </p>
      </Card>

      {data.momChanges.length > 0 && (
        <Card>
          <CardTitle>Month-over-month changes</CardTitle>
          <div className="flex flex-col gap-1 text-sm">
            {data.momChanges.slice(0, 8).map((c) => (
              <div key={c.category} className="flex items-center justify-between">
                <span>{c.category}</span>
                <span className={`tabular-nums font-medium ${c.change > 0 ? 'text-danger' : c.change < 0 ? 'text-success' : 'text-muted'}`}>
                  {c.change > 0 ? '▲' : c.change < 0 ? '▼' : '–'} {formatMoney(Math.abs(c.change))}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Unusual spikes show up here — worth a look if a category jumps.</p>
        </Card>
      )}

      {data.leaks.length > 0 && (
        <Card className="border-warning/40">
          <CardTitle>💧 Money leaks — recurring spend that could clear debt faster</CardTitle>
          <div className="flex flex-col divide-y divide-border">
            {data.leaks.map((l) => (
              <div key={l.description} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{l.description}</span>
                  <span className="tabular-nums">{formatMoney(l.monthlyAverage)}/mo</span>
                </div>
                <p className="text-xs text-muted">
                  {l.category} · seen {l.monthsSeen} months
                  {l.monthsCloser > 0 && (
                    <>
                      {' · '}
                      <span className="font-medium text-success">
                        redirecting this brings your debt-free date {l.monthsCloser} month{l.monthsCloser === 1 ? '' : 's'} closer
                      </span>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
