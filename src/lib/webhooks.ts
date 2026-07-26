import crypto from 'crypto';
import { db } from './db';

export type EngagementEvent =
  | 'player_joined'
  | 'game_started'
  | 'game_finished';

/**
 * Emits an engagement event to the venue's configured webhook URL so the main
 * Perx platform can consume Play activity without a rebuild. Fire-and-forget:
 * a dead webhook must never affect gameplay.
 */
export async function emitVenueEvent(
  venueId: string | null | undefined,
  event: EngagementEvent,
  payload: Record<string, unknown>
) {
  if (!venueId) return;
  try {
    const config = await db.webhookConfig.findUnique({ where: { venueId } });
    if (!config || !config.enabled) return;
    const body = JSON.stringify({ event, venueId, at: new Date().toISOString(), data: payload });
    const signature = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
    fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Perx-Event': event,
        'X-Perx-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch {
    // never let webhook failures surface to players
  }
}
