import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { actualMonthlyAverages, findMoneyLeaks, spendByCategoryMonth } from '@/lib/insights'
import { getPlanContext, runPlanSimulation } from '@/lib/overview'
import { toEngineDebt } from '@/lib/debts'
import { simulate } from '@/lib/engine/simulate'

export const dynamic = 'force-dynamic'

export async function GET() {
  const transactions = await prisma.transaction.findMany({ where: { import: { status: 'applied' } } })
  const ctx = await getPlanContext()

  const byMonth = spendByCategoryMonth(transactions)
  const averages = actualMonthlyAverages(transactions)
  const leaks = findMoneyLeaks(transactions)

  // Impact of each leak on the debt-free date: what if that money went to debt?
  let leaksWithImpact = leaks.map((l) => ({ ...l, monthsCloser: 0 }))
  if (ctx && ctx.debts.some((d) => d.balance > 0)) {
    const { plan } = runPlanSimulation(ctx)
    const engineDebts = ctx.debts.filter((d) => d.balance > 0).map((d) => toEngineDebt(d, d.balance))
    leaksWithImpact = leaks.map((l) => {
      const boosted = simulate({
        debts: engineDebts,
        monthlyBudget: ctx.monthlyBudget + l.monthlyAverage,
        strategy: ctx.strategy,
        customOrder: ctx.debts.map((d) => d.id),
      })
      const monthsCloser =
        plan.monthsToFree !== null && boosted.monthsToFree !== null
          ? plan.monthsToFree - boosted.monthsToFree
          : 0
      return { ...l, monthsCloser }
    })
  }

  // Month-over-month change per category (latest vs previous month)
  const months = [...new Set(byMonth.map((r) => r.month))].sort()
  const latest = months[months.length - 1]
  const previous = months[months.length - 2]
  const momChanges =
    latest && previous
      ? [...new Set(byMonth.map((r) => r.category))]
          .map((category) => {
            const now = byMonth.find((r) => r.month === latest && r.category === category)?.total ?? 0
            const before = byMonth.find((r) => r.month === previous && r.category === category)?.total ?? 0
            return { category, latest: now, previous: before, change: now - before }
          })
          .filter((r) => r.latest > 0 || r.previous > 0)
          .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      : []

  // Estimated (manual) vs actual per category
  const manualExpenses = ctx?.profile ? await prisma.expense.findMany({ where: { profileId: ctx.profile.id } }) : []

  return NextResponse.json({
    byMonth,
    actualAverages: Object.fromEntries(averages),
    manualExpenses,
    momChanges,
    leaks: leaksWithImpact,
    hasTransactions: transactions.length > 0,
  })
}
