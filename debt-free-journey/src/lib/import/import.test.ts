import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'
import { parseCsv } from './csv'
import { fingerprint, normalizeDescription, parseAmount, parseStatementDate } from './normalize'
import { runRuleParsers, tabularParser, textLineParser } from './parsers'
import { categorize } from './categorize'
import { matchesDebt, isSaneAdjustment } from './apply'

const fixture = (name: string) => readFileSync(path.join(__dirname, '../../../fixtures', name), 'utf-8')

function csvInput(name: string) {
  const text = fixture(name)
  return { text, rows: parseCsv(text), filename: name }
}

describe('normalization helpers', () => {
  it('parses BML-style dates (day first) and named months', () => {
    expect(parseStatementDate('01/05/2026')).toBe('2026-05-01')
    expect(parseStatementDate('31-12-2025')).toBe('2025-12-31')
    expect(parseStatementDate('7 Jun 2026')).toBe('2026-06-07')
    expect(parseStatementDate('2026-05-01')).toBe('2026-05-01')
    expect(parseStatementDate('31/02/2026')).toBeNull()
    expect(parseStatementDate('not a date')).toBeNull()
  })

  it('parses amounts with commas, parentheses and CR/DR suffixes into minor units', () => {
    expect(parseAmount('1,250.50')).toBe(125050)
    expect(parseAmount('(300.00)')).toBe(-30000)
    expect(parseAmount('500.00 DR')).toBe(-50000)
    expect(parseAmount('abc')).toBeNull()
  })

  it('fingerprints ignore cosmetic description differences', () => {
    const a = fingerprint('2026-05-01', 125050, 'POS PURCHASE  REDWAVE MALE')
    const b = fingerprint('2026-05-01', 125050, 'pos purchase redwave male.')
    const c = fingerprint('2026-05-01', 125051, 'POS PURCHASE REDWAVE MALE')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('CSV statement parsing (BML account export)', () => {
  it('extracts every transaction with correct direction and closing balance', () => {
    const result = tabularParser.parse(csvInput('bml-account.csv'))
    expect(result.transactions).toHaveLength(8)
    const salary = result.transactions[0]
    expect(salary).toMatchObject({ date: '2026-05-01', direction: 'credit', amount: 3_000_000 })
    const loan = result.transactions.find((t) => t.description.includes('LOAN PAYMENT'))!
    expect(loan).toMatchObject({ direction: 'debit', amount: 320_000 })
    expect(result.closingBalance).toBe(3_139_125)
    expect(result.periodStart).toBe('2026-05-01')
    expect(result.periodEnd).toBe('2026-05-15')
    expect(result.confidence).toBe(1)
  })

  it('is picked up by the rule-parser chain with high confidence', () => {
    const result = runRuleParsers(csvInput('bml-account.csv'))
    expect(result).not.toBeNull()
    expect(result!.method).toBe('rules')
    expect(result!.parserName).toBe('tabular-statement')
  })
})

describe('PDF-text statement parsing (BML credit card)', () => {
  const input = {
    text: fixture('bml-card-statement.txt'),
    rows: null,
    filename: 'bml-card-statement.pdf',
    statementType: 'credit_card' as const,
  }

  it('detects the layout and extracts transactions using the running balance for direction', () => {
    expect(textLineParser.detect(input)).toBe(true)
    const result = textLineParser.parse(input)
    expect(result.transactions).toHaveLength(6)
    const payment = result.transactions.find((t) => t.description.includes('PAYMENT RECEIVED'))!
    expect(payment.direction).toBe('credit')
    expect(payment.amount).toBe(250_000)
    const purchase = result.transactions.find((t) => t.description.includes('SEAGULL'))!
    expect(purchase.direction).toBe('debit')
    expect(result.closingBalance).toBe(3_811_525)
  })

  it('returns null from the rule chain for an unrecognizable layout (AI fallback trigger)', () => {
    const garbage = { text: 'hello world\nthis is not a statement\nnothing here', rows: null, filename: 'x.pdf' }
    expect(runRuleParsers(garbage)).toBeNull()
  })
})

describe('categorization', () => {
  const rules = [
    { keyword: 'REDWAVE', category: 'Groceries', priority: 1 },
    { keyword: 'DHIRAAGU', category: 'Mobile & Telecom', priority: 2 },
  ]
  it('applies the first matching keyword rule, else Other', () => {
    expect(categorize('POS PURCHASE REDWAVE MALE', rules)).toBe('Groceries')
    expect(categorize('DHIRAAGU BILL PAY', rules)).toBe('Mobile & Telecom')
    expect(categorize('MYSTERY SHOP', rules)).toBe('Other')
  })
})

describe('loan payment matching', () => {
  it('matches normalized description patterns', () => {
    const patterns = ['LOAN PAYMENT', 'PERSONAL LOAN'].map(normalizeDescription)
    expect(matchesDebt('LOAN PAYMENT 001-330000123', patterns)).toBe(true)
    expect(matchesDebt('loan  payment ref 99', patterns)).toBe(true)
    expect(matchesDebt('POS PURCHASE REDWAVE', patterns)).toBe(false)
  })
})

describe('sane-range guard for reconciliation', () => {
  it('allows small deltas and blocks out-of-range ones', () => {
    expect(isSaneAdjustment(50_000, 1_000_000)).toBe(true) // 500 on a 10k balance
    expect(isSaneAdjustment(-260_000, 1_000_000)).toBe(false) // >25%
    expect(isSaneAdjustment(90_000, 0)).toBe(true) // floor allows small absolute deltas
  })
})

// ---------------------------------------------------------------------------
// DB-backed pipeline tests (real SQLite test database)
// ---------------------------------------------------------------------------

describe('import pipeline against the database', () => {
  let prisma: import('@prisma/client').PrismaClient
  let apply: typeof import('./apply')
  let debtIds: { loan: string; card: string }

  beforeAll(async () => {
    process.env.DATABASE_URL = 'file:./test.db'
    execSync('npx prisma db push --skip-generate --force-reset', {
      cwd: path.join(__dirname, '../../..'),
      env: { ...process.env },
      stdio: 'ignore',
    })
    const { PrismaClient } = await import('@prisma/client')
    prisma = new PrismaClient()
    apply = await import('./apply')

    const profile = await prisma.profile.create({ data: { monthlyIncome: 3_000_000 } })
    const loan = await prisma.debt.create({
      data: {
        profileId: profile.id,
        name: 'Personal Loan',
        category: 'personal_loan',
        principal: 12_000_000,
        startingBalance: 8_600_000,
        ratePercent: 5,
        ratePeriod: 'per_year',
        interestMethod: 'reducing_balance',
        minPayment: 320_000,
        matchPatterns: 'LOAN PAYMENT',
      },
    })
    const card = await prisma.debt.create({
      data: {
        profileId: profile.id,
        name: 'Credit Card',
        category: 'credit_card',
        principal: 4_500_000,
        startingBalance: 3_850_000,
        ratePercent: 2,
        ratePeriod: 'per_month',
        interestMethod: 'reducing_balance',
        minPayment: 200_000,
        matchPatterns: 'CARD PAYMENT\nPAYMENT RECEIVED',
      },
    })
    debtIds = { loan: loan.id, card: card.id }
    await prisma.categoryRule.createMany({
      data: [
        { keyword: 'REDWAVE', category: 'Groceries', priority: 0 },
        { keyword: 'DHIRAAGU', category: 'Mobile & Telecom', priority: 1 },
        { keyword: 'ATM', category: 'Cash Withdrawal', priority: 2 },
      ],
    })
  }, 60_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('applies a bank statement: transactions, categories, auto-logged loan payments', async () => {
    const parsed = tabularParser.parse(csvInput('bml-account.csv'))
    const summary = await apply.applyImport(prisma, parsed, {
      filename: 'bml-account.csv',
      statementType: 'bank_account',
    })
    expect(summary.transactionsAdded).toBe(8)
    expect(summary.duplicatesSkipped).toBe(0)
    // LOAN PAYMENT -> personal loan, CARD PAYMENT -> credit card
    expect(summary.paymentsDetected).toBe(2)

    const loanPayments = await prisma.payment.findMany({ where: { debtId: debtIds.loan, autoLogged: true } })
    expect(loanPayments).toHaveLength(1)
    expect(loanPayments[0].amount).toBe(320_000)

    const groceries = await prisma.transaction.findMany({ where: { category: 'Groceries' } })
    expect(groceries.length).toBeGreaterThan(0)
  })

  it('dedupes a full re-upload of the same statement (zero new rows)', async () => {
    const parsed = tabularParser.parse(csvInput('bml-account.csv'))
    const summary = await apply.applyImport(prisma, parsed, {
      filename: 'bml-account.csv',
      statementType: 'bank_account',
    })
    expect(summary.transactionsAdded).toBe(0)
    expect(summary.duplicatesSkipped).toBe(8)
    expect(summary.paymentsDetected).toBe(0)
  })

  it('dedupes overlapping statement periods (only genuinely new rows land)', async () => {
    const parsed = tabularParser.parse(csvInput('bml-account-overlap.csv'))
    const summary = await apply.applyImport(prisma, parsed, {
      filename: 'bml-account-overlap.csv',
      statementType: 'bank_account',
    })
    expect(summary.duplicatesSkipped).toBe(3) // ATM, MARRYBROWN, TRF already imported
    expect(summary.transactionsAdded).toBe(2) // AGORA + STELCO are new
  })

  it('reconciles a credit-card statement balance with an automatic adjustment', async () => {
    const parsed = textLineParser.parse({
      text: fixture('bml-card-statement.txt'),
      rows: null,
      filename: 'card.pdf',
      statementType: 'credit_card',
    })
    const before = await prisma.payment.findMany({ where: { debtId: debtIds.card } })
    const card = (await prisma.debt.findUnique({ where: { id: debtIds.card } }))!
    const { derivedBalance } = await import('../debts')
    const trackedBefore = derivedBalance(card, before)

    const summary = await apply.applyImport(prisma, parsed, {
      filename: 'card.pdf',
      statementType: 'credit_card',
      cardDebtId: debtIds.card,
    })
    // Payment on the card statement is auto-logged, then the tracked balance
    // is adjusted to match the statement's closing balance.
    expect(summary.paymentsDetected).toBe(1)
    const after = await prisma.payment.findMany({ where: { debtId: debtIds.card } })
    const trackedAfter = derivedBalance(card, after)
    expect(trackedAfter).toBe(3_811_525)
    expect(summary.balanceAdjustment).toBe(3_811_525 - (trackedBefore - 250_000))
  })

  it('undoes an entire import in one click: transactions, payments and adjustments', async () => {
    const imports = await prisma.statementImport.findMany({ where: { filename: 'card.pdf' } })
    const imp = imports[imports.length - 1]

    await apply.undoImport(prisma, imp.id)

    expect(await prisma.transaction.count({ where: { importId: imp.id } })).toBe(0)
    expect(await prisma.payment.count({ where: { importId: imp.id } })).toBe(0)
    const updated = await prisma.statementImport.findUnique({ where: { id: imp.id } })
    expect(updated!.status).toBe('undone')

    // Tracked balance is back to its pre-import value.
    const card = (await prisma.debt.findUnique({ where: { id: debtIds.card } }))!
    const payments = await prisma.payment.findMany({ where: { debtId: debtIds.card } })
    const { derivedBalance } = await import('../debts')
    expect(derivedBalance(card, payments)).toBe(3_850_000 - 250_000) // starting − card payment from the earlier bank import
  })
})
