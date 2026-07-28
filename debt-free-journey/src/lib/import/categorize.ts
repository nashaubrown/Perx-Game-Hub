import { normalizeDescription } from './normalize'

export interface CategoryRuleLike {
  keyword: string
  category: string
  priority: number
}

export const FALLBACK_CATEGORY = 'Other'

/** Keyword rules table (user-editable in Settings). First match by priority wins. */
export function categorize(description: string, rules: CategoryRuleLike[]): string {
  const desc = normalizeDescription(description)
  const sorted = [...rules].sort((a, b) => a.priority - b.priority)
  for (const rule of sorted) {
    if (desc.includes(normalizeDescription(rule.keyword))) return rule.category
  }
  return FALLBACK_CATEGORY
}
