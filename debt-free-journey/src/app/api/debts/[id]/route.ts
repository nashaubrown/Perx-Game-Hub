import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { debtSchema } from '@/lib/schemas'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = debtSchema.partial().parse(await req.json())
  const debt = await prisma.debt.update({
    where: { id: params.id },
    data: {
      ...body,
      startDate: body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : undefined,
      endDate: body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : undefined,
    },
  })
  return NextResponse.json({ debt })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.debt.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
