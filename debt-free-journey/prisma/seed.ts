import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const MVR = (major: number) => Math.round(major * 100)

const DEFAULT_CATEGORY_RULES: Array<[string, string]> = [
  ['REDWAVE', 'Groceries'],
  ['AGORA', 'Groceries'],
  ['SUPERMARKET', 'Groceries'],
  ['FANTASY STORE', 'Groceries'],
  ['CAFE', 'Dining'],
  ['RESTAURANT', 'Dining'],
  ['MARRYBROWN', 'Dining'],
  ['PIZZA', 'Dining'],
  ['DHIRAAGU', 'Mobile & Telecom'],
  ['OOREDOO', 'Mobile & Telecom'],
  ['MEDIANET', 'Subscriptions'],
  ['NETFLIX', 'Subscriptions'],
  ['SPOTIFY', 'Subscriptions'],
  ['ICOM', 'Subscriptions'],
  ['TAXI', 'Transport'],
  ['FUEL', 'Transport'],
  ['FSM', 'Transport'],
  ['STELCO', 'Utilities'],
  ['MWSC', 'Utilities'],
  ['SALARY', 'Salary'],
  ['TRANSFER', 'Transfers'],
  ['TRF', 'Transfers'],
  ['ATM', 'Cash Withdrawal'],
  ['LOAN PAYMENT', 'Loan Payment'],
  ['FINANCING', 'Loan Payment'],
  ['CARD PAYMENT', 'Loan Payment'],
  ['PHARMACY', 'Health'],
  ['HOSPITAL', 'Health'],
  ['ADK', 'Health'],
]

async function main() {
  // Idempotent-ish: wipe and re-seed (demo/single-user app)
  await prisma.transaction.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.statementImport.deleteMany()
  await prisma.milestone.deleteMany()
  await prisma.categoryRule.deleteMany()
  await prisma.expense.deleteMany()
  await prisma.debt.deleteMany()
  await prisma.profile.deleteMany()

  const profile = await prisma.profile.create({
    data: {
      name: 'Demo User',
      monthlyIncome: MVR(30_000),
      currency: 'MVR',
      paydayDay: 28,
      onboarded: true,
      expenses: {
        create: [
          { name: 'Rent', amount: MVR(9_000) },
          { name: 'Groceries', amount: MVR(3_500) },
          { name: 'Utilities (STELCO + MWSC)', amount: MVR(1_400) },
          { name: 'Mobile & Internet', amount: MVR(800) },
          { name: 'Family support', amount: MVR(2_000) },
        ],
      },
    },
  })

  const today = new Date()
  const monthsAgo = (n: number) => new Date(today.getFullYear(), today.getMonth() - n, 5)

  // 1. Credit card with a *monthly* rate — the classic rate-period trap
  const card = await prisma.debt.create({
    data: {
      profileId: profile.id,
      name: 'BML Credit Card',
      category: 'credit_card',
      principal: MVR(45_000),
      startingBalance: MVR(38_500),
      ratePercent: 2,
      ratePeriod: 'per_month',
      interestMethod: 'reducing_balance',
      minPayment: MVR(2_000),
      startDate: monthsAgo(14),
      matchPatterns: 'CARD PAYMENT\nCREDIT CARD',
      sortOrder: 0,
    },
  })

  // 2. Personal loan, 5%/year reducing balance
  const loan = await prisma.debt.create({
    data: {
      profileId: profile.id,
      name: 'Personal Loan',
      category: 'personal_loan',
      principal: MVR(120_000),
      startingBalance: MVR(86_000),
      ratePercent: 5,
      ratePeriod: 'per_year',
      interestMethod: 'reducing_balance',
      minPayment: MVR(3_200),
      startDate: monthsAgo(26),
      matchPatterns: 'LOAN PAYMENT\nPERSONAL LOAN',
      sortOrder: 1,
    },
  })

  // 3. Fixed-profit Islamic financing, no ibra' — prepaying saves nothing
  const financing = await prisma.debt.create({
    data: {
      profileId: profile.id,
      name: 'MIB Home Goods Financing',
      category: 'islamic_financing',
      principal: MVR(60_000),
      totalPayable: MVR(72_000),
      startingBalance: MVR(48_000),
      ratePercent: 0,
      ratePeriod: 'per_year',
      interestMethod: 'fixed_profit',
      ibraAvailable: false,
      minPayment: MVR(2_400),
      startDate: monthsAgo(10),
      matchPatterns: 'FINANCING\nMIB',
      sortOrder: 2,
    },
  })

  // 4. Staff welfare loan at 1%/year
  const staff = await prisma.debt.create({
    data: {
      profileId: profile.id,
      name: 'Staff Welfare Loan',
      category: 'staff_welfare',
      principal: MVR(25_000),
      startingBalance: MVR(15_500),
      ratePercent: 1,
      ratePeriod: 'per_year',
      interestMethod: 'reducing_balance',
      minPayment: MVR(1_050),
      startDate: monthsAgo(9),
      matchPatterns: 'STAFF LOAN\nWELFARE',
      sortOrder: 3,
    },
  })

  // A few months of logged payments so charts/history have data
  const payments: Array<{ debtId: string; monthsBack: number; amount: number; note?: string }> = []
  for (let m = 3; m >= 1; m--) {
    payments.push({ debtId: card.id, monthsBack: m, amount: MVR(2_500) })
    payments.push({ debtId: loan.id, monthsBack: m, amount: MVR(3_200) })
    payments.push({ debtId: financing.id, monthsBack: m, amount: MVR(2_400) })
    payments.push({ debtId: staff.id, monthsBack: m, amount: MVR(1_050) })
  }
  payments.push({ debtId: card.id, monthsBack: 1, amount: MVR(1_500), note: 'Extra from bonus' })

  for (const p of payments) {
    await prisma.payment.create({
      data: {
        debtId: p.debtId,
        date: new Date(today.getFullYear(), today.getMonth() - p.monthsBack, 28),
        amount: p.amount,
        kind: 'payment',
        note: p.note,
      },
    })
  }

  await prisma.categoryRule.createMany({
    data: DEFAULT_CATEGORY_RULES.map(([keyword, category], i) => ({ keyword, category, priority: i })),
  })

  await prisma.milestone.create({
    data: { key: 'first_payment', label: 'First payment logged', celebrated: true },
  })

  console.log('Seeded demo profile with 4 debts, 5 expenses, 13 payments, category rules.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
