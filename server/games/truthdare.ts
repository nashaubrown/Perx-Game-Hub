import fs from 'fs';
import path from 'path';
import { Engine } from './engine';
import type { LobbyRoom } from '../realtime/room';

/**
 * Truth or Dare — 2–8 players, cafe-appropriate deck (all dares are doable
 * at a table). Each round one player picks truth or dare, gets a prompt,
 * and either completes it (+10) or chickens out (0). Four rounds each,
 * capped at 20 total. Most points wins the usual win bonus — chicken at
 * your peril.
 */

type Decks = { truths: string[]; dares: string[] };

let decks: Decks | null = null;
function loadDecks(): Decks {
  if (!decks) {
    const file = path.join(process.cwd(), 'data', 'date-night.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Decks;
    decks = { truths: data.truths, dares: data.dares };
  }
  return decks;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const POINTS_DONE = 10;

export class TruthDareEngine extends Engine {
  private order: string[];
  private truths: string[];
  private dares: string[];
  private round = 0;
  private totalRounds: number;
  private phase: 'choose' | 'doing' = 'choose';
  private kind: 'truth' | 'dare' | null = null;
  private prompt: string | null = null;

  constructor(room: LobbyRoom, sessionId: string) {
    super(room, sessionId);
    this.order = shuffle([...room.players.keys()]);
    this.totalRounds = Math.min(20, this.order.length * 4);
    const d = loadDecks();
    this.truths = shuffle(d.truths);
    this.dares = shuffle(d.dares);
  }

  private get currentKey() {
    return this.order[this.round % this.order.length];
  }

  private statePayload() {
    return {
      round: this.round,
      total: this.totalRounds,
      currentKey: this.currentKey,
      phase: this.phase,
      kind: this.kind,
      prompt: this.prompt,
      scoreboard: this.scoreboard(),
    };
  }

  private broadcast() {
    this.room.emit('tod:state', this.statePayload());
  }

  start() {
    this.broadcast();
    this.guard();
  }

  private guard() {
    // player on the spot vanished for 2 minutes → counts as a chicken
    this.armTurnGuard(this.currentKey, () => this.nextRound(), 120000);
  }

  private nextRound() {
    this.round++;
    if (this.round >= this.totalRounds) {
      void this.finish({ reason: 'Most completed truths and dares wins' });
      return;
    }
    this.phase = 'choose';
    this.kind = null;
    this.prompt = null;
    this.broadcast();
    this.guard();
  }

  handleAction(playerKey: string, action: Record<string, unknown>) {
    if (playerKey !== this.currentKey) return;

    if (action.type === 'pick' && this.phase === 'choose') {
      const kind = action.kind === 'dare' ? 'dare' : 'truth';
      const pool = kind === 'dare' ? this.dares : this.truths;
      // recycle the deck if a long game drains it
      if (pool.length === 0) {
        const d = loadDecks();
        pool.push(...shuffle(kind === 'dare' ? d.dares : d.truths));
      }
      this.kind = kind;
      this.prompt = pool.shift() ?? null;
      this.phase = 'doing';
      this.broadcast();
      this.guard();
      return;
    }

    if ((action.type === 'done' || action.type === 'chicken') && this.phase === 'doing') {
      if (action.type === 'done') this.addScore(playerKey, POINTS_DONE);
      this.room.emit('tod:result', {
        key: playerKey,
        nickname: this.room.players.get(playerKey)?.nickname,
        done: action.type === 'done',
        kind: this.kind,
      });
      this.nextRound();
    }
  }

  onRejoin(playerKey: string) {
    this.room.emitTo(playerKey, 'tod:state', this.statePayload());
  }
}
