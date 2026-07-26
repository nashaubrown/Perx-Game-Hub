import fs from 'fs';
import path from 'path';
import { Engine } from './engine';
import type { LobbyRoom } from '../realtime/room';

/**
 * 21 Questions — date-night deck for exactly 2 players. The app deals 21
 * questions in three rising tiers (light → medium → deep); you answer out
 * loud at the table, taking turns. Cooperative: no winner, no scoreboard —
 * finish the deck together and both collect the participation points.
 * Each player gets 2 passes (a pass deals a replacement from the same tier).
 */

type Deck = { light: string[]; medium: string[]; deep: string[] };

let deck: Deck | null = null;
function loadDeck(): Deck {
  if (!deck) {
    const file = path.join(process.cwd(), 'data', 'date-night.json');
    deck = (JSON.parse(fs.readFileSync(file, 'utf8')) as { questions21: Deck }).questions21;
  }
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const TOTAL = 21;
const PASSES_PER_PLAYER = 2;

export class TwentyOneEngine extends Engine {
  private order: string[];
  private questions: { q: string; tier: string }[] = [];
  private spares: Record<string, string[]> = {};
  private index = 0;
  private passes = new Map<string, number>();

  constructor(room: LobbyRoom, sessionId: string) {
    super(room, sessionId);
    this.order = shuffle([...room.players.keys()]);
    for (const k of this.order) this.passes.set(k, PASSES_PER_PLAYER);

    const d = loadDeck();
    const light = shuffle(d.light);
    const medium = shuffle(d.medium);
    const deep = shuffle(d.deep);
    // 7 from each tier in rising order; the rest become pass-replacements
    this.questions = [
      ...light.slice(0, 7).map((q) => ({ q, tier: 'light' })),
      ...medium.slice(0, 7).map((q) => ({ q, tier: 'medium' })),
      ...deep.slice(0, 7).map((q) => ({ q, tier: 'deep' })),
    ];
    this.spares = { light: light.slice(7), medium: medium.slice(7), deep: deep.slice(7) };
  }

  private get answererKey() {
    return this.order[this.index % 2];
  }

  private statePayload() {
    const current = this.questions[this.index];
    return {
      index: this.index,
      total: TOTAL,
      question: current?.q,
      tier: current?.tier,
      answererKey: this.answererKey,
      passesLeft: Object.fromEntries(this.passes),
    };
  }

  private broadcast() {
    this.room.emit('21q:state', this.statePayload());
  }

  start() {
    this.broadcast();
    this.guard();
  }

  private guard() {
    // answerer's phone gone for 3 minutes → advance so the deck isn't stuck
    this.armTurnGuard(this.answererKey, () => this.advance(), 180000);
  }

  private advance() {
    this.index++;
    if (this.index >= TOTAL) {
      // co-op finish: equal scores + draw flag → nobody collects a win bonus
      for (const k of this.order) this.addScore(k, TOTAL);
      void this.finish({
        draw: true,
        title: 'Deck complete 💚',
        reason: '21 questions, zero small talk. Points for both of you.',
      });
      return;
    }
    this.broadcast();
    this.guard();
  }

  handleAction(playerKey: string, action: Record<string, unknown>) {
    if (playerKey !== this.answererKey) return;

    if (action.type === 'answered') {
      this.advance();
      return;
    }

    if (action.type === 'pass') {
      const left = this.passes.get(playerKey) ?? 0;
      const tier = this.questions[this.index].tier;
      const spare = this.spares[tier]?.shift();
      if (left <= 0 || !spare) return;
      this.passes.set(playerKey, left - 1);
      this.questions[this.index] = { q: spare, tier };
      this.broadcast();
    }
  }

  onRejoin(playerKey: string) {
    this.room.emitTo(playerKey, '21q:state', this.statePayload());
  }
}
