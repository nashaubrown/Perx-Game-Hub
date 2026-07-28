'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, CardTitle, EmptyState, Progress, Spinner } from '@/components/ui'
import { Confetti } from '@/components/Confetti'
import { ProjectionChart } from '@/components/charts'
import { useApi, apiSend, monthLabel } from '@/lib/client'
import { formatMoney } from '@/lib/money'
import type { OverviewPayload } from '@/lib/overview'

export default function DashboardPage() {
  const router = useRouter()
  const { data, loading, error, reload } = useApi<{ overview: OverviewPayload | null }>('/api/overview')
  const [burst, setBurst] = useState(0)

  const overview = data?.overview

  useEffect(() => {
    if (data && !overview?.profile?.onboarded) router.replace('/onboarding')
  }, [data, overview, router])

  // Celebrate milestones achieved since the last visit
  useEffect(() => {
    if (!overview) return
    const achieved = overview.milestones.filter((m) => m.achieved).map((m) => m.key)
    const seen: string[] = JSON.parse(localStorage.getItem('dfj-celebrated') ?? '[]')
    const fresh = achieved.filter((k) => !seen.includes(k))
    if (fresh.length > 0) {
      setBurst((b) => b + 1)
      localStorage.setItem('dfj-celebrated', JSON.stringify(achieved))
    }
  }, [overview])

  if (loading) return <Spinner />
  if (error) return <p className="py-10 text-center text-danger">{error}</p>
  if (!overview?.profile?.onboarded) return <Spinner />

  const { currency } = overview.profile
  const { countdown, totals, budget, debts, comparison, milestones, pendingAdjustments } = overview
  const activeDebts = debts.filter((d) => d.balance > 0)
  const fmt = (v: number) => formatMoney(v, currency)

  return (
    <div className="flex flex-col gap-4">
      <Confetti burst={burst} />

      {activeDebts.length === 0 && totals.remaining === 0 && debts.length === 0 ? (
        <EmptyState
          title="Add your first debt to see your debt-free date"
          hint="The countdown, payoff plan and charts all light up once a debt is in."
          action={
            <Link href="/debts">
              <Button>Add a debt</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Countdown hero */}
          <Card className="bg-gradient-to-br from-primary/10 to-accent/10 text-center">
            {totals.remaining === 0 ? (
              <div className="py-4">
                <p className="text-4xl font-extrabold">🎉 DEBT FREE!</p>
                <p className="mt-2 text-muted">Every last laari paid. Incredible work.</p>
              </div>
            ) : countdown.monthsToFree ? (
              <div className="py-2">
                <p className="text-sm font-medium text-muted">Projected debt-free date</p>
                <p className="mt-1 text-3xl font-extrabold sm:text-4xl">{monthLabel(countdown.debtFreeDate!)}</p>
                <p className="mt-2 text-sm text-muted">
                  <span className="font-semibold text-text">{countdown.monthsToFree} months</span> to go
                  {countdown.baselineMonths && countdown.baselineMonths > countdown.monthsToFree && (
                    <> — {countdown.baselineMonths - countdown.monthsToFree} months faster than paying minimums only</>
                  )}
                </p>
              </div>
            ) : (
              <div className="py-2">
                <p className="text-2xl font-bold text-warning">Plan needs attention</p>
                <p className="mt-2 text-sm text-muted">
                  With the current budget the debts don’t clear. Try the simulator to find a workable plan.
                </p>
              </div>
            )}
            {countdown.budgetShortfall && (
              <p className="mt-2 rounded bg-warning/10 px-3 py-2 text-sm text-warning">
                Your minimum payments exceed the committed budget — free cash flow is negative.
              </p>
            )}
          </Card>

          {pendingAdjustments.length > 0 && (
            <Card className="border-warning/50">
              <CardTitle>Balance reconciliation needs your confirmation</CardTitle>
              {pendingAdjustments.map((p) => (
                <div key={p.importId} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <p className="text-sm">
                    Statement says <strong>{p.debtName}</strong> differs from the tracked balance by{' '}
                    <strong>{fmt(Math.abs(p.delta))}</strong> ({p.delta > 0 ? 'higher' : 'lower'}) — outside the
                    automatic range.
                  </p>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await apiSend(`/api/imports/${p.importId}/confirm-adjustment`, 'POST')
                      reload()
                    }}
                  >
                    Apply adjustment
                  </Button>
                </div>
              ))}
            </Card>
          )}

          {/* Key numbers */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <CardTitle>Total remaining</CardTitle>
              <p className="text-xl font-bold">{fmt(totals.remaining)}</p>
            </Card>
            <Card>
              <CardTitle>Paid so far</CardTitle>
              <p className="text-xl font-bold text-success">{fmt(totals.paidTotal)}</p>
            </Card>
            <Card>
              <CardTitle>Projected interest</CardTitle>
              <p className="text-xl font-bold">{fmt(totals.interestPaidProjected)}</p>
            </Card>
            <Card>
              <CardTitle>Interest saved vs minimums</CardTitle>
              <p className="text-xl font-bold text-success">{fmt(totals.interestSaved)}</p>
            </Card>
          </div>

          {/* Principal progress */}
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <CardTitle className="mb-0">Debt cleared</CardTitle>
              <span className="text-sm font-semibold">{totals.principalClearedPct}%</span>
            </div>
            <Progress value={totals.principalClearedPct} tone="success" />
            <p className="mt-2 text-xs text-muted">
              Free cash flow {fmt(budget.freeCashFlow)}/month · committing {fmt(budget.monthlyBudget)}/month to debt
              {budget.expensesActual !== null && ' · expenses from your real statement data'}
            </p>
          </Card>

          {/* Strategy comparison */}
          {comparison && activeDebts.length > 1 && (
            <Card>
              <CardTitle>Avalanche vs Snowball</CardTitle>
              <p className="text-sm">
                {comparison.interestDiff > 0 ? (
                  <>
                    Avalanche saves <strong>{fmt(Math.abs(comparison.interestDiff))}</strong>
                    {comparison.monthsDiff !== 0 && (
                      <> and {Math.abs(comparison.monthsDiff)} month{Math.abs(comparison.monthsDiff) === 1 ? '' : 's'}</>
                    )}{' '}
                    vs Snowball. Snowball clears small debts sooner — pick motivation or math with eyes open.
                  </>
                ) : (
                  <>Both strategies land within {fmt(Math.abs(comparison.interestDiff))} of each other here.</>
                )}
              </p>
              <p className="mt-1 text-xs text-muted">
                Avalanche: {comparison.avalancheMonths ?? '—'} months · {fmt(comparison.avalancheInterest)} interest — Snowball:{' '}
                {comparison.snowballMonths ?? '—'} months · {fmt(comparison.snowballInterest)} interest
              </p>
            </Card>
          )}

          {/* Projection chart */}
          {overview.projection.length > 0 && (
            <Card>
              <CardTitle>Projected balances</CardTitle>
              <ProjectionChart
                data={overview.projection}
                seriesNames={activeDebts.map((d) => d.name)}
                currency={currency}
              />
              <p className="mt-1 text-xs text-muted">Estimate — recalculated after every logged payment.</p>
            </Card>
          )}

          {/* Per-debt list in payoff order */}
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <CardTitle className="mb-0">Payoff order ({overview.profile.strategy})</CardTitle>
              <Link className="text-sm font-medium text-primary" href="/debts">
                Manage debts →
              </Link>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {debts.map((d, i) => (
                <div key={d.id} className="flex items-center gap-3 py-3">
                  <span className="w-6 text-center text-sm font-bold text-muted">{d.balance > 0 ? i + 1 : '✓'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{d.name}</p>
                      {d.interestMethod === 'fixed_profit' && !d.ibraAvailable && (
                        <Badge tone="warning">no ibra’ — deprioritized</Badge>
                      )}
                      {d.balance === 0 && <Badge tone="success">cleared</Badge>}
                    </div>
                    <Progress className="mt-1.5" value={d.progressPct} />
                    <p className="mt-1 text-xs text-muted">
                      {fmt(d.balance)} left · {(d.ear * 100).toFixed(1)}%/yr effective
                      {d.payoffDate && <> · clears {monthLabel(d.payoffDate)}</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Milestones */}
          <Card>
            <CardTitle>Milestones</CardTitle>
            <div className="flex flex-wrap gap-2">
              {milestones.map((m) => (
                <Badge key={m.key} tone={m.achieved ? 'success' : 'default'}>
                  {m.achieved ? '✓ ' : ''}
                  {m.label}
                </Badge>
              ))}
            </div>
          </Card>

          <p className="text-center text-xs text-muted">
            All projections are estimates. Debt-Free Journey is a planning tool, not financial advice.
          </p>
        </>
      )}
    </div>
  )
}
