export type InterestMethod = 'reducing_balance' | 'fixed_profit' | 'zero_interest'
export type RatePeriod = 'per_month' | 'per_year'
export type StrategyId = 'avalanche' | 'snowball' | 'custom'

export interface EngineDebt {
  id: string
  name: string
  /** Current outstanding balance in minor units. For fixed_profit debts this is
   *  the total remaining payable (principal + remaining contracted profit). */
  balance: number
  /** Stated rate as a percentage, e.g. 0.5 means 0.5% */
  ratePercent: number
  ratePeriod: RatePeriod
  method: InterestMethod
  /** Minimum monthly payment in minor units */
  minPayment: number
  /** fixed_profit only: is an early-settlement rebate (ibra') available? */
  ibraAvailable?: boolean
  /** Original principal in minor units */
  principal?: number
  /** fixed_profit only: original contract total payable (principal + total profit) */
  totalPayable?: number
}

export interface LumpSum {
  /** 1-based month index into the simulation (1 = first simulated month) */
  month: number
  amount: number
}

export interface SimOptions {
  debts: EngineDebt[]
  /** Total cash committed to debts each month, minor units (minimums + extra) */
  monthlyBudget: number
  strategy: StrategyId
  /** Priority order of debt ids for the custom strategy */
  customOrder?: string[]
  lumpSums?: LumpSum[]
  /** Override ibraAvailable per debt id (what-if toggles) */
  ibraOverrides?: Record<string, boolean>
  maxMonths?: number
}

export interface DebtMonthState {
  debtId: string
  interest: number
  payment: number
  /** Profit waived by an ibra' rebate this month (fixed_profit settlement) */
  rebate: number
  balance: number
}

export interface MonthRow {
  /** 1-based month index */
  month: number
  totalBalance: number
  totalPayment: number
  totalInterest: number
  perDebt: DebtMonthState[]
}

export interface PerDebtResult {
  payoffMonth: number | null
  interestPaid: number
  totalPaid: number
  rebate: number
}

export interface SimResult {
  months: MonthRow[]
  /** Months until every balance is zero, or null if not reached within maxMonths */
  monthsToFree: number | null
  totalInterest: number
  totalPaid: number
  totalRebate: number
  perDebt: Record<string, PerDebtResult>
  /** The payoff priority order that was used */
  order: string[]
  /** True if the budget could not cover the sum of minimum payments */
  budgetShortfall: boolean
}
