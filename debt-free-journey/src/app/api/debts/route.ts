import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { derivedBalance } from '@/lib/debts'
import { debtSchema } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function GET() {
  const debts = await prisma.debt.findMany({ include: { payments: true }, orderBy: { sortOrder: 'asc' } })
  return NextResponse.json({
    debts: debts.map((d) => ({ ...d, balance: derivedBalance(d, d.payments), payments: undefined })),
  })
}

export async function POST(req: NextRequest) {
  const body = debtSchema.parse(await req.json())
  const profile = await prisma.profile.findFirst()
  if (!profile) return NextResponse.json({ error: 'Set up your profile first' }, { status: 400 })
  const count = await prisma.debt.count()
  const debt = await prisma.debt.create({
    data: {
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      sortOrder: body.sortOrder ?? count,
      profileId: profile.id,
    },
  })
  return NextResponse.json({ debt }, { status: 201 })
}
