'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, CardTitle, Input, Label, Spinner, Switch } from '@/components/ui'
import { useApi, apiSend, monthLabel } from '@/lib/client'
import { formatMoney, toMinor, toMajor } from '@/lib/money'
import type { OverviewPayload } from '@/lib/overview'

interface SimDebt {
  id: string
  name: string
  balance: number
  method: string
  ibraAvailable: boolean
}

interface SimResponse {
  result: {
    monthsToFree: number | null
    totalInterest: number
    totalPaid: number
    totalRebate: number
    budgetShortfall: boolean
    order: string[]
    months: Array<{
      month: number
      totalBalance: number
      totalPayment: number
      totalInterest: number
      perDebt: Array<{ debtId: string; payment: number; balance: number }>
    }>
  }
  baseline: { monthsToFree: number | null; totalInterest: number }
  debts: SimDebt[]
}

interface Snapshot {
  label: string
  monthsToFree: number | null
  totalInterest: number
  totalRebate: number
}

export default function SimulatorPage() {
  const { data: ov } = useApi<{ overview: OverviewPayload | null }>('/api/overview')
  const overview = ov?.overview

  const [budget, setBudget] = useState<number | null>(null)
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball' | 'custom'>('avalanche')
  const [order, setOrder] = useState<string[]>([])
  const [lumps, setLumps] = useState<Array<{ month: string; amount: string }>>([])
  const [ibra, setIbra] = useState<Record<string, boolean>>({})
  const [sim, setSim] = useState<SimResponse | null>(null)
  const [pinned, setPinned] = useState<Snapshot | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragIndex = useRef<number | null>(null)

  // Initialize controls from the live plan once loaded
  useEffect(() => {
    if (!overview || budget !== null) return
    setBudget(overview.budget.monthlyBudget)
    setStrategy(overview.profile.strategy)
    setOrder(overview.debts.filter((d) => d.balance > 0).map((d) => d.id))
    setIbra(
      Object.fromEntries(
        overview.debts.filter((d) => d.interestMethod === 'fixed_profit').map((d) => [d.id, d.ibraAvailable]),
      ),
    )
  }, [overview, budget])

  // Debounced simulation on any control change
  useEffect(() => {
    if (budget === null) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setBusy(true)
      try {
        const res = await apiSend('/api/simulate', 'POST', {
          monthlyBudget: budget,
          strategy,
          customOrder: strategy === 'custom' ? order : undefined,
          lumpSums: lumps
            .filter((l) => parseInt(l.month) > 0 && toMinor(l.amount) > 0)
            .map((l) => ({ month: parseInt(l.month), amount: toMinor(l.amount) })),
          ibraOverrides: ibra,
        })
        setSim(res)
      } finally {
        setBusy(false)
      }
    }, 350)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [budget, strategy, order, lumps, ibra])

  const currency = overview?.profile.currency ?? 'MVR'
  const fmt = (v: number) => formatMoney(v, currency)
  const minTotal = overview?.budget.minPaymentsTotal ?? 0
  const maxBudget = Math.max((overview?.profile.monthlyIncome ?? 0), minTotal * 2, budget ?? 0)
  const debtName = (id: string) => sim?.debts.find((d) => d.id === id)?.name ?? overview?.debts.find((d) => d.id === id)?.name ?? id

  const fixedProfitDebts = useMemo(
    () => (overview?.debts ?? []).filter((d) => d.interestMethod === 'fixed_profit' && d.balance > 0),
    [overview],
  )

  function freeDate(months: number | null): string {
    if (months === null) return 'not within 50 years'
    const d = new Date()
    d.setMonth(d.getMonth() + months)
    return monthLabel(d)
  }

  function move(id: string, dir: -1 | 1) {
    setOrder((o) => {
      const i = o.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= o.length) return o
      const next = [...o]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  if (!overview) return <Spinner />
  if (!overview.debts.some((d) => d.balance > 0)) {
    return <p className="py-10 text-center text-muted">All clear — nothing left to simulate! 🎉</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">What-if simulator</h1>

      <Card className="flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between">
            <Label className="mb-0">Monthly amount committed to debt</Label>
            <span className="text-sm font-bold">{fmt(budget ?? 0)}</span>
          </div>
          <input
            type="range"
            min={minTotal}
            max={maxBudget}
            step={100 * 100}
            value={budget ?? minTotal}
            onChange={(e) => setBudget(parseInt(e.target.value))}
          />
          <div className="mt-1 flex items-center justify-between text-xs text-muted">
            <span>minimums only ({fmt(minTotal)})</span>
            <Input
              className="w-28 text-right"
              inputMode="decimal"
              value={budget !== null ? String(toMajor(budget)) : ''}
              onChange={(e) => setBudget(toMinor(e.target.value || '0'))}
            />
          </div>
        </div>

        <div>
          <Label>Strategy</Label>
          <div className="flex gap-2">
            {(['avalanche', 'snowball', 'custom'] as const).map((s) => (
              <Button key={s} variant={strategy === s ? 'primary' : 'secondary'} size="sm" onClick={() => setStrategy(s)}>
                {s === 'avalanche' ? 'Avalanche (math)' : s === 'snowball' ? 'Snowball (wins)' : 'Custom'}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            Avalanche = highest effective annual rate first. Snowball = smallest balance first for quick wins.
          </p>
        </div>

        {strategy === 'custom' && (
          <div>
            <Label>Priority order (drag or use arrows — top gets extra money first)</Label>
            <ul className="flex flex-col gap-1">
              {order.map((id, i) => (
                <li
                  key={id}
                  draggable
                  onDragStart={() => (dragIndex.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const from = dragIndex.current
                    if (from === null || from === i) return
                    setOrder((o) => {
                      const next = [...o]
                      const [moved] = next.splice(from, 1)
                      next.splice(i, 0, moved)
                      return next
                    })
                    dragIndex.current = null
                  }}
                  className="flex cursor-grab items-center gap-2 rounded border border-border bg-surface2 px-3 py-2 text-sm"
                >
                  <span className="text-muted">☰</span>
                  <span className="flex-1">{i + 1}. {debtName(id)}</span>
                  <Button variant="ghost" size="sm" onClick={() => move(id, -1)} aria-label="Move up">↑</Button>
                  <Button variant="ghost" size="sm" onClick={() => move(id, 1)} aria-label="Move down">↓</Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <Label>One-off lump sums</Label>
          {lumps.map((l, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <span className="text-sm text-muted">In month</span>
              <Input className="w-16" inputMode="numeric" value={l.month} onChange={(e) => setLumps((xs) => xs.map((x, j) => (j === i ? { ...x, month: e.target.value } : x)))} placeholder="3" />
              <span className="text-sm text-muted">pay extra</span>
              <Input className="w-28" inputMode="decimal" value={l.amount} onChange={(e) => setLumps((xs) => xs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder="10000" />
              <Button variant="ghost" size="sm" onClick={() => setLumps((xs) => xs.filter((_, j) => j !== i))}>✕</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setLumps((xs) => [...xs, { month: '1', amount: '' }])}>
            + Add lump sum (bonus, Ramadan allowance…)
          </Button>
        </div>

        {fixedProfitDebts.length > 0 && (
          <div>
            <Label>Ibra’ (early settlement rebate) what-ifs</Label>
            <div className="flex flex-col gap-2">
              {fixedProfitDebts.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded border border-border bg-surface2 px-3 py-2">
                  <span className="text-sm">{d.name}</span>
                  <Switch checked={ibra[d.id] ?? false} onChange={(v) => setIbra((x) => ({ ...x, [d.id]: v }))} label={ibra[d.id] ? 'rebate: yes' : 'rebate: no'} />
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              Without the rebate, prepaying a fixed-profit debt saves zero — the plan automatically deprioritizes it.
            </p>
          </div>
        )}
      </Card>

      {/* Side-by-side results */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-primary/50">
          <CardTitle>This scenario {busy && '…'}</CardTitle>
          {sim ? (
            <>
              <p className="text-lg font-bold">{freeDate(sim.result.monthsToFree)}</p>
              <p className="text-sm text-muted">{sim.result.monthsToFree ?? '600+'} months</p>
              <p className="mt-1 text-sm">Interest: <strong>{fmt(sim.result.totalInterest)}</strong></p>
              {sim.result.totalRebate > 0 && (
                <p className="text-sm text-success">Ibra’ rebate saved: {fmt(sim.result.totalRebate)}</p>
              )}
              {sim.result.budgetShortfall && (
                <Badge tone="warning" className="mt-2">budget below minimums</Badge>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() =>
                  setPinned({
                    label: `${strategy} @ ${fmt(budget ?? 0)}`,
                    monthsToFree: sim.result.monthsToFree,
                    totalInterest: sim.result.totalInterest,
                    totalRebate: sim.result.totalRebate,
                  })
                }
              >
                Pin for comparison
              </Button>
            </>
          ) : (
            <Spinner />
          )}
        </Card>

        <Card>
          <CardTitle>Minimums only</CardTitle>
          {sim && (
            <>
              <p className="text-lg font-bold">{freeDate(sim.baseline.monthsToFree)}</p>
              <p className="text-sm text-muted">{sim.baseline.monthsToFree ?? '600+'} months</p>
              <p className="mt-1 text-sm">Interest: <strong>{fmt(sim.baseline.totalInterest)}</strong></p>
              {sim.result.monthsToFree !== null && sim.baseline.monthsToFree !== null && (
                <p className="mt-2 text-sm text-success">
                  Your scenario is {sim.baseline.monthsToFree - sim.result.monthsToFree} months sooner and saves{' '}
                  {fmt(Math.max(0, sim.baseline.totalInterest - sim.result.totalInterest))}.
                </p>
              )}
            </>
          )}
        </Card>

        <Card>
          <CardTitle>Pinned scenario</CardTitle>
          {pinned ? (
            <>
              <p className="text-xs text-muted">{pinned.label}</p>
              <p className="text-lg font-bold">{freeDate(pinned.monthsToFree)}</p>
              <p className="text-sm text-muted">{pinned.monthsToFree ?? '600+'} months</p>
              <p className="mt-1 text-sm">Interest: <strong>{fmt(pinned.totalInterest)}</strong></p>
              {sim?.result.monthsToFree != null && pinned.monthsToFree != null && (
                <p className="mt-2 text-sm">
                  Current is{' '}
                  <strong className={sim.result.monthsToFree <= pinned.monthsToFree ? 'text-success' : 'text-danger'}>
                    {Math.abs(pinned.monthsToFree - sim.result.monthsToFree)} months{' '}
                    {sim.result.monthsToFree <= pinned.monthsToFree ? 'sooner' : 'later'}
                  </strong>{' '}
                  and {fmt(Math.abs(pinned.totalInterest - sim.result.totalInterest))}{' '}
                  {sim.result.totalInterest <= pinned.totalInterest ? 'cheaper' : 'more expensive'}.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Tune the controls, then pin a scenario to compare against.</p>
          )}
        </Card>
      </div>

      {/* Month-by-month schedule */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle className="mb-0">Month-by-month schedule</CardTitle>
          <Button variant="secondary" size="sm" onClick={() => setShowSchedule((s) => !s)}>
            {showSchedule ? 'Hide' : 'Show'}
          </Button>
        </div>
        {showSchedule && sim && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="py-2 pr-2">Month</th>
                  {sim.result.order.map((id) => (
                    <th key={id} className="py-2 pr-2">{debtName(id)}</th>
                  ))}
                  <th className="py-2 pr-2 text-right">Interest</th>
                  <th className="py-2 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {sim.result.months.map((m) => (
                  <tr key={m.month} className="border-b border-border/50">
                    <td className="py-1.5 pr-2 font-medium">{m.month}</td>
                    {sim.result.order.map((id) => {
                      const row = m.perDebt.find((r) => r.debtId === id)
                      return (
                        <td key={id} className="py-1.5 pr-2 tabular-nums">
                          {row && row.payment > 0 ? formatMoney(row.payment, currency).replace(`${currency} `, '') : '—'}
                        </td>
                      )
                    })}
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(m.totalInterest, currency).replace(`${currency} `, '')}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{formatMoney(m.totalBalance, currency).replace(`${currency} `, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-center text-xs text-muted">Estimates only — actual bank calculations may differ slightly.</p>
    </div>
  )
}
