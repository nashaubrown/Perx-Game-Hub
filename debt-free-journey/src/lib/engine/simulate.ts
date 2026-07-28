import type {
  DebtMonthState,
  EngineDebt,
  MonthRow,
  SimOptions,
  SimResult,
} from './types'
import { monthlyRate } from './rates'
import { payoffOrder } from './strategies'

interface DebtState {
  debt: EngineDebt
  balance: number
  ibra: boolean
  /** fixed_profit: fraction of every unit of balance that is contracted profit */
  profitShare: number
  interestPaid: number
  totalPaid: number
  rebate: number
  payoffMonth: number | null
}

function initState(debt: EngineDebt, ibraOverrides?: Record<string, boolean>): DebtState {
  let profitShare = 0
  if (debt.method === 'fixed_profit' && debt.totalPayable && debt.principal && debt.totalPayable > debt.principal) {
    profitShare = (debt.totalPayable - debt.principal) / debt.totalPayable
  }
  return {
    debt,
    balance: Math.max(0, debt.balance),
    ibra: ibraOverrides?.[debt.id] ?? debt.ibraAvailable ?? false,
    profitShare,
    interestPaid: 0,
    totalPaid: 0,
    rebate: 0,
    payoffMonth: null,
  }
}

/** Remaining contracted profit inside a fixed-profit balance (linear proration). */
function profitRemaining(s: DebtState): number {
  if (s.debt.method !== 'fixed_profit') return 0
  return Math.round(s.balance * s.profitShare)
}

/** Cash needed right now to fully clear this debt. With an ibra' rebate the
 *  remaining profit is waived, so settlement costs balance − remaining profit. */
export function settlementAmount(s: DebtState): number {
  if (s.debt.method === 'fixed_profit' && s.ibra) return s.balance - profitRemaining(s)
  return s.balance
}

function recordPayment(s: DebtState, cash: number, month: number, row: DebtMonthState): void {
  if (cash <= 0 || s.balance <= 0) return
  const isFixed = s.debt.method === 'fixed_profit'

  // Full settlement with rebate: the cash clears the whole balance and the
  // remaining profit is waived.
  if (isFixed && s.ibra && cash >= settlementAmount(s)) {
    const waived = profitRemaining(s)
    const paid = s.balance - waived
    s.totalPaid += paid
    s.rebate += waived
    row.payment += paid
    row.rebate += waived
    s.balance = 0
    s.payoffMonth = month
    return
  }

  const paid = Math.min(cash, s.balance)
  const profitBefore = profitRemaining(s)
  s.balance -= paid
  s.totalPaid += paid
  row.payment += paid
  if (isFixed) {
    // Part of every scheduled fixed-profit payment is contracted profit.
    // Derive it from the drop in remaining profit so per-payment rounding
    // never drifts from the contract total.
    const profitPortion = profitBefore - profitRemaining(s)
    s.interestPaid += profitPortion
    row.interest += profitPortion
  }
  if (s.balance === 0) s.payoffMonth = month
}

/**
 * Simulate month-by-month payoff.
 *
 * Each month: accrue interest per debt method, pay every minimum, then pour
 * the remaining budget (plus any lump sum) into the highest-priority open
 * debt. When a debt clears, its freed minimum automatically rolls into the
 * rest because the budget is a fixed monthly total.
 */
export function simulate(opts: SimOptions): SimResult {
  const maxMonths = opts.maxMonths ?? 600
  const states = opts.debts.map((d) => initState(d, opts.ibraOverrides))
  const order = payoffOrder(opts.debts, opts.strategy, opts.customOrder, opts.ibraOverrides)
  const byId = new Map(states.map((s) => [s.debt.id, s]))
  const lumpByMonth = new Map<number, number>()
  for (const l of opts.lumpSums ?? []) {
    lumpByMonth.set(l.month, (lumpByMonth.get(l.month) ?? 0) + l.amount)
  }

  const months: MonthRow[] = []
  let budgetShortfall = false
  let month = 0

  while (states.some((s) => s.balance > 0) && month < maxMonths) {
    month++
    const rows = new Map<string, DebtMonthState>(
      states.map((s) => [s.debt.id, { debtId: s.debt.id, interest: 0, payment: 0, rebate: 0, balance: s.balance }]),
    )

    // 1. Accrue interest (reducing balance only; fixed profit is embedded, zero interest is zero)
    for (const s of states) {
      if (s.balance <= 0) continue
      if (s.debt.method === 'reducing_balance') {
        const interest = Math.round(s.balance * monthlyRate(s.debt.ratePercent, s.debt.ratePeriod))
        s.balance += interest
        s.interestPaid += interest
        rows.get(s.debt.id)!.interest += interest
      }
    }

    // 2. Minimum payments (always made — flag if the budget can't cover them)
    let spent = 0
    for (const s of states) {
      if (s.balance <= 0) continue
      const row = rows.get(s.debt.id)!
      // A minimum payment that covers the full settlement amount clears the
      // debt (with rebate when applicable) — recordPayment handles that.
      recordPayment(s, Math.min(s.debt.minPayment, s.balance), month, row)
      spent += row.payment
    }
    if (spent > opts.monthlyBudget) budgetShortfall = true

    // 3. Extra: remaining budget plus lump sums, poured by priority order
    let extra = Math.max(0, opts.monthlyBudget - spent) + (lumpByMonth.get(month) ?? 0)
    for (const id of order) {
      if (extra <= 0) break
      const s = byId.get(id)!
      if (s.balance <= 0) continue
      const row = rows.get(id)!
      const before = row.payment
      recordPayment(s, extra, month, row)
      extra -= row.payment - before
    }

    // 4. Record the month
    for (const s of states) rows.get(s.debt.id)!.balance = s.balance
    const perDebt = [...rows.values()]
    months.push({
      month,
      totalBalance: states.reduce((a, s) => a + s.balance, 0),
      totalPayment: perDebt.reduce((a, r) => a + r.payment, 0),
      totalInterest: perDebt.reduce((a, r) => a + r.interest, 0),
      perDebt,
    })

    // Safety: if nothing was paid and nothing accrued, we're stuck (all
    // balances positive but zero budget) — avoid an infinite-feeling run.
    if (months[months.length - 1].totalPayment === 0 && months[months.length - 1].totalInterest === 0) break
  }

  const cleared = states.every((s) => s.balance <= 0)
  return {
    months,
    monthsToFree: cleared ? month : null,
    totalInterest: states.reduce((a, s) => a + s.interestPaid, 0),
    totalPaid: states.reduce((a, s) => a + s.totalPaid, 0),
    totalRebate: states.reduce((a, s) => a + s.rebate, 0),
    perDebt: Object.fromEntries(
      states.map((s) => [
        s.debt.id,
        { payoffMonth: s.payoffMonth, interestPaid: s.interestPaid, totalPaid: s.totalPaid, rebate: s.rebate },
      ]),
    ),
    order,
    budgetShortfall,
  }
}

/** Baseline: paying only the minimums, no extra, no lump sums. */
export function simulateMinimumsOnly(debts: EngineDebt[], ibraOverrides?: Record<string, boolean>): SimResult {
  const minTotal = debts.reduce((a, d) => a + d.minPayment, 0)
  return simulate({ debts, monthlyBudget: minTotal, strategy: 'avalanche', ibraOverrides })
}

/** Compare two strategies with the same budget: months and interest difference. */
export function compareStrategies(
  opts: Omit<SimOptions, 'strategy'>,
): { avalanche: SimResult; snowball: SimResult; monthsDiff: number; interestDiff: number } {
  const avalanche = simulate({ ...opts, strategy: 'avalanche' })
  const snowball = simulate({ ...opts, strategy: 'snowball' })
  return {
    avalanche,
    snowball,
    monthsDiff: (snowball.monthsToFree ?? Infinity) - (avalanche.monthsToFree ?? Infinity),
    interestDiff: snowball.totalInterest - avalanche.totalInterest,
  }
}
