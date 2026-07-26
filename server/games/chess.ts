import { Chess } from 'chess.js';
import { Engine } from './engine';
import type { LobbyRoom } from '../realtime/room';

/**
 * Chess — 2 players, no clock (cafe pace). chess.js is the referee: every
 * move is validated server-side, including castling, en passant, promotion,
 * checkmate, stalemate, and draw rules. A player disconnected on their turn
 * for 2 minutes forfeits. Win 100 / loss 0 / draw 50-50 (marked as a draw,
 * so nobody collects the win bonus).
 */
export class ChessEngine extends Engine {
  private chess = new Chess();
  private whiteKey: string;
  private blackKey: string;

  constructor(room: LobbyRoom, sessionId: string) {
    super(room, sessionId);
    const keys = [...room.players.keys()];
    // random colors
    if (Math.random() < 0.5) keys.reverse();
    this.whiteKey = keys[0];
    this.blackKey = keys[1];
  }

  private get turnKey() {
    return this.chess.turn() === 'w' ? this.whiteKey : this.blackKey;
  }

  private statePayload() {
    const history = this.chess.history({ verbose: true });
    const last = history[history.length - 1];
    return {
      fen: this.chess.fen(),
      turnKey: this.turnKey,
      whiteKey: this.whiteKey,
      blackKey: this.blackKey,
      inCheck: this.chess.inCheck(),
      lastMove: last ? { from: last.from, to: last.to } : null,
      moveCount: history.length,
      // chess is open information — legal moves for the side to move
      moves: this.chess.moves({ verbose: true }).map((m) => ({
        from: m.from,
        to: m.to,
        promotion: m.promotion,
      })),
    };
  }

  start() {
    this.room.emit('chess:state', this.statePayload());
    this.armTurnGuard(this.turnKey, () => this.forfeit(this.turnKey, 'left the game'));
  }

  handleAction(playerKey: string, action: Record<string, unknown>) {
    if (action.type === 'resign') {
      if (playerKey === this.whiteKey || playerKey === this.blackKey) {
        this.forfeit(playerKey, 'resigned');
      }
      return;
    }
    if (action.type !== 'move' || playerKey !== this.turnKey) return;

    try {
      this.chess.move({
        from: String(action.from ?? ''),
        to: String(action.to ?? ''),
        promotion: action.promotion ? String(action.promotion) : 'q',
      });
    } catch {
      return; // illegal move — ignore, client highlights only legal ones anyway
    }

    this.room.emit('chess:state', this.statePayload());

    if (this.chess.isGameOver()) {
      if (this.chess.isCheckmate()) {
        // side to move is checkmated; the player who just moved wins
        const winner = this.chess.turn() === 'w' ? this.blackKey : this.whiteKey;
        this.addScore(winner, 100);
        void this.finish({ reason: 'Checkmate', winnerKey: winner });
      } else {
        const reason = this.chess.isStalemate()
          ? 'Stalemate'
          : this.chess.isThreefoldRepetition()
            ? 'Draw by repetition'
            : this.chess.isInsufficientMaterial()
              ? 'Insufficient material'
              : 'Draw';
        this.addScore(this.whiteKey, 50);
        this.addScore(this.blackKey, 50);
        void this.finish({ reason, draw: true });
      }
      return;
    }

    this.armTurnGuard(this.turnKey, () => this.forfeit(this.turnKey, 'left the game'));
  }

  private forfeit(loserKey: string, why: string) {
    const winner = loserKey === this.whiteKey ? this.blackKey : this.whiteKey;
    this.addScore(winner, 100);
    const loser = this.room.players.get(loserKey);
    void this.finish({ reason: `${loser?.nickname ?? 'Opponent'} ${why}`, winnerKey: winner });
  }

  onRejoin(playerKey: string) {
    this.room.emitTo(playerKey, 'chess:state', this.statePayload());
  }
}
