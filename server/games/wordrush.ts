import fs from 'fs';
import wordListPath from 'word-list';
import { Engine } from './engine';
import type { LobbyRoom } from '../realtime/room';

const GAME_MS = 90000;
const SIZE = 5;

let dictionary: Set<string> | null = null;
function loadDictionary(): Set<string> {
  if (!dictionary) {
    // word-list ships a newline-separated english word file
    const words = fs.readFileSync(wordListPath, 'utf8').split('\n');
    dictionary = new Set(words.filter((w) => w.length >= 3 && w.length <= SIZE * SIZE));
  }
  return dictionary;
}

// English letter distribution, tuned slightly toward vowels for a 5x5 grid
const LETTER_BAG =
  'aaaaaaaaabbccddddeeeeeeeeeeeeffggghhiiiiiiiiijkllllmmnnnnnnooooooooppqrrrrrrssssssttttttuuuuvvwwxyyz';

function scoreWord(len: number): number {
  if (len <= 4) return 50 * (len - 2); // 3→50, 4→100
  if (len === 5) return 200;
  if (len === 6) return 300;
  return 450; // 7+
}

/**
 * Word Rush — one shared 5x5 letter grid, 90 seconds, everyone hunts words
 * simultaneously (Boggle adjacency). Words nobody else found score double.
 */
export class WordRushEngine extends Engine {
  private grid: string[][];
  private found = new Map<string, Set<string>>(); // playerKey -> words
  private endsAt = 0;
  private running = false;

  constructor(room: LobbyRoom, sessionId: string) {
    super(room, sessionId);
    this.grid = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => LETTER_BAG[Math.floor(Math.random() * LETTER_BAG.length)])
    );
    for (const key of room.players.keys()) this.found.set(key, new Set());
  }

  start() {
    loadDictionary();
    this.running = true;
    this.endsAt = Date.now() + GAME_MS;
    this.room.emit('wordrush:start', this.statePayload());
    this.after(GAME_MS, () => this.end());
  }

  private statePayload() {
    return { grid: this.grid, endsAt: this.endsAt };
  }

  /** Boggle rule: the word must be a path of adjacent cells, each used once. */
  private inGrid(word: string): boolean {
    const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    const dfs = (r: number, c: number, i: number): boolean => {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
      if (visited[r][c] || this.grid[r][c] !== word[i]) return false;
      if (i === word.length - 1) return true;
      visited[r][c] = true;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if ((dr || dc) && dfs(r + dr, c + dc, i + 1)) {
            visited[r][c] = false;
            return true;
          }
        }
      visited[r][c] = false;
      return false;
    };
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) if (dfs(r, c, 0)) return true;
    return false;
  }

  handleAction(playerKey: string, action: Record<string, unknown>) {
    if (action.type !== 'word' || !this.running || Date.now() > this.endsAt) return;
    const word = String(action.word ?? '').toLowerCase().replace(/[^a-z]/g, '');
    const mine = this.found.get(playerKey);
    if (!mine) return;

    let ok = false;
    let reason = '';
    if (word.length < 3) reason = 'Too short';
    else if (mine.has(word)) reason = 'Already found';
    else if (!this.inGrid(word)) reason = 'Not in the grid';
    else if (!loadDictionary().has(word)) reason = 'Not a word';
    else {
      ok = true;
      mine.add(word);
    }

    this.room.emitTo(playerKey, 'wordrush:result', {
      word,
      ok,
      reason,
      count: mine.size,
    });
    if (ok) {
      this.room.emit('wordrush:counts', {
        counts: Object.fromEntries([...this.found.entries()].map(([k, s]) => [k, s.size])),
      });
    }
  }

  private end() {
    this.running = false;
    // count how many players found each word — unique finds score double
    const freq = new Map<string, number>();
    for (const words of this.found.values())
      for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);

    const breakdown: Record<string, { word: string; points: number; unique: boolean }[]> = {};
    for (const [key, words] of this.found) {
      const rows = [...words]
        .map((w) => {
          const unique = freq.get(w) === 1;
          const points = scoreWord(w.length) * (unique ? 2 : 1);
          return { word: w, points, unique };
        })
        .sort((a, b) => b.points - a.points);
      breakdown[key] = rows;
      this.addScore(key, rows.reduce((sum, r) => sum + r.points, 0));
    }
    void this.finish({ breakdown });
  }

  onRejoin(playerKey: string) {
    if (!this.running) return;
    this.room.emitTo(playerKey, 'wordrush:start', this.statePayload());
    const mine = this.found.get(playerKey);
    if (mine) this.room.emitTo(playerKey, 'wordrush:mine', { words: [...mine] });
  }
}
