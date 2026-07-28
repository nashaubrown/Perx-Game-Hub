import { prisma } from './db'
import { derivedBalance, toEngineDebt } from './debts'
import { simulate, simulateMinimumsOnly, compareStrategies } from './engine/simulate'
import { payoffOrder } from './engine/strategies'
import { priorityRate } from './engine/rates'
import type { SimResult, StrategyId } from './engine/types'
import { actualMonthlyAverages, NON_SPEND_CATEGORIES } from './insights'

export interface PlanContext {
  profile: NonNullable<Awaited<ReturnType<typeof prisma.profile.findFirst>>>
  debts: Array<
    NonNullable<Awaited<ReturnType<typeof prisma.debt.findFirst>>> & {
      balance: number
      paidTotal: number
      ear: number
    }
  >
  expensesManual: number
  expensesActual: number | null // rolling 3-month average from imported transactions
  expensesEffective: number // actual when available, else manual
  minPaymentsTotal: number
  freeCashFlow: number
  monthlyBudget: number
  strategy: StrategyId
}

export async function getPlanContext(): Promise<PlanContext | null> {
  const profile = await prisma.profile.findFirst({ include: { expenses: true } })
  if (!profile) return null
  const debtsRaw = await prisma.debt.findMany({ include: { payments: true }, orderBy: { sortOrder: 'asc' } })
  const transactions = await prisma.transaction.findMany({ where: { import: { status: 'applied' } } })

  const debts = debtsRaw.map((d) => ({
    ...d,
    balance: derivedBalance(d, d.payments),
    paidTotal: d.payments.filter((p) => p.kind === 'payment').reduce((a, p) => a + p.amount, 0),
    ear: priorityRate(toEngineDebt(d, derivedBalance(d, d.payments))),
  }))

  const expensesManual = profile.expenses.reduce((a, e) => a + e.amount, 0)
  const actualAverages = actualMonthlyAverages(transactions)
  const expensesActual =
    actualAverages.size > 0 ? [...actualAverages.values()].reduce((a, v) => a + v, 0) : null
  const expensesEffective = expensesActual ?? expensesManual

  const activeDebts = debts.filter((d) => d.balance > 0)
  const minPaymentsTotal = activeDebts.reduce((a, d) => a + Math.min(d.minPayment, d.balance), 0)
  const freeCashFlow = profile.monthlyIncome - expensesEffective - minPaymentsTotal
  const monthlyBudget =
    profile.debtBudget ?? Math.max(minPaymentsTotal, profile.monthlyIncome - expensesEffective)

  return {
    profile,
    debts,
    expensesManual,
    expensesActual,
    expensesEffective,
    minPaymentsTotal,
    freeCashFlow,
    monthlyBudget,
    strategy: (profile.strategy as StrategyId) ?? 'avalanche',
  }
}

export function runPlanSimulation(ctx: PlanContext): {
  plan: SimResult
  baseline: SimResult
  order: string[]
} {
  const engineDebts = ctx.debts.filter((d) => d.balance > 0).map((d) => toEngineDebt(d, d.balance))
  const customOrder = ctx.debts.map((d) => d.id)
  const plan = simulate({
    debts: engineDebts,
    monthlyBudget: ctx.monthlyBudget,
    strategy: ctx.strategy,
    customOrder,
  })
  const baseline = simulateMinimumsOnly(engineDebts)
  return { plan, baseline, order: plan.order }
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export interface OverviewPayload {
  profile: {
    name: string
    currency: string
    monthlyIncome: number
    paydayDay: number
    onboarded: boolean
    strategy: StrategyId
    debtBudget: number | null
  }
  totals: {
    remaining: number
    originalPrincipal: number
    paidTotal: number
    principalClearedPct: number
    interestPaidProjected: number
    interestMinimumsOnly: number
    interestSaved: number
  }
  countdown: {
    monthsToFree: number | null
    debtFreeDate: string | null
    baselineMonths: number | null
    budgetShortfall: boolean
  }
  budget: {
    expensesManual: number
    expensesActual: number | null
    expensesEffective: number
    minPaymentsTotal: number
    freeCashFlow: number
    monthlyBudget: number
  }
  debts: Array<{
    id: string
    name: string
    category: string
    balance: number
    principal: number
    minPayment: number
    ratePercent: number
    ratePeriod: string
    interestMethod: string
    ibraAvailable: boolean
    ear: number
    progressPct: number
    payoffMonth: number | null
    payoffDate: string | null
    orderIndex: number
  }>
  comparison: {
    avalancheMonths: number | null
    snowballMonths: number | null
    avalancheInterest: number
    snowballInterest: number
    monthsDiff: number
    interestDiff: number
  } | null
  projection: Array<{ month: string; [debtName: string]: number | string }>
  milestones: Array<{ key: string; label: string; achieved: boolean; achievedAt: string | null }>
  pendingAdjustments: Array<{ importId: string; debtId: string; debtName: string; delta: number }>
}

export async function buildOverview(): Promise<OverviewPayload | null> {
  const ctx = await getPlanContext()
  if (!ctx) return null
  const { plan, baseline, order } = runPlanSimulation(ctx)
  const now = new Date()

  const activeDebts = ctx.debts.filter((d) => d.balance > 0)
  const engineDebts = activeDebts.map((d) => toEngineDebt(d, d.balance))
  const comparison =
    engineDebts.length > 0
      ? (() => {
          const c = compareStrategies({ debts: engineDebts, monthlyBudget: ctx.monthlyBudget })
          return {
            avalancheMonths: c.avalanche.monthsToFree,
            snowballMonths: c.snowball.monthsToFree,
            avalancheInterest: c.avalanche.totalInterest,
            snowballInterest: c.snowball.totalInterest,
            monthsDiff: isFinite(c.monthsDiff) ? c.monthsDiff : 0,
            interestDiff: c.interestDiff,
          }
        })()
      : null

  const orderIndex = new Map(order.map((id, i) => [id, i]))

  // Stacked projection series (per-debt balances per month), capped for the chart
  const projection: OverviewPayload['projection'] = []
  const cap = Math.min(plan.months.length, 121)
  for (let i = 0; i < cap; i++) {
    const row = plan.months[i]
    const date = addMonths(now, row.month)
    const point: OverviewPayload['projection'][number] = {
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    }
    for (const per of row.perDebt) {
      const debt = ctx.debts.find((d) => d.id === per.debtId)
      if (debt) point[debt.name] = per.balance
    }
    projection.push(point)
  }

  const originalPrincipal = ctx.debts.reduce((a, d) => a + d.principal, 0)
  const remaining = ctx.debts.reduce((a, d) => a + d.balance, 0)
  const paidTotal = ctx.debts.reduce((a, d) => a + d.paidTotal, 0)

  // Milestones
  const stored = await prisma.milestone.findMany()
  const storedByKey = new Map(stored.map((m) => [m.key, m]))
  const anyPayment = paidTotal > 0
  const clearedShare = originalPrincipal > 0 ? 1 - remaining / originalPrincipal : 0
  const milestoneDefs: Array<{ key: string; label: string; achieved: boolean }> = [
    { key: 'first_payment', label: 'First payment logged', achieved: anyPayment },
    { key: 'principal_25', label: '25% of total debt cleared', achieved: clearedShare >= 0.25 },
    { key: 'principal_50', label: 'Halfway there — 50% cleared', achieved: clearedShare >= 0.5 },
    { key: 'principal_75', label: '75% of total debt cleared', achieved: clearedShare >= 0.75 },
    ...ctx.debts.map((d) => ({
      key: `debt_cleared:${d.id}`,
      label: `${d.name} cleared`,
      achieved: d.balance <= 0,
    })),
    { key: 'debt_free', label: 'DEBT FREE 🎉', achieved: remaining <= 0 && ctx.debts.length > 0 },
  ]
  // Persist newly achieved milestones so their dates stick
  for (const def of milestoneDefs) {
    if (def.achieved && !storedByKey.has(def.key)) {
      const created = await prisma.milestone.create({ data: { key: def.key, label: def.label } })
      storedByKey.set(def.key, created)
    }
  }

  // Pending out-of-range reconciliation adjustments awaiting confirmation
  const imports = await prisma.statementImport.findMany({ where: { status: 'applied' } })
  const pendingAdjustments: OverviewPayload['pendingAdjustments'] = []
  for (const imp of imports) {
    try {
      const s = JSON.parse(imp.summary)
      if (s.pendingAdjustment) {
        pendingAdjustments.push({ importId: imp.id, ...s.pendingAdjustment })
      }
    } catch {
      // ignore malformed summaries
    }
  }

  return {
    profile: {
      name: ctx.profile.name,
      currency: ctx.profile.currency,
      monthlyIncome: ctx.profile.monthlyIncome,
      paydayDay: ctx.profile.paydayDay,
      onboarded: ctx.profile.onboarded,
      strategy: ctx.strategy,
      debtBudget: ctx.profile.debtBudget,
    },
    totals: {
      remaining,
      originalPrincipal,
      paidTotal,
      principalClearedPct: Math.round(clearedShare * 100),
      interestPaidProjected: plan.totalInterest,
      interestMinimumsOnly: baseline.totalInterest,
      interestSaved: Math.max(0, baseline.totalInterest - plan.totalInterest),
    },
    countdown: {
      monthsToFree: plan.monthsToFree,
      debtFreeDate: plan.monthsToFree ? addMonths(now, plan.monthsToFree).toISOString() : null,
      baselineMonths: baseline.monthsToFree,
      budgetShortfall: plan.budgetShortfall,
    },
    budget: {
      expensesManual: ctx.expensesManual,
      expensesActual: ctx.expensesActual,
      expensesEffective: ctx.expensesEffective,
      minPaymentsTotal: ctx.minPaymentsTotal,
      freeCashFlow: ctx.freeCashFlow,
      monthlyBudget: ctx.monthlyBudget,
    },
    debts: ctx.debts
      .map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        balance: d.balance,
        principal: d.principal,
        minPayment: d.minPayment,
        ratePercent: d.ratePercent,
        ratePeriod: d.ratePeriod,
        interestMethod: d.interestMethod,
        ibraAvailable: d.ibraAvailable,
        ear: d.ear,
        progressPct:
          d.principal > 0 ? Math.max(0, Math.min(100, Math.round((1 - d.balance / Math.max(d.principal, d.balance)) * 100))) : 0,
        payoffMonth: plan.perDebt[d.id]?.payoffMonth ?? null,
        payoffDate: plan.perDebt[d.id]?.payoffMonth
          ? addMonths(now, plan.perDebt[d.id]!.payoffMonth!).toISOString()
          : null,
        orderIndex: orderIndex.get(d.id) ?? 999,
      }))
      .sort((a, b) => (a.balance > 0 ? a.orderIndex : 999) - (b.balance > 0 ? b.orderIndex : 999)),
    comparison,
    projection,
    milestones: milestoneDefs.map((def) => ({
      key: def.key,
      label: def.label,
      achieved: def.achieved,
      achievedAt: storedByKey.get(def.key)?.achievedAt.toISOString() ?? null,
    })),
    pendingAdjustments,
  }
}

/** The monthly coach: concrete per-debt amounts for this month's payday. */
export interface MonthlyPlan {
  payday: string
  items: Array<{
    debtId: string
    debtName: string
    planned: number
    isMinimumOnly: boolean
    paidThisMonth: number
  }>
  total: number
  monthsToFree: number | null
}

export async function buildMonthlyPlan(): Promise<MonthlyPlan | null> {
  const ctx = await getPlanContext()
  if (!ctx) return null
  const { plan } = runPlanSimulation(ctx)
  const first = plan.months[0]
  if (!first) return null

  const now = new Date()
  const payday = new Date(now.getFullYear(), now.getMonth(), Math.min(ctx.profile.paydayDay, 28))
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const paidByDebt = new Map<string, number>()
  const payments = await prisma.payment.findMany({
    where: { kind: 'payment', date: { gte: monthStart } },
  })
  for (const p of payments) paidByDebt.set(p.debtId, (paidByDebt.get(p.debtId) ?? 0) + p.amount)

  const items = first.perDebt
    .filter((r) => r.payment > 0)
    .map((r) => {
      const debt = ctx.debts.find((d) => d.id === r.debtId)!
      return {
        debtId: r.debtId,
        debtName: debt.name,
        planned: r.payment,
        isMinimumOnly: r.payment <= Math.min(debt.minPayment, debt.balance),
        paidThisMonth: paidByDebt.get(r.debtId) ?? 0,
      }
    })
    .sort((a, b) => b.planned - a.planned)

  return {
    payday: payday.toISOString(),
    items,
    total: items.reduce((a, i) => a + i.planned, 0),
    monthsToFree: plan.monthsToFree,
  }
}
