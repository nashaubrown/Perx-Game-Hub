import { NextRequest, NextResponse } from 'next/server';
import { confirmByTransaction, hmacVerify } from '@/lib/integration';

/**
 * MyPerx → Play: a customer transacted at a merchant. Confirms that
 * customer's PENDING play-earn events for the same venue-local day, which
 * releases their merchant-card points for delivery.
 *
 * Auth: HMAC-SHA256 of the raw body with MYPERX_SHARED_SECRET in
 * X-Perx-Signature. Body: { perxUserId, merchantId, at? (ISO datetime) }
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!hmacVerify(raw, req.headers.get('x-perx-signature'))) {
    return NextResponse.json({ error: 'Bad signature.' }, { status: 401 });
  }
  let body: { perxUserId?: string; merchantId?: string; at?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad JSON.' }, { status: 400 });
  }
  if (!body.perxUserId || !body.merchantId) {
    return NextResponse.json({ error: 'perxUserId and merchantId are required.' }, { status: 400 });
  }
  const when = body.at && !isNaN(Date.parse(body.at)) ? new Date(body.at) : undefined;
  const result = await confirmByTransaction(body.perxUserId, body.merchantId, when);
  return NextResponse.json(result);
}
