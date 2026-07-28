import type { ParsedTransaction, ParseResult, ParserInput, RuleParser } from './types'
import { parseAmount, parseStatementDate } from './normalize'

function finish(
  parserName: string,
  transactions: ParsedTransaction[],
  closingBalance: number | null,
  confidence: number,
): ParseResult {
  const dates = transactions.map((t) => t.date).sort()
  return {
    transactions,
    closingBalance,
    parserName,
    method: 'rules',
    confidence,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
  }
}

function headerIndex(header: string[], ...names: string[]): number {
  const lower = header.map((h) => h.toLowerCase().trim())
  for (const name of names) {
    const i = lower.findIndex((h) => h.includes(name))
    if (i >= 0) return i
  }
  return -1
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const joined = rows[i].join(' ').toLowerCase()
    if (joined.includes('date') && (joined.includes('debit') || joined.includes('amount') || joined.includes('credit'))) {
      return i
    }
  }
  return -1
}

/**
 * Tabular statements (CSV or spreadsheet): a header row with a date column,
 * a description column and either Debit/Credit columns or one signed Amount
 * column. Covers Bank of Maldives internet-banking exports and most generic
 * bank CSV layouts.
 */
export const tabularParser: RuleParser = {
  name: 'tabular-statement',
  detect(input: ParserInput): boolean {
    return !!input.rows && findHeaderRow(input.rows) >= 0
  },
  parse(input: ParserInput): ParseResult {
    const rows = input.rows!
    const h = findHeaderRow(rows)
    const header = rows[h]
    const dateCol = headerIndex(header, 'transaction date', 'txn date', 'date')
    const descCol = headerIndex(header, 'description', 'narrative', 'details', 'particulars')
    const debitCol = headerIndex(header, 'debit', 'withdrawal')
    const creditCol = headerIndex(header, 'credit', 'deposit')
    const amountCol = headerIndex(header, 'amount')
    const balanceCol = headerIndex(header, 'balance')

    const txns: ParsedTransaction[] = []
    let closingBalance: number | null = null
    let candidates = 0
    for (const row of rows.slice(h + 1)) {
      const date = parseStatementDate(row[dateCol] ?? '')
      if (!date) continue
      candidates++
      const description = (row[descCol] ?? '').trim() || 'Unknown'
      let amount: number | null = null
      let direction: 'debit' | 'credit' = 'debit'
      if (debitCol >= 0 || creditCol >= 0) {
        const debit = debitCol >= 0 ? parseAmount(row[debitCol] ?? '') : null
        const credit = creditCol >= 0 ? parseAmount(row[creditCol] ?? '') : null
        if (debit) {
          amount = Math.abs(debit)
          direction = 'debit'
        } else if (credit) {
          amount = Math.abs(credit)
          direction = 'credit'
        }
      } else if (amountCol >= 0) {
        const signed = parseAmount(row[amountCol] ?? '')
        if (signed !== null && signed !== 0) {
          amount = Math.abs(signed)
          direction = signed < 0 ? 'debit' : 'credit'
        }
      }
      if (amount === null || amount === 0) continue
      if (balanceCol >= 0) {
        const bal = parseAmount(row[balanceCol] ?? '')
        if (bal !== null) closingBalance = bal
      }
      txns.push({ date, description, amount, direction })
    }
    const confidence = candidates === 0 ? 0 : txns.length / candidates
    return finish('tabular-statement', txns, closingBalance, confidence)
  },
}

/**
 * Text statements (PDF-extracted): lines that start with a date, then a
 * description, ending in one or two money columns (amount [+ running
 * balance]). Built around Bank of Maldives PDF layouts; direction is
 * validated against the running balance when one is present.
 */
export const textLineParser: RuleParser = {
  name: 'bml-text-statement',
  detect(input: ParserInput): boolean {
    const lines = input.text.split('\n')
    let dated = 0
    for (const line of lines) {
      if (/^\s*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s+\S/.test(line) || /^\s*\d{1,2}[ -][A-Za-z]{3}[ -]\d{2,4}\s+\S/.test(line)) dated++
    }
    return dated >= 3
  },
  parse(input: ParserInput): ParseResult {
    const lines = input.text.split('\n')
    const txns: ParsedTransaction[] = []
    let candidates = 0
    let prevBalance: number | null = null
    let closingBalance: number | null = null

    // An explicit closing balance line wins over the last running balance.
    const closingMatch = input.text.match(/(closing|new)\s+balance\s*:?\s*(MVR|USD)?\s*([\d,]+\.\d{2})\s*(CR|DR)?/i)

    for (const line of lines) {
      const m =
        line.match(/^\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+(.*?)\s+((?:[\d,]+\.\d{2}|\([\d,]+\.\d{2}\))(?:\s*(?:CR|DR))?)(?:\s+((?:-?[\d,]+\.\d{2}|\([\d,]+\.\d{2}\))(?:\s*(?:CR|DR))?))?\s*$/) ||
        line.match(/^\s*(\d{1,2}[ -][A-Za-z]{3}[ -]\d{2,4})\s+(.*?)\s+((?:[\d,]+\.\d{2}|\([\d,]+\.\d{2}\))(?:\s*(?:CR|DR))?)(?:\s+((?:-?[\d,]+\.\d{2}|\([\d,]+\.\d{2}\))(?:\s*(?:CR|DR))?))?\s*$/)
      if (!m) continue
      candidates++
      const date = parseStatementDate(m[1])
      if (!date) continue
      const description = m[2].replace(/\s{2,}/g, ' ').trim()
      const first = parseAmount(m[3])
      const second = m[4] !== undefined ? parseAmount(m[4]) : null
      if (first === null) continue

      // On a card statement the balance is money owed: spending raises it.
      const isCard = input.statementType === 'credit_card'
      let amount: number
      let direction: 'debit' | 'credit'
      if (second !== null) {
        // amount + running balance: direction comes from the balance delta
        amount = Math.abs(first)
        if (prevBalance !== null) {
          const balanceFell = second < prevBalance
          direction = (isCard ? !balanceFell : balanceFell) ? 'debit' : 'credit'
          // Sanity: does prev ± amount reach the new balance?
          if (Math.abs(prevBalance - amount - second) > 1 && Math.abs(prevBalance + amount - second) > 1) {
            // Row doesn't balance; fall back to sign, flag via confidence
            direction = first < 0 ? 'debit' : 'credit'
            candidates++ // penalize confidence
          }
        } else {
          direction = first < 0 ? 'credit' : 'debit'
        }
        prevBalance = second
        closingBalance = second
      } else {
        amount = Math.abs(first)
        direction = first < 0 ? 'credit' : 'debit'
      }
      if (amount === 0) continue
      txns.push({ date, description, amount, direction })
    }

    if (closingMatch) {
      const explicit = parseAmount(closingMatch[3] + (closingMatch[4] ? ` ${closingMatch[4]}` : ''))
      if (explicit !== null) closingBalance = explicit
    }
    const confidence = candidates === 0 ? 0 : txns.length / candidates
    return finish('bml-text-statement', txns, closingBalance, confidence)
  },
}

/** Rule parsers, tried in order. Add new bank layouts here. */
export const RULE_PARSERS: RuleParser[] = [tabularParser, textLineParser]

export const CONFIDENCE_THRESHOLD = 0.7

export function runRuleParsers(input: ParserInput): ParseResult | null {
  for (const parser of RULE_PARSERS) {
    if (!parser.detect(input)) continue
    const result = parser.parse(input)
    if (result.transactions.length > 0 && result.confidence >= CONFIDENCE_THRESHOLD) return result
  }
  return null
}
