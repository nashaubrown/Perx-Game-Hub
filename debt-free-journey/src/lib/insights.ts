import type { Transaction } from '@prisma/client'

/** Categories that are money movement, not real spending. */
export const NON_SPEND_CATEGORIES = new Set(['Salary', 'Transfers', 'Loan Payment'])

export interface CategoryMonth {
  month: string // yyyy-mm
  category: string
  total: number
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Spend (debits only) grouped by category and month. */
export function spendByCategoryMonth(transactions: Transaction[]): CategoryMonth[] {
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.direction !== 'debit') continue
    if (NON_SPEND_CATEGORIES.has(t.category)) continue
    const key = `${monthKey(t.date)}|${t.category}`
    map.set(key, (map.get(key) ?? 0) + t.amount)
  }
  return [...map.entries()]
    .map(([key, total]) => {
      const [month, category] = key.split('|')
      return { month, category, total }
    })
    .sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Real average monthly spend per category over the last `windowMonths` full
 * months of transaction data (rolling average). Used instead of manual
 * estimates once statements are imported.
 */
export function actualMonthlyAverages(transactions: Transaction[], windowMonths = 3): Map<string, number> {
  const byMonth = spendByCategoryMonth(transactions)
  if (byMonth.length === 0) return new Map()
  const months = [...new Set(byMonth.map((r) => r.month))].sort()
  const window = months.slice(-windowMonths)
  const totals = new Map<string, number>()
  for (const row of byMonth) {
    if (!window.includes(row.month)) continue
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.total)
  }
  const averages = new Map<string, number>()
  for (const [category, total] of totals) {
    averages.set(category, Math.round(total / window.length))
  }
  return averages
}

export interface MoneyLeak {
  description: string
  category: string
  monthsSeen: number
  monthlyAverage: number
}

/**
 * "Money leaks": recurring spending — the same normalized merchant appearing
 * in 2+ distinct months — that could be redirected to debt.
 */
export function findMoneyLeaks(transactions: Transaction[], minMonths = 2, top = 6): MoneyLeak[] {
  const byMerchant = new Map<string, { months: Set<string>; total: number; category: string }>()
  for (const t of transactions) {
    if (t.direction !== 'debit') continue
    if (NON_SPEND_CATEGORIES.has(t.category) || t.category === 'Cash Withdrawal') continue
    const key = t.description.toUpperCase().replace(/[0-9]+/g, '').replace(/\s+/g, ' ').trim()
    const entry = byMerchant.get(key) ?? { months: new Set<string>(), total: 0, category: t.category }
    entry.months.add(monthKey(t.date))
    entry.total += t.amount
    byMerchant.set(key, entry)
  }
  return [...byMerchant.entries()]
    .filter(([, v]) => v.months.size >= minMonths)
    .map(([description, v]) => ({
      description,
      category: v.category,
      monthsSeen: v.months.size,
      monthlyAverage: Math.round(v.total / v.months.size),
    }))
    .sort((a, b) => b.monthlyAverage - a.monthlyAverage)
    .slice(0, top)
}
