import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const profile = await prisma.profile.findFirst({ include: { expenses: true } })
  return NextResponse.json({ profile })
}

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  monthlyIncome: z.number().int().nonnegative(),
  currency: z.string().min(1).max(8),
  paydayDay: z.number().int().min(1).max(31),
  strategy: z.enum(['avalanche', 'snowball', 'custom']).optional(),
  debtBudget: z.number().int().nonnegative().nullable().optional(),
  onboarded: z.boolean().optional(),
  expenses: z.array(z.object({ name: z.string().min(1), amount: z.number().int().nonnegative() })).optional(),
})

export async function PUT(req: NextRequest) {
  const body = profileSchema.parse(await req.json())
  const existing = await prisma.profile.findFirst()
  const { expenses, ...data } = body
  const profile = existing
    ? await prisma.profile.update({ where: { id: existing.id }, data })
    : await prisma.profile.create({ data: { ...data, name: data.name ?? 'Me' } })

  if (expenses) {
    await prisma.expense.deleteMany({ where: { profileId: profile.id } })
    await prisma.expense.createMany({
      data: expenses.map((e) => ({ ...e, profileId: profile.id })),
    })
  }
  const fresh = await prisma.profile.findFirst({ include: { expenses: true } })
  return NextResponse.json({ profile: fresh })
}
