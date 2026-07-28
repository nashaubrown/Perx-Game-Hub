import type { PrismaClient } from '@prisma/client'
import type { ParsedTransaction, ParseResult } from './types'
import { fingerprint, normalizeDescription } from './normalize'
import { categorize, FALLBACK_CATEGORY } from './categorize'
import { derivedBalance } from '../debts'

export interface ImportSummary {
  importId: string
  transactionsAdded: number
  duplicatesSkipped: number
  paymentsDetected: number
  balanceAdjustment: number | null
  /** Set when a reconciliation delta is outside the sane range and needs the
   *  user's explicit confirmation — the one exception to automatic mode. */
  pendingAdjustment: { debtId: string; debtName: string; delta: number } | null
  parserName: string
  method: 'rules' | 'ai'
  periodStart: string | null
  periodEnd: string | null
}

/** A reconciliation delta bigger than this share of the tracked balance (or
 *  an absolute floor for small balances) is considered outside the sane range. */
const SANE_DELTA_RATIO = 0.25
const SANE_DELTA_FLOOR = 1_000_00

export function isSaneAdjustment(delta: number, trackedBalance: number): boolean {
  const limit = Math.max(SANE_DELTA_FLOOR, Math.round(trackedBalance * SANE_DELTA_RATIO))
  return Math.abs(delta) <= limit
}

function debtPatterns(matchPatterns: string): string[] {
  return matchPatterns
    .split('\n')
    .map((p) => normalizeDescription(p))
    .filter(Boolean)
}

export function matchesDebt(description: string, patterns: string[]): boolean {
  if (!patterns.length) return false
  const desc = normalizeDescription(description)
  return patterns.some((p) => desc.includes(p))
}

/**
 * Apply a parsed statement to the database, fully automatically:
 * dedupe -> categorize -> record transactions -> auto-log matched debt
 * payments -> reconcile card balance. Everything is linked to one
 * StatementImport row so the whole batch can be undone in one click.
 */
export async function applyImport(
  db: PrismaClient,
  parsed: ParseResult,
  opts: { filename: string; statementType: 'bank_account' | 'credit_card'; cardDebtId?: string },
): Promise<ImportSummary> {
  const debts = await db.debt.findMany({ include: { payments: true } })
  const rules = await db.categoryRule.findMany()

  const existing = new Set(
    (await db.transaction.findMany({ select: { fingerprint: true } })).map((t) => t.fingerprint),
  )

  // Dedupe first — a re-uploaded or overlapping statement must never double-count.
  const fresh: Array<ParsedTransaction & { fp: string }> = []
  let duplicatesSkipped = 0
  const seenThisBatch = new Set<string>()
  for (const t of parsed.transactions) {
    const fp = fingerprint(t.date, t.amount, t.description)
    if (existing.has(fp) || seenThisBatch.has(fp)) {
      duplicatesSkipped++
      continue
    }
    seenThisBatch.add(fp)
    fresh.push({ ...t, fp })
  }

  const imp = await db.statementImport.create({
    data: {
      filename: opts.filename,
      statementType: opts.statementType,
      parseMethod: parsed.method,
      parserName: parsed.parserName,
      status: 'applied',
      closingBalance: parsed.closingBalance,
      periodStart: parsed.periodStart ? new Date(parsed.periodStart) : null,
      periodEnd: parsed.periodEnd ? new Date(parsed.periodEnd) : null,
    },
  })

  const patternsByDebt = debts.map((d) => ({ debt: d, patterns: debtPatterns(d.matchPatterns) }))
  let paymentsDetected = 0

  for (const t of fresh) {
    // Loan payments: on a bank statement money going *out* to a debt is a
    // payment; on a card statement it's the *credit* entries that pay the card.
    const paysDebt =
      (opts.statementType === 'bank_account' && t.direction === 'debit') ||
      (opts.statementType === 'credit_card' && t.direction === 'credit')
    const matched = paysDebt ? patternsByDebt.find(({ patterns }) => matchesDebt(t.description, patterns)) : undefined

    const category = matched ? 'Loan Payment' : categorize(t.description, rules) || FALLBACK_CATEGORY
    const txn = await db.transaction.create({
      data: {
        importId: imp.id,
        date: new Date(t.date),
        description: t.description,
        amount: t.amount,
        direction: t.direction,
        category,
        fingerprint: t.fp,
        debtId: matched?.debt.id ?? null,
      },
    })

    if (matched) {
      await db.payment.create({
        data: {
          debtId: matched.debt.id,
          date: new Date(t.date),
          amount: t.amount,
          kind: 'payment',
          note: `Auto-detected from ${opts.filename}: ${t.description}`,
          importId: imp.id,
          autoLogged: true,
        },
      })
      paymentsDetected++
      void txn
    }
  }

  // Reconcile credit-card closing balance against the tracked balance.
  let balanceAdjustment: number | null = null
  let pendingAdjustment: ImportSummary['pendingAdjustment'] = null
  if (opts.statementType === 'credit_card' && parsed.closingBalance !== null) {
    const card =
      (opts.cardDebtId && debts.find((d) => d.id === opts.cardDebtId)) ||
      debts.filter((d) => d.category === 'credit_card')[0]
    if (card) {
      // Recompute with payments created during this import included.
      const payments = await db.payment.findMany({ where: { debtId: card.id } })
      const tracked = derivedBalance(card, payments)
      const statementBalance = Math.abs(parsed.closingBalance)
      const delta = statementBalance - tracked
      if (delta !== 0) {
        if (isSaneAdjustment(delta, tracked)) {
          await db.payment.create({
            data: {
              debtId: card.id,
              date: parsed.periodEnd ? new Date(parsed.periodEnd) : new Date(),
              amount: delta,
              kind: 'adjustment',
              note: `Reconciled with statement ${opts.filename} (statement balance vs tracked)`,
              importId: imp.id,
              autoLogged: true,
            },
          })
          balanceAdjustment = delta
        } else {
          pendingAdjustment = { debtId: card.id, debtName: card.name, delta }
        }
      }
    }
  }

  const summary: ImportSummary = {
    importId: imp.id,
    transactionsAdded: fresh.length,
    duplicatesSkipped,
    paymentsDetected,
    balanceAdjustment,
    pendingAdjustment,
    parserName: parsed.parserName,
    method: parsed.method,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
  }
  await db.statementImport.update({ where: { id: imp.id }, data: { summary: JSON.stringify(summary) } })
  return summary
}

/** One-click undo: reverts the batch's transactions, auto-logged payments and
 *  balance adjustments together. */
export async function undoImport(db: PrismaClient, importId: string): Promise<void> {
  await db.payment.deleteMany({ where: { importId } })
  await db.transaction.deleteMany({ where: { importId } })
  await db.statementImport.update({ where: { id: importId }, data: { status: 'undone' } })
}
