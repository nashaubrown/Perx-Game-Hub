import type { Server, Socket } from 'socket.io';
import { db } from '../../src/lib/db';
import { AUTH_COOKIE, GUEST_COOKIE, parseCookies, verifyToken } from '../../src/lib/jwt';
import { emitVenueEvent } from '../../src/lib/webhooks';
import { normalizeJoinCode } from '../../src/lib/join-code';
import { getRoom, dropRoom, type LobbyRoom, type RoomPlayer } from './room';
import { Engine } from '../games/engine';
import { TriviaEngine } from '../games/trivia';
import { WordRushEngine } from '../games/wordrush';
import { EmojiGuessEngine } from '../games/emoji';
import { ChessEngine } from '../games/chess';
import { RummyEngine } from '../games/rummy';
import { LudoEngine } from '../games/ludo';
import { TwentyOneEngine } from '../games/twentyone';
import { TruthDareEngine } from '../games/truthdare';

const ENGINES: Record<string, new (room: LobbyRoom, sessionId: string) => Engine> = {
  trivia: TriviaEngine,
  wordrush: WordRushEngine,
  emoji: EmojiGuessEngine,
  chess: ChessEngine,
  rummy: RummyEngine,
  ludo: LudoEngine,
  '21q': TwentyOneEngine,
  truthdare: TruthDareEngine,
};

type SocketCtx = {
  userId?: string;
  handle?: string;
  guestId?: string;
  playerKey?: string;
  roomCode?: string;
};

export function attachRealtime(io: Server) {
  // Identify the connection from the same httpOnly cookies the app uses.
  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const ctx: SocketCtx = {};
    const token = cookies[AUTH_COOKIE];
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        ctx.userId = payload.sub;
        ctx.handle = payload.handle;
      }
    }
    if (cookies[GUEST_COOKIE]) ctx.guestId = cookies[GUEST_COOKIE];
    (socket.data as SocketCtx & Record<string, unknown>).ctx = ctx;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const ctx = (socket.data as { ctx: SocketCtx }).ctx;

    socket.on('lobby:join', async (payload: { code?: string; nickname?: string }, cb?: (res: unknown) => void) => {
      try {
        const code = normalizeJoinCode(String(payload?.code ?? ''));
        const room = await getRoom(io, code);
        if (!room) return cb?.({ error: 'No lobby with that code. Check it and try again.' });

        let key: string;
        let userId: string | undefined;
        let guestId: string | undefined;
        let nickname = String(payload?.nickname ?? '').trim().slice(0, 20);

        if (ctx.userId) {
          key = `user:${ctx.userId}`;
          userId = ctx.userId;
          nickname = nickname || `@${ctx.handle}`;
        } else {
          // guests need a guest session (created at /join) and a nickname
          if (!ctx.guestId) return cb?.({ error: 'guest_session_required' });
          const guest = await db.guestSession.findUnique({ where: { id: ctx.guestId } });
          if (!guest) return cb?.({ error: 'guest_session_required' });
          key = `guest:${ctx.guestId}`;
          guestId = ctx.guestId;
          nickname = nickname || guest.nickname;
        }

        const existing = room.players.get(key);
        if (!existing) {
          if (room.status === 'IN_GAME')
            return cb?.({ error: 'That table is mid-game. Ask them to wait for the next round!' });
          if (room.players.size >= room.maxPlayers)
            return cb?.({ error: `Lobby is full (${room.maxPlayers} players max for this game).` });

          // make the nickname unique within the lobby
          const names = new Set([...room.players.values()].map((p) => p.nickname.toLowerCase()));
          let finalName = nickname || 'player';
          let n = 2;
          while (names.has(finalName.toLowerCase())) finalName = `${nickname}${n++}`;

          const lobbyPlayer = await db.lobbyPlayer.create({
            data: { lobbyId: room.lobbyId, userId, guestId, nickname: finalName },
          });
          room.players.set(key, {
            key,
            userId,
            guestId,
            nickname: finalName,
            lobbyPlayerId: lobbyPlayer.id,
            connected: true,
            sockets: new Set([socket.id]),
          });
          emitVenueEvent(room.venueId, 'player_joined', {
            lobbyCode: room.code,
            nickname: finalName,
            isGuest: !userId,
          });
        } else {
          // reclaiming a seat (screen lock / flaky Wi-Fi / new tab)
          existing.connected = true;
          existing.sockets.add(socket.id);
        }

        ctx.playerKey = key;
        ctx.roomCode = code;
        socket.join(code);
        room.broadcastState();

        cb?.({ ok: true, state: room.publicState(), you: key });
        if (room.status === 'IN_GAME' && room.engine) room.engine.onRejoin(key);
      } catch (err) {
        console.error('[lobby:join]', err);
        cb?.({ error: 'Something broke joining the lobby. Try again.' });
      }
    });

    socket.on('lobby:start', async (_payload: unknown, cb?: (res: unknown) => void) => {
      try {
        const room = ctx.roomCode ? await getRoom(io, ctx.roomCode) : null;
        if (!room || !ctx.playerKey) return cb?.({ error: 'Join a lobby first.' });
        if (ctx.userId !== room.hostUserId) return cb?.({ error: 'Only the host can start the game.' });
        if (room.status === 'IN_GAME') return cb?.({ error: 'Game already running.' });

        const game = await db.game.findUnique({ where: { id: room.gameId } });
        const EngineClass = ENGINES[room.gameId];
        if (!game || !EngineClass) return cb?.({ error: 'Unknown game.' });
        if (room.players.size < game.minPlayers)
          return cb?.({ error: `Needs at least ${game.minPlayers} players.` });

        const session = await db.gameSession.create({
          data: { gameId: room.gameId, lobbyId: room.lobbyId, venueId: room.venueId },
        });
        await room.setStatus('IN_GAME');
        room.engine = new EngineClass(room, session.id);
        room.broadcastState();
        room.emit('game:starting', { gameId: room.gameId, sessionId: session.id });

        emitVenueEvent(room.venueId, 'game_started', {
          lobbyCode: room.code,
          gameId: room.gameId,
          sessionId: session.id,
          playerCount: room.players.size,
        });

        room.engine.start();
        cb?.({ ok: true });
      } catch (err) {
        console.error('[lobby:start]', err);
        cb?.({ error: 'Could not start the game. Try again.' });
      }
    });

    socket.on('game:action', async (action: Record<string, unknown>) => {
      const room = ctx.roomCode ? await getRoom(io, ctx.roomCode) : null;
      if (room?.engine && ctx.playerKey) {
        room.engine.handleAction(ctx.playerKey, action ?? {});
      }
    });

    socket.on('lobby:leave', async () => {
      await removeFromRoom(io, ctx, socket, true);
    });

    socket.on('disconnect', async () => {
      await removeFromRoom(io, ctx, socket, false);
    });
  });
}

async function removeFromRoom(io: Server, ctx: SocketCtx, socket: Socket, explicit: boolean) {
  if (!ctx.roomCode || !ctx.playerKey) return;
  const room = await getRoom(io, ctx.roomCode);
  if (!room) return;
  const player = room.players.get(ctx.playerKey) as RoomPlayer | undefined;
  if (!player) return;

  player.sockets.delete(socket.id);
  if (player.sockets.size === 0) {
    player.connected = false;
    if (explicit && room.status === 'OPEN') {
      // leaving an open lobby on purpose removes the seat entirely
      room.players.delete(ctx.playerKey);
      await db.lobbyPlayer.delete({ where: { id: player.lobbyPlayerId } }).catch(() => {});
    }
    // mid-game we keep the seat — they can rejoin with the same code
  }
  room.broadcastState();

  if (explicit) {
    ctx.roomCode = undefined;
    ctx.playerKey = undefined;
    socket.leave(room.code);
  }

  // fold up empty idle lobbies
  if (room.connectedCount === 0 && room.status === 'OPEN' && room.players.size === 0) {
    await db.lobby.update({ where: { id: room.lobbyId }, data: { status: 'CLOSED' } }).catch(() => {});
    dropRoom(room.code);
  }
}
