import fs from 'fs';
import path from 'path';
import { Engine } from './engine';
import type { LobbyRoom } from '../realtime/room';

type Question = { q: string; choices: string[]; answer: number; category: string };

const QUESTION_MS = 15000;
const REVEAL_MS = 4500;
const QUESTIONS_PER_GAME = 10;

let bank: Question[] | null = null;
function loadBank(): Question[] {
  if (!bank) {
    const file = path.join(process.cwd(), 'data', 'trivia.json');
    bank = JSON.parse(fs.readFileSync(file, 'utf8')) as Question[];
  }
  return bank;
}

/**
 * Trivia Battle — 10 questions, 15s each. Correct answers score 100 plus a
 * speed bonus up to 100. Scoreboard between rounds.
 */
export class TriviaEngine extends Engine {
  private questions: Question[];
  private index = -1;
  private questionStart = 0;
  private answers = new Map<string, { choice: number; at: number }>();
  private phase: 'question' | 'reveal' = 'question';

  constructor(room: LobbyRoom, sessionId: string) {
    super(room, sessionId);
    const pool = [...loadBank()];
    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.questions = pool.slice(0, QUESTIONS_PER_GAME);
  }

  start() {
    this.nextQuestion();
  }

  private nextQuestion() {
    this.index++;
    if (this.index >= this.questions.length) {
      void this.finish();
      return;
    }
    this.phase = 'question';
    this.answers.clear();
    this.questionStart = Date.now();
    this.room.emit('trivia:question', this.questionPayload());
    this.after(QUESTION_MS, () => this.reveal());
  }

  private questionPayload() {
    const q = this.questions[this.index];
    return {
      index: this.index,
      total: this.questions.length,
      category: q.category,
      q: q.q,
      choices: q.choices,
      endsAt: this.questionStart + QUESTION_MS,
    };
  }

  private reveal() {
    this.phase = 'reveal';
    const q = this.questions[this.index];
    const deltas: Record<string, number> = {};
    for (const [key, ans] of this.answers) {
      if (ans.choice === q.answer) {
        const elapsed = Math.max(0, ans.at - this.questionStart);
        const bonus = Math.round(100 * Math.max(0, 1 - elapsed / QUESTION_MS));
        const delta = 100 + bonus;
        this.addScore(key, delta);
        deltas[key] = delta;
      }
    }
    this.room.emit('trivia:reveal', {
      index: this.index,
      correct: q.answer,
      deltas,
      scoreboard: this.scoreboard(),
      isLast: this.index === this.questions.length - 1,
    });
    this.after(REVEAL_MS, () => this.nextQuestion());
  }

  handleAction(playerKey: string, action: Record<string, unknown>) {
    if (action.type !== 'answer' || this.phase !== 'question') return;
    if (this.answers.has(playerKey)) return; // one answer per question
    const choice = Number(action.choice);
    const q = this.questions[this.index];
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return;
    this.answers.set(playerKey, { choice, at: Date.now() });
    this.room.emitTo(playerKey, 'trivia:locked', { index: this.index, choice });
    this.room.emit('trivia:answered-count', { count: this.answers.size });
    // everyone answered — don't make the table wait for the timer
    if (this.answers.size >= this.room.players.size && this.phase === 'question') {
      this.reveal();
    }
  }

  onRejoin(playerKey: string) {
    if (this.phase === 'question') {
      this.room.emitTo(playerKey, 'trivia:question', this.questionPayload());
      const mine = this.answers.get(playerKey);
      if (mine) this.room.emitTo(playerKey, 'trivia:locked', { index: this.index, choice: mine.choice });
    } else {
      this.room.emitTo(playerKey, 'trivia:reveal', {
        index: this.index,
        correct: this.questions[this.index].answer,
        deltas: {},
        scoreboard: this.scoreboard(),
        isLast: this.index === this.questions.length - 1,
      });
    }
  }
}
