import { z } from 'zod'
import type { ParseResult, ParserInput } from './types'
import { parseStatementDate } from './normalize'

export function aiParsingEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

const aiResponseSchema = z.object({
  transactions: z.array(
    z.object({
      date: z.string(),
      description: z.string().min(1),
      amount: z.number().positive(),
      direction: z.enum(['debit', 'credit']),
    }),
  ),
  closing_balance: z.number().nullable(),
})

/**
 * AI fallback for unrecognized statement layouts. Sends the extracted text to
 * the Claude API and validates the strict-JSON reply with zod. Only used when
 * ANTHROPIC_API_KEY is set (feature-flagged; the app is fully functional
 * without it).
 */
export async function parseWithAi(input: ParserInput): Promise<ParseResult> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic()
  const text = input.text.slice(0, 100_000)

  const message = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `Extract every transaction from this bank/credit-card statement text.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"transactions":[{"date":"YYYY-MM-DD","description":"...","amount":123.45,"direction":"debit"|"credit"}],"closing_balance":1234.56}

Rules:
- "amount" is a positive number in major currency units (e.g. 1250.50).
- "direction" is "debit" for money out, "credit" for money in.
- "closing_balance" is the statement's closing balance, or null if absent.
- Skip summary/total rows; include only real transactions.

Statement text:
${text}`,
      },
    ],
  })

  const raw = message.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')
  const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  const parsed = aiResponseSchema.parse(JSON.parse(jsonText))

  const transactions = parsed.transactions
    .map((t) => ({
      date: parseStatementDate(t.date) ?? t.date,
      description: t.description,
      amount: Math.round(t.amount * 100),
      direction: t.direction,
    }))
    .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.amount > 0)

  const dates = transactions.map((t) => t.date).sort()
  return {
    transactions,
    closingBalance: parsed.closing_balance === null ? null : Math.round(parsed.closing_balance * 100),
    parserName: 'claude-ai',
    method: 'ai',
    confidence: 1,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
  }
}
