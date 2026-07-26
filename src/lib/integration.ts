import crypto from 'crypto';
import { db } from './db';

/**
 * MyPerx integration — merchant-card points earned by playing at a venue.
 *
 * Anti-farming design (a photographed table QR is worthless):
 *  - Card points post as PENDING and only credit after a same-day transaction
 *    at that merchant (MyPerx notifies us via /api/v1/integration/transactions),
 *    OR instantly when a presence signal (venue Wi-Fi IP) matched at play time.
 *  - Daily per-customer cap per venue, merchant-configured.
 *  - Earning outside the venue's opening hours is rejected outright.
 *  - One earning session per user per venue per 4-hour window.
 *  - PENDING events expire at the end of the venue-local day.
 *
 * Delivery: CONFIRMED events are pushed to MYPERX_API_URL/wallet/play-earn,
 * HMAC-signed, with the Play ledger row id as the idempotency key.
 */

const SHARED_SECRET = process.env.MYPERX_SHARED_SECRET || 'dev-myperx-shared-secret';
const SESSION_WINDOW_MS = 4 * 60 * 60 * 1000;

export function hmacSign(body: string): string {
  return crypto.createHmac('sha256', SHARED_SECRET).update(body).digest('hex');
}

export function hmacVerify(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = hmacSign(body);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Venue-local (Maldives, UTC+5) date + hour. */
function venueNow() {
  const local = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return { day: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

function withinHours(open: number | null, close: number | null, hour: number): boolean {
  if (open === null || close === null) return true; // hours not configured — allow
  if (open === close) return true;
  if (open < close) return hour >= open && hour < close;
  return hour >= open || hour < close; // overnight venues (e.g. 18 → 01)
}

export type EarnInput = {
  userId: string;
  venueId: string;
  playPoints: number;
  ledgerRowId: string;
  presentByIp: boolean;
};

/**
 * Called after a venue-tagged game finishes, once per (registered) player.
 * Computes merchant-card points under the venue's rules and stores the earn
 * event. Returns the event or a skip reason.
 */
export async function createEarnEvent(input: EarnInput) {
  const venue = await db.venue.findUnique({ where: { id: input.venueId } });
  if (!venue || !venue.playEarnEnabled) return { skipped: 'earning_disabled' };

  const { day, hour } = venueNow();
  if (!withinHours(venue.openHour, venue.closeHour, hour)) return { skipped: 'outside_opening_hours' };

  // one earning session per 4h window per user per venue
  const recent = await db.playEarnEvent.findFirst({
    where: {
      userId: input.userId,
      venueId: venue.id,
      createdAt: { gte: new Date(Date.now() - SESSION_WINDOW_MS) },
      status: { in: ['PENDING', 'CONFIRMED', 'SENT'] },
    },
  });
  if (recent) return { skipped: 'session_window' };

  // daily cap
  const todayAgg = await db.playEarnEvent.aggregate({
    where: { userId: input.userId, venueId: venue.id, day, status: { in: ['PENDING', 'CONFIRMED', 'SENT'] } },
    _sum: { cardPoints: true },
  });
  const usedToday = todayAgg._sum.cardPoints ?? 0;
  const raw = Math.floor((input.playPoints / 10) * venue.earnRatePer10 * venue.multiplier);
  const cardPoints = Math.max(0, Math.min(raw, venue.dailyCardCap - usedToday));
  if (cardPoints === 0) return { skipped: 'daily_cap_reached' };

  const user = await db.user.findUnique({ where: { id: input.userId } });

  const event = await db.playEarnEvent.create({
    data: {
      ledgerRowId: input.ledgerRowId,
      userId: input.userId,
      perxUserId: user?.perxUserId ?? null,
      venueId: venue.id,
      merchantId: venue.externalMerchantId,
      playPoints: input.playPoints,
      cardPoints,
      day,
      status: input.presentByIp ? 'CONFIRMED' : 'PENDING',
      presence: input.presentByIp ? 'venue_ip' : null,
      confirmedAt: input.presentByIp ? new Date() : null,
    },
  });
  return { event };
}

/**
 * MyPerx tells us a customer transacted at a merchant → confirm that
 * customer's pending events for the same venue-local day.
 */
export async function confirmByTransaction(perxUserId: string, merchantId: string, when?: Date) {
  const at = when ?? new Date();
  const day = new Date(at.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const venue = await db.venue.findUnique({ where: { externalMerchantId: merchantId } });
  if (!venue) return { confirmed: 0, error: 'unknown_merchant' };

  // match on linked perxUserId, or on Play users linked to it
  const users = await db.user.findMany({ where: { perxUserId }, select: { id: true } });
  if (users.length === 0) return { confirmed: 0, error: 'unknown_user' };

  const result = await db.playEarnEvent.updateMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      venueId: venue.id,
      day,
      status: 'PENDING',
    },
    data: { status: 'CONFIRMED', presence: 'transaction', confirmedAt: at },
  });
  return { confirmed: result.count };
}

/** Expire pending events from previous venue-local days. */
export async function expireStalePending() {
  const { day } = venueNow();
  const result = await db.playEarnEvent.updateMany({
    where: { status: 'PENDING', day: { lt: day } },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

/** Push CONFIRMED events to the MyPerx wallet API. No-op until MYPERX_API_URL is set. */
export async function dispatchConfirmed() {
  const apiUrl = process.env.MYPERX_API_URL;
  if (!apiUrl) return { sent: 0, queued: await db.playEarnEvent.count({ where: { status: 'CONFIRMED' } }) };

  const batch = await db.playEarnEvent.findMany({
    where: { status: 'CONFIRMED', attempts: { lt: 10 }, perxUserId: { not: null }, merchantId: { not: null } },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });

  let sent = 0;
  for (const event of batch) {
    const body = JSON.stringify({
      idempotencyKey: event.ledgerRowId,
      perxUserId: event.perxUserId,
      merchantId: event.merchantId,
      cardPoints: event.cardPoints,
      playPoints: event.playPoints,
      source: 'perx-play',
      presence: event.presence,
      earnedAt: event.createdAt.toISOString(),
    });
    try {
      const res = await fetch(`${apiUrl.replace(/\/$/, '')}/wallet/play-earn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Perx-Signature': hmacSign(body),
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok || res.status === 409) {
        // 409 = MyPerx already has this idempotency key — treat as delivered
        await db.playEarnEvent.update({
          where: { id: event.id },
          data: { status: 'SENT', sentAt: new Date() },
        });
        sent++;
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      await db.playEarnEvent.update({
        where: { id: event.id },
        data: {
          attempts: { increment: 1 },
          lastError: String((err as Error).message).slice(0, 200),
          status: event.attempts + 1 >= 10 ? 'FAILED' : 'CONFIRMED',
        },
      });
    }
  }
  return { sent };
}

/** Pending card points per venue for a user — powers the "unlock with any purchase" nudge. */
export async function pendingForUser(userId: string) {
  const rows = await db.playEarnEvent.groupBy({
    by: ['venueId'],
    where: { userId, status: 'PENDING' },
    _sum: { cardPoints: true },
  });
  if (rows.length === 0) return [];
  const venues = await db.venue.findMany({
    where: { id: { in: rows.map((r) => r.venueId) } },
    select: { id: true, name: true },
  });
  const nameById = Object.fromEntries(venues.map((v) => [v.id, v.name]));
  return rows.map((r) => ({
    venueId: r.venueId,
    venue: nameById[r.venueId] ?? 'a venue',
    cardPoints: r._sum.cardPoints ?? 0,
  }));
}
