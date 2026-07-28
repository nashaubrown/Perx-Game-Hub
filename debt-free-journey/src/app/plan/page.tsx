'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge, Button, Card, CardTitle, EmptyState, Input, Modal, Spinner } from '@/components/ui'
import { Confetti } from '@/components/Confetti'
import { useApi, apiSend, monthLabel, todayInputValue } from '@/lib/client'
import { formatMoney, toMajor, toMinor } from '@/lib/money'
import type { MonthlyPlan } from '@/lib/overview'
import type { OverviewPayload } from '@/lib/overview'

export default function PlanPage() {
  const { data, loading, reload } = useApi<{ plan: MonthlyPlan | null }>('/api/plan')
  const { data: ov, reload: reloadOverview } = useApi<{ overview: OverviewPayload | null }>('/api/overview')
  const [paying, setPaying] = useState<{ debtId: string; debtName: string; amount: string; date: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [burst, setBurst] = useState(0)
  const [lastResult, setLastResult] = useState<{ before: number | null; after: number | null } | null>(null)

  if (loading) return <Spinner />
  const plan = data?.plan
  const currency = ov?.overview?.profile.currency ?? 'MVR'
  const fmt = (v: number) => formatMoney(v, currency)

  if (!plan || plan.items.length === 0) {
    return (
      <EmptyState
        title="No plan this month"
        hint="Add debts to get a concrete month-by-month action plan."
        action={
          <Link href="/debts">
            <Button>Add debts</Button>
          </Link>
        }
      />
    )
  }

  async function logPayment() {
    if (!paying) return
    setSaving(true)
    try {
      const before = data?.plan?.monthsToFree ?? null
      await apiSend('/api/payments', 'POST', {
        debtId: paying.debtId,
        amount: toMinor(paying.amount),
        date: new Date(paying.date).toISOString(),
        note: 'Monthly plan payment',
      })
      setPaying(null)
      reload()
      reloadOverview()
      // Re-fetch to compare the new projection with the old one
      const fresh = await apiSend('/api/plan', 'GET')
      const after = fresh?.plan?.monthsToFree ?? null
      setLastResult({ before, after })
      if (before !== null && after !== null && after <= before) setBurst((b) => b + 1)
    } finally {
      setSaving(false)
    }
  }

  const done = plan.items.filter((i) => i.paidThisMonth >= i.planned)
  const totalPaid = plan.items.reduce((a, i) => a + Math.min(i.paidThisMonth, i.planned), 0)

  return (
    <div className="flex flex-col gap-4">
      <Confetti burst={burst} />
      <h1 className="text-xl font-bold">This month’s plan</h1>
      <Card>
        <CardTitle>Payday {new Date(plan.payday).getDate()} · {monthLabel(plan.payday)}</CardTitle>
        <p className="text-sm">
          Pay a total of <strong>{fmt(plan.total)}</strong> across {plan.items.length} debt{plan.items.length === 1 ? '' : 's'}
          {plan.monthsToFree && (
            <> — stay on this and you’re debt-free in <strong>{plan.monthsToFree} months</strong>.</>
          )}
        </p>
        <p className="mt-1 text-xs text-muted">
          {done.length}/{plan.items.length} done · {fmt(totalPaid)} of {fmt(plan.total)} paid this month
        </p>
      </Card>

      {lastResult && lastResult.before !== null && lastResult.after !== null && (
        <Card className={lastResult.after < lastResult.before ? 'border-success/50' : lastResult.after > lastResult.before ? 'border-warning/50' : ''}>
          {lastResult.after < lastResult.before ? (
            <p className="text-sm text-success">
              🎉 That payment pulled your debt-free date <strong>{lastResult.before - lastResult.after} month{lastResult.before - lastResult.after === 1 ? '' : 's'} closer</strong>!
            </p>
          ) : lastResult.after > lastResult.before ? (
            <p className="text-sm">
              Your debt-free date moved {lastResult.after - lastResult.before} month{lastResult.after - lastResult.before === 1 ? '' : 's'} later — that happens, and it’s
              recoverable. A little extra next payday catches you up. You’ve got this.
            </p>
          ) : (
            <p className="text-sm text-success">Payment logged — right on track. 👊</p>
          )}
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {plan.items.map((item) => {
          const paid = item.paidThisMonth >= item.planned
          const partially = !paid && item.paidThisMonth > 0
          return (
            <Card key={item.debtId} className={paid ? 'opacity-70' : ''}>
              <div className="flex items-center gap-3">
                <button
                  aria-label={paid ? 'Paid' : `Log payment for ${item.debtName}`}
                  onClick={() =>
                    !paid &&
                    setPaying({
                      debtId: item.debtId,
                      debtName: item.debtName,
                      amount: String(toMajor(Math.max(0, item.planned - item.paidThisMonth))),
                      date: todayInputValue(),
                    })
                  }
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors ${
                    paid ? 'border-success bg-success text-white' : 'border-border hover:border-primary'
                  }`}
                >
                  {paid ? '✓' : ''}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.debtName}</p>
                  <p className="text-sm text-muted">
                    Pay <strong className="text-text">{fmt(item.planned)}</strong>
                    {!item.isMinimumOnly && <Badge tone="primary" className="ml-2">includes extra</Badge>}
                    {partially && <> · {fmt(item.paidThisMonth)} logged so far</>}
                  </p>
                </div>
                {!paid && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setPaying({
                        debtId: item.debtId,
                        debtName: item.debtName,
                        amount: String(toMajor(Math.max(0, item.planned - item.paidThisMonth))),
                        date: todayInputValue(),
                      })
                    }
                  >
                    Log
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-muted">
        Checking an item pre-fills the payment form. Paid less than planned? The plan recalculates honestly — no
        judgement, just the new date and how to catch up.
      </p>

      <Modal open={paying !== null} onClose={() => setPaying(null)} title={`Log payment — ${paying?.debtName ?? ''}`}>
        {paying && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Amount ({currency})</label>
              <Input inputMode="decimal" value={paying.amount} onChange={(e) => setPaying({ ...paying, amount: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Date</label>
              <Input type="date" value={paying.date} onChange={(e) => setPaying({ ...paying, date: e.target.value })} />
            </div>
            <Button onClick={logPayment} disabled={saving || toMinor(paying.amount) <= 0}>
              {saving ? 'Saving…' : 'Log payment'}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
