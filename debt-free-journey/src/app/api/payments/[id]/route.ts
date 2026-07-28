import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  date: z.string().optional(),
  amount: z.number().int().optional(),
  note: z.string().nullable().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = updateSchema.parse(await req.json())
  const payment = await prisma.payment.update({
    where: { id: params.id },
    data: { ...body, date: body.date ? new Date(body.date) : undefined },
  })
  return NextResponse.json({ payment })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.payment.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
