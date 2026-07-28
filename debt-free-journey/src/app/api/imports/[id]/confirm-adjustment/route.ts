import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Applies a reconciliation adjustment that was outside the sane range —
 *  the single manual confirmation in the otherwise automatic import flow. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const imp = await prisma.statementImport.findUnique({ where: { id: params.id } })
  if (!imp || imp.status === 'undone') {
    return NextResponse.json({ error: 'Import not found or undone' }, { status: 404 })
  }
  const summary = JSON.parse(imp.summary)
  const pending = summary.pendingAdjustment
  if (!pending) return NextResponse.json({ error: 'Nothing to confirm' }, { status: 400 })

  await prisma.payment.create({
    data: {
      debtId: pending.debtId,
      date: imp.periodEnd ?? new Date(),
      amount: pending.delta,
      kind: 'adjustment',
      note: `Reconciled with statement ${imp.filename} (user-confirmed large adjustment)`,
      importId: imp.id,
      autoLogged: false,
    },
  })
  summary.balanceAdjustment = pending.delta
  summary.pendingAdjustment = null
  await prisma.statementImport.update({ where: { id: imp.id }, data: { summary: JSON.stringify(summary) } })
  return NextResponse.json({ ok: true })
}
