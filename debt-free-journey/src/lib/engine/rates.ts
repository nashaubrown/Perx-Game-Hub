import type { EngineDebt, RatePeriod } from './types'

/**
 * Convert a stated rate to a monthly decimal rate.
 * - per_month: 0.5 (%) -> 0.005
 * - per_year: treated as a nominal annual rate compounded monthly (bank
 *   convention for loan quotes): 6 (%) -> 0.005
 */
export function monthlyRate(ratePercent: number, period: RatePeriod): number {
  if (ratePercent <= 0) return 0
  if (period === 'per_month') return ratePercent / 100
  return ratePercent / 100 / 12
}

/**
 * Effective annual rate as a decimal, for comparing debts on equal footing.
 * A 0.5%/month card -> (1.005)^12 - 1 = ~0.0617 (~6.17%/year).
 */
export function effectiveAnnualRate(ratePercent: number, period: RatePeriod): number {
  const m = monthlyRate(ratePercent, period)
  if (m <= 0) return 0
  return Math.pow(1 + m, 12) - 1
}

/**
 * The rate used to *prioritize* a debt. Critical rule: a fixed_profit debt
 * without an ibra' rebate saves zero interest when prepaid, so its effective
 * rate for ordering purposes is 0.
 */
export function priorityRate(debt: EngineDebt, ibraOverride?: boolean): number {
  const ibra = ibraOverride ?? debt.ibraAvailable ?? false
  if (debt.method === 'zero_interest') return 0
  if (debt.method === 'fixed_profit' && !ibra) return 0
  return effectiveAnnualRate(debt.ratePercent, debt.ratePeriod)
}
