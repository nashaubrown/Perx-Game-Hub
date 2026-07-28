import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getPlanContext } from '@/lib/overview'
import { toEngineDebt } from '@/lib/debts'
import { simulate, simulateMinimumsOnly } from '@/lib/engine/simulate'

export const dynamic = 'force-dynamic'

const simSchema = z.object({
  monthlyBudget: z.number().int().nonnegative(),
  strategy: z.enum(['avalanche', 'snowball', 'custom']),
  customOrder: z.array(z.string()).optional(),
  lumpSums: z.array(z.object({ month: z.number().int().min(1), amount: z.number().int().positive() })).optional(),
  ibraOverrides: z.record(z.boolean()).optional(),
})

export async function POST(req: NextRequest) {
  const body = simSchema.parse(await req.json())
  const ctx = await getPlanContext()
  if (!ctx) return NextResponse.json({ error: 'No profile yet' }, { status: 400 })
  const debts = ctx.debts.filter((d) => d.balance > 0).map((d) => toEngineDebt(d, d.balance))
  const result = simulate({ debts, ...body })
  const baseline = simulateMinimumsOnly(debts, body.ibraOverrides)
  return NextResponse.json({
    result: {
      ...result,
      // Cap the month-by-month schedule sent to the client
      months: result.months.slice(0, 361),
    },
    baseline: { monthsToFree: baseline.monthsToFree, totalInterest: baseline.totalInterest },
    debts: debts.map((d) => ({ id: d.id, name: d.name, balance: d.balance, method: d.method, ibraAvailable: d.ibraAvailable ?? false })),
  })
}
