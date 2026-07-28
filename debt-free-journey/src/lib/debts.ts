import type { Debt, Payment } from '@prisma/client'
import type { EngineDebt } from './engine/types'

/** Balances are always derived, never overwritten:
 *  startingBalance − payments + signed adjustments. Floor at 0. */
export function derivedBalance(debt: Debt, payments: Payment[]): number {
  let balance = debt.startingBalance
  for (const p of payments) {
    if (p.debtId !== debt.id) continue
    if (p.kind === 'adjustment') balance += p.amount
    else balance -= p.amount
  }
  return Math.max(0, balance)
}

export function toEngineDebt(debt: Debt, balance: number): EngineDebt {
  return {
    id: debt.id,
    name: debt.name,
    balance,
    ratePercent: debt.ratePercent,
    ratePeriod: debt.ratePeriod === 'per_month' ? 'per_month' : 'per_year',
    method: debt.interestMethod as EngineDebt['method'],
    minPayment: debt.minPayment,
    ibraAvailable: debt.ibraAvailable,
    principal: debt.principal,
    totalPayable: debt.totalPayable ?? undefined,
  }
}

export const DEBT_CATEGORIES = [
  { value: 'credit_card', label: 'Credit card' },
  { value: 'personal_loan', label: 'Personal loan' },
  { value: 'islamic_financing', label: 'Islamic financing' },
  { value: 'staff_welfare', label: 'Staff / welfare loan' },
  { value: 'other', label: 'Other' },
] as const
