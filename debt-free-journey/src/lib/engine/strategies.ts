import type { EngineDebt, StrategyId } from './types'
import { priorityRate } from './rates'

function ibraOf(debt: EngineDebt, overrides?: Record<string, boolean>): boolean {
  return overrides?.[debt.id] ?? debt.ibraAvailable ?? false
}

/** True when prepaying this debt cannot save any interest (fixed profit, no rebate). */
export function prepaySavesNothing(debt: EngineDebt, overrides?: Record<string, boolean>): boolean {
  return debt.method === 'fixed_profit' && !ibraOf(debt, overrides)
}

/**
 * Compute the payoff priority order (array of debt ids, highest priority first).
 *
 * For avalanche and snowball, fixed-profit debts without an ibra' rebate are
 * always pushed to the back: extra money aimed at them saves zero interest.
 * The custom strategy respects the user's order verbatim.
 */
export function payoffOrder(
  debts: EngineDebt[],
  strategy: StrategyId,
  customOrder?: string[],
  ibraOverrides?: Record<string, boolean>,
): string[] {
  const list = [...debts]

  if (strategy === 'custom' && customOrder?.length) {
    const pos = new Map(customOrder.map((id, i) => [id, i]))
    list.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9))
    return list.map((d) => d.id)
  }

  const cmp =
    strategy === 'snowball'
      ? (a: EngineDebt, b: EngineDebt) =>
          a.balance - b.balance ||
          priorityRate(b, ibraOverrides?.[b.id]) - priorityRate(a, ibraOverrides?.[a.id]) ||
          a.name.localeCompare(b.name)
      : (a: EngineDebt, b: EngineDebt) =>
          priorityRate(b, ibraOverrides?.[b.id]) - priorityRate(a, ibraOverrides?.[a.id]) ||
          a.balance - b.balance ||
          a.name.localeCompare(b.name)

  const front = list.filter((d) => !prepaySavesNothing(d, ibraOverrides)).sort(cmp)
  const back = list.filter((d) => prepaySavesNothing(d, ibraOverrides)).sort(cmp)
  return [...front, ...back].map((d) => d.id)
}
