import { Engine } from './engine';
import type { LobbyRoom } from '../realtime/room';

/**
 * Gin Rummy — 2 players, one hand per game (cafe pace), no layoffs.
 * Cards are ids 0–51: suit = id/13 (♠♥♦♣), rank = id%13 (A..K).
 * The server holds hands and the stock; each player only ever sees their own
 * cards. Deadwood is computed server-side with an exact best-meld search.
 * Scoring: gin = opponent deadwood + 25 · knock = difference ·
 * undercut = difference + 25 to the defender.
 */

const suitOf = (id: number) => Math.floor(id / 13);
const rankOf = (id: number) => id % 13;
const valueOf = (id: number) => Math.min(rankOf(id) + 1, 10);

/** All melds (sets of 3–4, runs of 3+) present in a hand. */
function findMelds(hand: number[]): number[][] {
  const melds: number[][] = [];
  // sets
  for (let rank = 0; rank < 13; rank++) {
    const same = hand.filter((c) => rankOf(c) === rank);
    if (same.length >= 3) {
      if (same.length === 4) {
        melds.push(same);
        for (const skip of same) melds.push(same.filter((c) => c !== skip));
      } else {
        melds.push(same);
      }
    }
  }
  // runs
  for (let suit = 0; suit < 4; suit++) {
    const ranks = hand.filter((c) => suitOf(c) === suit).map(rankOf).sort((a, b) => a - b);
    for (let start = 0; start < ranks.length; start++) {
      let len = 1;
      while (ranks.includes(ranks[start] + len)) len++;
      for (let runLen = 3; runLen <= len; runLen++) {
        melds.push(Array.from({ length: runLen }, (_, i) => suit * 13 + ranks[start] + i));
      }
    }
  }
  return melds;
}

/** Exact minimal deadwood + the melds that achieve it. */
export function bestDeadwood(hand: number[]): { deadwood: number; melds: number[][] } {
  const melds = findMelds(hand);
  let best = { deadwood: hand.reduce((s, c) => s + valueOf(c), 0), melds: [] as number[][] };
  const search = (remaining: number[], used: number[][], from: number) => {
    const dw = remaining.reduce((s, c) => s + valueOf(c), 0);
    if (dw < best.deadwood) best = { deadwood: dw, melds: [...used] };
    for (let i = from; i < melds.length; i++) {
      const m = melds[i];
      if (m.every((c) => remaining.includes(c))) {
        search(remaining.filter((c) => !m.includes(c)), [...used, m], i + 1);
      }
    }
  };
  search(hand, [], 0);
  return best;
}

const KNOCK_MAX = 10;

export class RummyEngine extends Engine {
  private hands = new Map<string, number[]>();
  private stock: number[] = [];
  private discard: number[] = [];
  private order: string[];
  private turn = 0;
  private phase: 'draw' | 'discard' = 'draw';
  private drawnFromDiscard: number | null = null;

  constructor(room: LobbyRoom, sessionId: string) {
    super(room, sessionId);
    this.order = [...room.players.keys()];
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    for (const key of this.order) this.hands.set(key, deck.splice(0, 10));
    this.discard = [deck.pop()!];
    this.stock = deck;
  }

  private get turnKey() {
    return this.order[this.turn % 2];
  }

  private sortHand(hand: number[]) {
    return [...hand].sort((a, b) => suitOf(a) - suitOf(b) || rankOf(a) - rankOf(b));
  }

  private publicState(extra?: Record<string, unknown>) {
    return {
      turnKey: this.turnKey,
      phase: this.phase,
      discardTop: this.discard[this.discard.length - 1] ?? null,
      stockCount: this.stock.length,
      counts: Object.fromEntries([...this.hands.entries()].map(([k, h]) => [k, h.length])),
      ...extra,
    };
  }

  private sendHand(key: string) {
    const hand = this.hands.get(key)!;
    // knocking is judged on the 10 cards you'd keep after discarding your worst card
    let canKnock = false;
    let canGin = false;
    if (hand.length === 11) {
      for (const discardCard of hand) {
        const rest = hand.filter((c) => c !== discardCard);
        const { deadwood } = bestDeadwood(rest);
        if (deadwood === 0) canGin = true;
        if (deadwood <= KNOCK_MAX) canKnock = true;
      }
    }
    const { deadwood, melds } = bestDeadwood(hand);
    this.room.emitTo(key, 'rummy:hand', {
      hand: this.sortHand(hand),
      deadwood,
      melds,
      canKnock,
      canGin,
    });
  }

  private broadcast() {
    this.room.emit('rummy:state', this.publicState());
    for (const key of this.order) this.sendHand(key);
  }

  start() {
    this.broadcast();
    this.armTurnGuard(this.turnKey, () => this.forfeit(this.turnKey));
  }

  handleAction(playerKey: string, action: Record<string, unknown>) {
    if (playerKey !== this.turnKey) return;
    const hand = this.hands.get(playerKey)!;

    if (action.type === 'draw' && this.phase === 'draw') {
      const source = action.source === 'discard' ? 'discard' : 'stock';
      if (source === 'discard') {
        const card = this.discard.pop();
        if (card === undefined) return;
        hand.push(card);
        this.drawnFromDiscard = card;
      } else {
        const card = this.stock.pop();
        if (card === undefined) return;
        hand.push(card);
        this.drawnFromDiscard = null;
      }
      this.phase = 'discard';
      this.broadcast();
      return;
    }

    if ((action.type === 'discard' || action.type === 'knock') && this.phase === 'discard') {
      const card = Number(action.card);
      if (!hand.includes(card)) return;
      // you can't discard the card you just took from the discard pile
      if (action.type === 'discard' && card === this.drawnFromDiscard) return;

      const rest = hand.filter((c) => c !== card);

      if (action.type === 'knock') {
        const { deadwood } = bestDeadwood(rest);
        if (deadwood > KNOCK_MAX) return; // not a legal knock
        this.hands.set(playerKey, rest);
        this.discard.push(card);
        this.settle(playerKey);
        return;
      }

      this.hands.set(playerKey, rest);
      this.discard.push(card);
      this.drawnFromDiscard = null;

      // stock exhausted → dead hand, draw
      if (this.stock.length <= 2) {
        this.reveal(null, 'Stock ran out — dead hand', { draw: true });
        return;
      }

      this.turn++;
      this.phase = 'draw';
      this.broadcast();
      this.armTurnGuard(this.turnKey, () => this.forfeit(this.turnKey));
    }
  }

  private settle(knockerKey: string) {
    const defenderKey = this.order.find((k) => k !== knockerKey)!;
    const kd = bestDeadwood(this.hands.get(knockerKey)!).deadwood;
    const od = bestDeadwood(this.hands.get(defenderKey)!).deadwood;

    let reason: string;
    if (kd === 0) {
      this.addScore(knockerKey, od + 25);
      reason = `Gin! +${od + 25}`;
    } else if (od > kd) {
      this.addScore(knockerKey, od - kd);
      reason = `Knock — ${od} vs ${kd} deadwood`;
    } else {
      this.addScore(defenderKey, kd - od + 25);
      reason = `Undercut! ${od} beats ${kd} (+25)`;
    }
    this.reveal(knockerKey, reason);
  }

  private reveal(knockerKey: string | null, reason: string, extra?: Record<string, unknown>) {
    const reveal = Object.fromEntries(
      [...this.hands.entries()].map(([k, h]) => {
        const { melds, deadwood } = bestDeadwood(h);
        return [k, { hand: this.sortHand(h), melds, deadwood }];
      })
    );
    void this.finish({ reason, knockerKey, reveal, ...extra });
  }

  private forfeit(loserKey: string) {
    const winner = this.order.find((k) => k !== loserKey)!;
    this.addScore(winner, 25);
    const loser = this.room.players.get(loserKey);
    this.reveal(null, `${loser?.nickname ?? 'Opponent'} left the game`);
  }

  onRejoin(playerKey: string) {
    this.room.emitTo(playerKey, 'rummy:state', this.publicState());
    this.sendHand(playerKey);
  }
}
