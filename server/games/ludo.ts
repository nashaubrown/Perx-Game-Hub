import { Engine } from './engine';
import type { LobbyRoom } from '../realtime/room';

/**
 * Ludo — 2–4 players, 4 tokens each. Standard rules: roll a 6 to leave the
 * yard, 6 rolls again, landing on an opponent's single token on a non-safe
 * square captures it (and grants another roll), exact roll to get home.
 * Token positions: -1 = yard · 0–50 = steps along the main track (relative
 * to the player's start) · 51–55 = home column · 56 = home.
 *
 * Turn flow is roll → move; both are validated server-side. If the player on
 * turn has no legal move their turn auto-passes. A player disconnected on
 * their turn for 90s gets auto-played (roll + first legal move) so the table
 * keeps going. First player home wins; others rank by progress.
 */

const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
// starting index on the 52-cell main track for each color (13 apart)
const STARTS = [1, 14, 27, 40];
// safe squares (absolute track indices): the 4 start squares + 4 stars
const SAFE = new Set([1, 14, 27, 40, 9, 22, 35, 48]);
const HOME = 56;

type LudoPlayer = { key: string; color: number; tokens: number[] };

export class LudoEngine extends Engine {
  private players: LudoPlayer[] = [];
  private turn = 0;
  private phase: 'roll' | 'move' = 'roll';
  private dice = 0;
  private sixStreak = 0;

  constructor(room: LobbyRoom, sessionId: string) {
    super(room, sessionId);
    const keys = [...room.players.keys()];
    // 2 players sit opposite each other (red vs yellow)
    const colorOrder = keys.length === 2 ? [0, 2] : keys.length === 3 ? [0, 1, 2] : [0, 1, 2, 3];
    this.players = keys.map((key, i) => ({ key, color: colorOrder[i], tokens: [-1, -1, -1, -1] }));
  }

  private get current() {
    return this.players[this.turn % this.players.length];
  }

  /** Absolute main-track index for a relative step, or null if not on the track. */
  private absIndex(color: number, step: number): number | null {
    if (step < 0 || step > 50) return null;
    return (STARTS[color] + step) % 52;
  }

  private movableTokens(player: LudoPlayer, dice: number): number[] {
    const out: number[] = [];
    player.tokens.forEach((pos, i) => {
      if (pos === HOME) return;
      if (pos === -1) {
        if (dice === 6 && this.landableFromYard(player)) out.push(i);
        return;
      }
      const next = pos + dice;
      if (next > HOME) return; // must be exact
      if (next <= 50 && this.blockedByOwnToken(player, next)) return;
      out.push(i);
    });
    return out;
  }

  /** own token already on the start square blocks exiting the yard */
  private landableFromYard(player: LudoPlayer): boolean {
    return !player.tokens.some((p) => p === 0);
  }

  private blockedByOwnToken(player: LudoPlayer, step: number): boolean {
    return player.tokens.some((p) => p === step);
  }

  private statePayload(extra?: Record<string, unknown>) {
    return {
      players: this.players.map((p) => ({
        key: p.key,
        nickname: this.room.players.get(p.key)?.nickname,
        color: COLORS[p.color],
        tokens: [...p.tokens],
      })),
      turnKey: this.current.key,
      phase: this.phase,
      dice: this.dice,
      movable: this.phase === 'move' ? this.movableTokens(this.current, this.dice) : [],
      ...extra,
    };
  }

  private broadcast(extra?: Record<string, unknown>) {
    this.room.emit('ludo:state', this.statePayload(extra));
  }

  start() {
    this.broadcast();
    this.guard();
  }

  private guard() {
    this.armTurnGuard(this.current.key, () => this.autoPlay(), 90000);
  }

  /** disconnected player: roll and/or make the first legal move for them */
  private autoPlay() {
    if (this.phase === 'roll') this.doRoll();
    if (this.phase === 'move') {
      const movable = this.movableTokens(this.current, this.dice);
      if (movable.length > 0) this.doMove(movable[0]);
    }
    if (!this.finished) this.guard();
  }

  handleAction(playerKey: string, action: Record<string, unknown>) {
    if (playerKey !== this.current.key) return;
    if (action.type === 'roll' && this.phase === 'roll') this.doRoll();
    else if (action.type === 'move' && this.phase === 'move') this.doMove(Number(action.token));
  }

  private doRoll() {
    this.dice = 1 + Math.floor(Math.random() * 6);
    if (this.dice === 6) this.sixStreak++;

    // three sixes in a row: turn is lost (standard rule)
    if (this.sixStreak >= 3) {
      this.broadcast({ event: 'triple-six' });
      this.nextTurn();
      return;
    }

    const movable = this.movableTokens(this.current, this.dice);
    if (movable.length === 0) {
      // dead roll — show it briefly, then either re-roll (on a 6) or pass
      this.broadcast({ event: 'no-move' });
      this.after(1500, () => {
        if (this.dice === 6) {
          this.broadcast();
          this.guard();
        } else {
          this.nextTurn();
        }
      });
      return;
    }

    this.phase = 'move';
    this.broadcast();
    this.guard();
  }

  private doMove(tokenIdx: number) {
    const player = this.current;
    const movable = this.movableTokens(player, this.dice);
    if (!movable.includes(tokenIdx)) return;

    let captured = false;
    const pos = player.tokens[tokenIdx];
    const next = pos === -1 ? 0 : pos + this.dice;
    player.tokens[tokenIdx] = next;

    // capture check (main track only, non-safe squares, single tokens)
    if (next <= 50) {
      const abs = this.absIndex(player.color, next)!;
      if (!SAFE.has(abs)) {
        for (const other of this.players) {
          if (other === player) continue;
          const hits = other.tokens
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p >= 0 && p <= 50 && this.absIndex(other.color, p) === abs);
          if (hits.length === 1) {
            other.tokens[hits[0].i] = -1;
            captured = true;
          }
        }
      }
    }

    // finished all 4 tokens → game over, rank the rest by progress
    if (player.tokens.every((t) => t === HOME)) {
      const progress = (p: LudoPlayer) => p.tokens.reduce((s, t) => s + (t === -1 ? 0 : t + 1), 0);
      const others = this.players.filter((p) => p !== player).sort((a, b) => progress(b) - progress(a));
      this.addScore(player.key, 100);
      others.forEach((p, i) => this.addScore(p.key, Math.max(10, 50 - i * 20)));
      this.broadcast({ event: 'finished' });
      void this.finish({ reason: `${this.room.players.get(player.key)?.nickname} got all four home` });
      return;
    }

    const extraRoll = this.dice === 6 || captured || next === HOME;
    if (extraRoll) {
      this.phase = 'roll';
      this.broadcast({ event: captured ? 'capture' : undefined });
      this.guard();
    } else {
      this.broadcast({ event: captured ? 'capture' : undefined });
      this.nextTurn();
    }
  }

  private nextTurn() {
    this.turn++;
    this.sixStreak = 0;
    this.phase = 'roll';
    this.dice = 0;
    this.broadcast();
    this.guard();
  }

  onRejoin(playerKey: string) {
    this.room.emitTo(playerKey, 'ludo:state', this.statePayload());
  }
}
