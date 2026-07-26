import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { sendDailyDigests } from '@/lib/digest';

/** Force-send daily digests now — for testing a venue's webhook wiring. */
export async function POST() {
  const user = await currentUser();
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
  return NextResponse.json({ outcomes: await sendDailyDigests(true) });
}
