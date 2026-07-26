import { db } from '../../src/lib/db';
import { award, POINTS } from '../../src/lib/points';
import { emitVenueEvent } from '../../src/lib/webhooks';
import type { LobbyRoom, RoomPlayer } from '../realtime/room';

export type FinalStanding = {
  key: string;
  nickname: string;
  score: number;
  rank: number;
  won: boolean;
  isGuest: boolean;
};

/**
 * Base class for multiplayer game engines. All scoring lives here on the
 * server — clients only send intents (an answer, a word, a guess) and render
 * the state the engine broadcasts.
 */
export abstract class Engine {
  room: LobbyRoom;
  sessionId: string;
  scores = new Map<string, number>();
  finished = false;
  private timers = new Set<NodeJS.Timeout>();

  constructor(room: LobbyRoom, sessionId: string) {
    this.room = room;
    this.sessionId = sessionId;
    for (const p of room.players.values()) this.scores.set(p.key, 0);
  }

  abstract start(): void;
  abstract handleAction(playerKey: string, action: Record<string, unknown>): void;
  /** Resend enough state for a player who reconnected mid-game. */
  abstract onRejoin(playerKey: string): void;

  protected after(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.finished) fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  protected addScore(playerKey: string, delta: number) {
    this.scores.set(playerKey, (this.scores.get(playerKey) ?? 0) + delta);
  }

  scoreboard() {
    return [...this.room.players.values()]
      .map((p) => ({ key: p.key, nickname: p.nickname, score: this.scores.get(p.key) ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }

  protected async finish(extra?: Record<string, unknown>) {
    if (this.finished) return;
    this.finished = true;
    for (const t of this.timers) clearTimeout(t);

    const board = this.scoreboard();
    const topScore = board[0]?.score ?? 0;
    const standings: FinalStanding[] = board.map((entry, i) => {
      const player = this.room.players.get(entry.key) as RoomPlayer;
      return {
        key: entry.key,
        nickname: entry.nickname,
        score: entry.score,
        rank: i + 1,
        won: entry.score === topScore && topScore > 0,
        isGuest: !player?.userId,
      };
    });

    await db.gameSession.update({
      where: { id: this.sessionId },
      data: { endedAt: new Date() },
    });

    for (const s of standings) {
      const player = this.room.players.get(s.key);
      if (!player) continue;
      await db.gameResult.create({
        data: {
          sessionId: this.sessionId,
          lobbyPlayerId: player.lobbyPlayerId,
          userId: player.userId,
          guestId: player.guestId,
          score: s.score,
          rank: s.rank,
          won: s.won,
        },
      });
      await award({
        userId: player.userId,
        guestId: player.guestId,
        amount: POINTS.GAME_PLAYED,
        reason: 'game_played',
        refType: 'session',
        refId: this.sessionId,
        venueId: this.room.venueId,
      });
      if (s.won) {
        await award({
          userId: player.userId,
          guestId: player.guestId,
          amount: POINTS.GAME_WON,
          reason: 'game_won',
          refType: 'session',
          refId: this.sessionId,
          venueId: this.room.venueId,
        });
      }
    }

    await this.room.setStatus('OPEN'); // lobby survives the game — play again with the same code
    this.room.engine = null;

    this.room.emit('game:final', {
      standings,
      pointsPerPlayer: POINTS.GAME_PLAYED,
      pointsForWin: POINTS.GAME_WON,
      ...extra,
    });
    this.room.broadcastState();

    emitVenueEvent(this.room.venueId, 'game_finished', {
      lobbyCode: this.room.code,
      gameId: this.room.gameId,
      sessionId: this.sessionId,
      players: standings.map(({ nickname, score, rank }) => ({ nickname, score, rank })),
    });
  }
}
