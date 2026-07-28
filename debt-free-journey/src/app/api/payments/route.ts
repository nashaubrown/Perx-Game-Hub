import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const debtId = req.nextUrl.searchParams.get('debtId') ?? undefined
  const payments = await prisma.payment.findMany({
    where: debtId ? { debtId } : undefined,
    include: { debt: { select: { name: true } } },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json({ payments })
}

const paymentSchema = z.object({
  debtId: z.string().min(1),
  date: z.string(),
  amount: z.number().int(),
  kind: z.enum(['payment', 'adjustment']).default('payment'),
  note: z.string().nullable().optional(),
})

export async function POST(req: NextRequest) {
  const body = paymentSchema.parse(await req.json())
  if (body.kind === 'payment' && body.amount <= 0) {
    return NextResponse.json({ error: 'Payment amount must be positive' }, { status: 400 })
  }
  const payment = await prisma.payment.create({
    data: { ...body, date: new Date(body.date) },
  })
  return NextResponse.json({ payment }, { status: 201 })
}
