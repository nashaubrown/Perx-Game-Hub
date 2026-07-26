import fs from 'fs';
import path from 'path';
import { Engine } from './engine';
import type { LobbyRoom } from '../realtime/room';

type Phrase = { phrase: string; category: string };

const CHOOSE_MS = 25000;
const GUESS_MS = 75000;
const REVEAL_MS = 5000;
const MAX_ROUNDS = 5;

let phrases: Phrase[] | null = null;
function loadPhrases(): Phrase[] {
  if (!phrases) {
    const file = path.join(process.cwd(), 'data', 'emoji-phrases.json');
    phrases = JSON.parse(fs.readFileSync(file, 'utf8')) as Phrase[];
  }
  return phrases;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Emoji Guess — each round one player is the presenter: they get a phrase and
 * pick emojis to represent it, everyone else races to guess in chat. First
 * correct guess 150, later correct guesses 75, presenter earns 25 per correct
 * guesser (so obscure emoji picks score nothing).
 */
export class EmojiGuessEngine extends Engine {
  private order: string[];
  private round = -1;
  private phase: 'choose' | 'guess' | 'reveal' = 'choose';
  private options: Phrase[] = [];
  private phrase: Phrase | null = null;
  private emojis = '';
  private guessed = new Set<string>();
  private chat: { key: string; nickname: string; text: string; correct: boolean }[] = [];
  private endsAt = 0;
  private phaseTimer: NodeJS.Timeout | null = null;

  constructor(room: LobbyRoom, sessionId: string) {
    super(room, sessionId);
    const keys = [...room.players.keys()];
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    this.order = keys.slice(0, MAX_ROUNDS);
  }

  private get presenterKey() {
    return this.order[this.round];
  }

  start() {
    this.nextRound();
  }

  private nextRound() {
    this.round++;
    if (this.round >= this.order.length) {
      void this.finish();
      return;
    }
    this.phase = 'choose';
    this.phrase = null;
    this.emojis = '';
    this.guessed.clear();
    this.chat = [];
    const pool = loadPhrases();
    this.options = Array.from({ length: 3 }, () => pool[Math.floor(Math.random() * pool.length)]);
    this.endsAt = Date.now() + CHOOSE_MS;

    const presenter = this.room.players.get(this.presenterKey);
    this.room.emit('emoji:round', {
      round: this.round,
      total: this.order.length,
      presenterKey: this.presenterKey,
      presenterName: presenter?.nickname,
      phase: 'choose',
      endsAt: this.endsAt,
    });
    this.room.emitTo(this.presenterKey, 'emoji:options', {
      options: this.options.map((o) => o.phrase),
    });
    this.phaseTimer = this.after(CHOOSE_MS, () => {
      // presenter idle — auto-pick so the table isn't stuck
      if (this.phase === 'choose') this.beginGuessing(this.options[0], '🤔❓');
    });
  }

  private beginGuessing(phrase: Phrase, emojis: string) {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phase = 'guess';
    this.phrase = phrase;
    this.emojis = emojis;
    this.endsAt = Date.now() + GUESS_MS;
    this.room.emit('emoji:board', {
      round: this.round,
      emojis,
      wordCount: phrase.phrase.split(' ').length,
      category: phrase.category,
      endsAt: this.endsAt,
    });
    this.phaseTimer = this.after(GUESS_MS, () => this.reveal());
  }

  private reveal() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phase = 'reveal';
    this.room.emit('emoji:reveal', {
      phrase: this.phrase?.phrase,
      scoreboard: this.scoreboard(),
      isLast: this.round === this.order.length - 1,
    });
    this.after(REVEAL_MS, () => this.nextRound());
  }

  handleAction(playerKey: string, action: Record<string, unknown>) {
    if (action.type === 'pick' && playerKey === this.presenterKey && this.phase === 'choose') {
      const i = Number(action.option);
      const emojis = String(action.emojis ?? '')
        .replace(/[a-zA-Z0-9]/g, '') // emojis only — no smuggling letters to friends
        .slice(0, 32);
      if (!Number.isInteger(i) || i < 0 || i >= this.options.length || emojis.length === 0) return;
      this.beginGuessing(this.options[i], emojis);
      return;
    }

    if (action.type === 'guess' && this.phase === 'guess') {
      if (playerKey === this.presenterKey || this.guessed.has(playerKey)) return;
      const player = this.room.players.get(playerKey);
      const text = String(action.text ?? '').slice(0, 80);
      if (!player || !text.trim() || !this.phrase) return;

      const correct = normalize(text) === normalize(this.phrase.phrase);
      if (correct) {
        const isFirst = this.guessed.size === 0;
        this.guessed.add(playerKey);
        this.addScore(playerKey, isFirst ? 150 : 75);
        this.addScore(this.presenterKey, 25);
        this.chat.push({ key: playerKey, nickname: player.nickname, text: '✅ guessed it!', correct: true });
      } else {
        this.chat.push({ key: playerKey, nickname: player.nickname, text, correct: false });
      }
      this.room.emit('emoji:chat', { chat: this.chat.slice(-30) });

      const guessers = this.room.players.size - 1;
      if (this.guessed.size >= guessers) this.reveal();
    }
  }

  onRejoin(playerKey: string) {
    const presenter = this.room.players.get(this.presenterKey);
    this.room.emitTo(playerKey, 'emoji:round', {
      round: this.round,
      total: this.order.length,
      presenterKey: this.presenterKey,
      presenterName: presenter?.nickname,
      phase: this.phase,
      endsAt: this.endsAt,
    });
    if (this.phase === 'choose' && playerKey === this.presenterKey) {
      this.room.emitTo(playerKey, 'emoji:options', { options: this.options.map((o) => o.phrase) });
    }
    if (this.phase === 'guess' && this.phrase) {
      this.room.emitTo(playerKey, 'emoji:board', {
        round: this.round,
        emojis: this.emojis,
        wordCount: this.phrase.phrase.split(' ').length,
        category: this.phrase.category,
        endsAt: this.endsAt,
      });
      this.room.emitTo(playerKey, 'emoji:chat', { chat: this.chat.slice(-30) });
    }
  }
}
