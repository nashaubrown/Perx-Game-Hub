import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { undoImport } from '@/lib/import/apply'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const imp = await prisma.statementImport.findUnique({ where: { id: params.id } })
  if (!imp) return NextResponse.json({ error: 'Import not found' }, { status: 404 })
  if (imp.status === 'undone') return NextResponse.json({ error: 'Already undone' }, { status: 400 })
  await undoImport(prisma, params.id)
  return NextResponse.json({ ok: true })
}
