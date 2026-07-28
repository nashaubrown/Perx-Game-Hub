import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rules = await prisma.categoryRule.findMany({ orderBy: { priority: 'asc' } })
  return NextResponse.json({ rules })
}

const ruleSchema = z.object({
  keyword: z.string().min(1),
  category: z.string().min(1),
  priority: z.number().int().optional(),
})

export async function POST(req: NextRequest) {
  const body = ruleSchema.parse(await req.json())
  const count = await prisma.categoryRule.count()
  const rule = await prisma.categoryRule.create({
    data: { ...body, priority: body.priority ?? count },
  })
  return NextResponse.json({ rule }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.categoryRule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
