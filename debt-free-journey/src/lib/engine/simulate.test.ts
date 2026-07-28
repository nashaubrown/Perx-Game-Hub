import { describe, expect, it } from 'vitest'
import type { EngineDebt } from './types'
import { effectiveAnnualRate, monthlyRate } from './rates'
import { payoffOrder } from './strategies'
import { compareStrategies, simulate, simulateMinimumsOnly } from './simulate'

function debt(partial: Partial<EngineDebt> & { id: string }): EngineDebt {
  return {
    name: partial.id,
    balance: 100_000_00,
    ratePercent: 0,
    ratePeriod: 'per_year',
    method: 'reducing_balance',
    minPayment: 2_000_00,
    ...partial,
  }
}

describe('rate normalization', () => {
  it('converts a monthly rate to the effective annual rate', () => {
    // 0.5%/month = (1.005)^12 - 1 ≈ 6.1678%/year
    expect(effectiveAnnualRate(0.5, 'per_month')).toBeCloseTo(0.061678, 5)
  })

  it('treats a yearly rate as nominal annual compounded monthly', () => {
    expect(monthlyRate(6, 'per_year')).toBeCloseTo(0.005, 10)
    expect(effectiveAnnualRate(6, 'per_year')).toBeCloseTo(0.061678, 5)
  })

  it('monthly-stated 1% beats yearly-stated 10% when normalized', () => {
    expect(effectiveAnnualRate(1, 'per_month')).toBeGreaterThan(effectiveAnnualRate(10, 'per_year'))
  })
})

describe('reducing balance accrual', () => {
  it('accrues monthly interest on the remaining balance in integer minor units', () => {
    const d = debt({ id: 'loan', balance: 100_000_00, ratePercent: 1, ratePeriod: 'per_month', minPayment: 10_000_00 })
    const res = simulate({ debts: [d], monthlyBudget: 10_000_00, strategy: 'avalanche' })
    // Month 1: interest = 1% of 10,000,000 = 100,000; pay 1,000,000 -> 9,100,000
    expect(res.months[0].perDebt[0].interest).toBe(1_000_00)
    expect(res.months[0].perDebt[0].balance).toBe(91_000_00)
    // Month 2 accrues on the *reduced* balance
    expect(res.months[1].perDebt[0].interest).toBe(910_00)
    expect(Number.isInteger(res.months[1].perDebt[0].balance)).toBe(true)
  })

  it('clears the debt and never overpays the final month', () => {
    const d = debt({ id: 'loan', balance: 1_000_00, ratePercent: 0, minPayment: 300_00 })
    const res = simulate({ debts: [d], monthlyBudget: 300_00, strategy: 'avalanche' })
    expect(res.monthsToFree).toBe(4)
    expect(res.months[3].perDebt[0].payment).toBe(100_00) // 1000 = 300*3 + 100
    expect(res.totalPaid).toBe(1_000_00)
  })
})

describe('zero interest debts', () => {
  it('never accrues interest', () => {
    const d = debt({ id: 'z', method: 'zero_interest', ratePercent: 5, balance: 12_000_00, minPayment: 1_000_00 })
    const res = simulate({ debts: [d], monthlyBudget: 1_000_00, strategy: 'avalanche' })
    expect(res.monthsToFree).toBe(12)
    expect(res.totalInterest).toBe(0)
    expect(res.totalPaid).toBe(12_000_00)
  })
})

describe('fixed profit (Islamic financing)', () => {
  const base = {
    id: 'if',
    method: 'fixed_profit' as const,
    principal: 100_000_00,
    totalPayable: 120_000_00,
    balance: 120_000_00,
    ratePercent: 6,
    ratePeriod: 'per_year' as const,
    minPayment: 10_000_00,
  }

  it("with ibra': early settlement waives the remaining profit", () => {
    const d = debt({ ...base, ibraAvailable: true })
    const res = simulate({ debts: [d], monthlyBudget: 200_000_00, strategy: 'avalanche' })
    expect(res.monthsToFree).toBe(1)
    // profitShare = 20,000/120,000 = 1/6 of the balance is profit.
    // Min payment 10,000 pays 1/6 profit (1,666.67 -> 1,667); the settlement
    // of the remaining 110,000 balance costs 110,000 - 18,333 rebate.
    expect(res.totalRebate).toBe(18_333_33)
    expect(res.totalPaid + res.totalRebate).toBe(120_000_00)
    expect(res.totalInterest).toBe(1_666_67)
  })

  it("without ibra': prepayment saves zero — full contract total is always paid", () => {
    const d = debt({ ...base, ibraAvailable: false })
    const fast = simulate({ debts: [d], monthlyBudget: 200_000_00, strategy: 'avalanche' })
    const slow = simulate({ debts: [d], monthlyBudget: 10_000_00, strategy: 'avalanche' })
    expect(fast.totalPaid).toBe(120_000_00)
    expect(slow.totalPaid).toBe(120_000_00)
    expect(fast.totalRebate).toBe(0)
    // Same embedded profit paid either way — zero interest saved by prepaying.
    expect(fast.totalInterest).toBe(slow.totalInterest)
  })

  it("ibra' override flips the behavior in what-if scenarios", () => {
    const d = debt({ ...base, ibraAvailable: false })
    const res = simulate({
      debts: [d],
      monthlyBudget: 200_000_00,
      strategy: 'avalanche',
      ibraOverrides: { if: true },
    })
    expect(res.totalRebate).toBeGreaterThan(0)
  })
})

describe('payoff ordering', () => {
  const card = debt({ id: 'card', balance: 20_000_00, ratePercent: 2, ratePeriod: 'per_month', minPayment: 1_000_00 })
  const loan = debt({ id: 'loan', balance: 5_000_00, ratePercent: 5, ratePeriod: 'per_year', minPayment: 500_00 })
  const fixedNoIbra = debt({
    id: 'fp',
    method: 'fixed_profit',
    balance: 1_000_00,
    ratePercent: 99,
    ratePeriod: 'per_year',
    minPayment: 100_00,
    ibraAvailable: false,
  })

  it('avalanche orders by effective annual rate, highest first', () => {
    expect(payoffOrder([loan, card], 'avalanche')).toEqual(['card', 'loan'])
  })

  it('snowball orders by balance, smallest first', () => {
    expect(payoffOrder([card, loan], 'snowball')).toEqual(['loan', 'card'])
  })

  it("critical rule: fixed profit without ibra' is deprioritized even with a huge stated rate and tiny balance", () => {
    expect(payoffOrder([fixedNoIbra, card, loan], 'avalanche')).toEqual(['card', 'loan', 'fp'])
    expect(payoffOrder([fixedNoIbra, card, loan], 'snowball')).toEqual(['loan', 'card', 'fp'])
  })

  it('custom order is respected verbatim', () => {
    expect(payoffOrder([card, loan, fixedNoIbra], 'custom', ['fp', 'loan', 'card'])).toEqual(['fp', 'loan', 'card'])
  })

  it('avalanche beats snowball on interest for rate-vs-balance tradeoffs', () => {
    const { avalanche, snowball, interestDiff } = compareStrategies({
      debts: [card, loan],
      monthlyBudget: 3_000_00,
    })
    expect(avalanche.totalInterest).toBeLessThan(snowball.totalInterest)
    expect(interestDiff).toBeGreaterThan(0)
  })
})

describe('rollover of freed payments', () => {
  it('rolls a cleared debt’s payment into the next debt automatically', () => {
    const a = debt({ id: 'a', balance: 1_000_00, minPayment: 500_00 })
    const b = debt({ id: 'b', balance: 10_000_00, minPayment: 500_00 })
    const res = simulate({ debts: [a, b], monthlyBudget: 1_000_00, strategy: 'snowball' })
    // Months 1-2: 500 each. From month 3 (a cleared), the full 1,000 hits b.
    expect(res.perDebt['a'].payoffMonth).toBe(2)
    const bMonth3 = res.months[2].perDebt.find((r) => r.debtId === 'b')!
    expect(bMonth3.payment).toBe(1_000_00)
    expect(res.monthsToFree).toBe(11) // 11,000 total paid at 1,000/month
  })
})

describe('lump sums', () => {
  it('a one-off lump sum pulls the debt-free date closer', () => {
    const d = debt({ id: 'loan', balance: 12_000_00, ratePercent: 1, ratePeriod: 'per_month', minPayment: 1_000_00 })
    const without = simulate({ debts: [d], monthlyBudget: 1_000_00, strategy: 'avalanche' })
    const withLump = simulate({
      debts: [d],
      monthlyBudget: 1_000_00,
      strategy: 'avalanche',
      lumpSums: [{ month: 2, amount: 5_000_00 }],
    })
    expect(withLump.monthsToFree!).toBeLessThan(without.monthsToFree!)
    expect(withLump.totalInterest).toBeLessThan(without.totalInterest)
  })
})

describe('baseline comparison', () => {
  it('paying extra saves interest vs minimums only', () => {
    const d = debt({ id: 'loan', balance: 50_000_00, ratePercent: 1.5, ratePeriod: 'per_month', minPayment: 1_000_00 })
    const baseline = simulateMinimumsOnly([d])
    const plan = simulate({ debts: [d], monthlyBudget: 3_000_00, strategy: 'avalanche' })
    expect(plan.totalInterest).toBeLessThan(baseline.totalInterest)
    expect(plan.monthsToFree!).toBeLessThan(baseline.monthsToFree!)
  })
})

describe('guard rails', () => {
  it('flags a budget that cannot cover the minimums', () => {
    const d = debt({ id: 'loan', balance: 10_000_00, minPayment: 1_000_00 })
    const res = simulate({ debts: [d], monthlyBudget: 500_00, strategy: 'avalanche' })
    expect(res.budgetShortfall).toBe(true)
  })

  it('returns null monthsToFree when the debt cannot be cleared in maxMonths', () => {
    // Interest exceeds the payment: balance grows forever.
    const d = debt({ id: 'loan', balance: 100_000_00, ratePercent: 3, ratePeriod: 'per_month', minPayment: 1_000_00 })
    const res = simulate({ debts: [d], monthlyBudget: 1_000_00, strategy: 'avalanche', maxMonths: 120 })
    expect(res.monthsToFree).toBeNull()
    expect(res.months.length).toBe(120)
  })
})
