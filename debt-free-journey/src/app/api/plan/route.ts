import { NextResponse } from 'next/server'
import { buildMonthlyPlan } from '@/lib/overview'

export const dynamic = 'force-dynamic'

export async function GET() {
  const plan = await buildMonthlyPlan()
  return NextResponse.json({ plan })
}
