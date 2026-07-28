import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { extractInput } from '@/lib/import/extract'
import { runRuleParsers } from '@/lib/import/parsers'
import { aiParsingEnabled, parseWithAi } from '@/lib/import/ai'
import { applyImport } from '@/lib/import/apply'

export const dynamic = 'force-dynamic'

export async function GET() {
  const imports = await prisma.statementImport.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { transactions: true, payments: true } } },
  })
  return NextResponse.json({ imports, aiEnabled: aiParsingEnabled() })
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file')
  const statementType = (form.get('statementType') as string) === 'credit_card' ? 'credit_card' : 'bank_account'
  const cardDebtId = (form.get('cardDebtId') as string) || undefined
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let input
  try {
    input = await extractInput(file.name, buffer)
  } catch (e) {
    return NextResponse.json({ error: `Could not read ${file.name}: ${(e as Error).message}` }, { status: 400 })
  }
  input.statementType = statementType

  // Rules first — free, private, deterministic. AI only as fallback.
  let parsed = runRuleParsers(input)
  if (!parsed) {
    if (!aiParsingEnabled()) {
      return NextResponse.json(
        {
          error:
            'Statement layout not recognized by the rule-based parsers. Set ANTHROPIC_API_KEY to enable the AI fallback, or export the statement as CSV from internet banking.',
        },
        { status: 422 },
      )
    }
    try {
      parsed = await parseWithAi(input)
    } catch (e) {
      return NextResponse.json({ error: `AI parsing failed: ${(e as Error).message}` }, { status: 502 })
    }
  }

  if (parsed.transactions.length === 0) {
    return NextResponse.json({ error: 'No transactions found in this statement.' }, { status: 422 })
  }

  const summary = await applyImport(prisma, parsed, { filename: file.name, statementType, cardDebtId })
  return NextResponse.json({ summary })
}
