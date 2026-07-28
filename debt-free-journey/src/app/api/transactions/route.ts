import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category') ?? undefined
  const transactions = await prisma.transaction.findMany({
    where: {
      import: { status: 'applied' },
      ...(category ? { category } : {}),
    },
    orderBy: { date: 'desc' },
    take: 500,
  })
  return NextResponse.json({ transactions })
}
