import { NextResponse } from 'next/server'
import { buildOverview } from '@/lib/overview'

export const dynamic = 'force-dynamic'

export async function GET() {
  const overview = await buildOverview()
  return NextResponse.json({ overview })
}
