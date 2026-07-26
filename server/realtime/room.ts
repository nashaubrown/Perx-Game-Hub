import type { Server } from 'socket.io';
import { db } from '../../src/lib/db';
import type { Engine } from '../games/engine';

export type PlayerIdentity = {
  key: string; // "user:<id>" | "guest:<id>"
  userId?: string;
  guestId?: string;
  nickname: string;
};

export type RoomPlayer = PlayerIdentity & {
  lobbyPlayerId: string;
  connected: boolean;
  sockets: Set<string>;
  // true when the player's connection came from the venue's registered Wi-Fi
  // IP — fast-tracks merchant-card point confirmation (presence proof)
  presentByIp?: boolean;
};

/**
 * In-memory live state for one lobby. The DB is the source of truth for the
 * lobby's existence and roster; the room holds ephemeral connection state and
 * the running game engine. Phones locking in cafes is normal — a player who
 * disconnects stays in the roster and reclaims their seat by rejoining with
 * the same code (same account or guest cookie).
 */
export class LobbyRoom {
  code: string;
  lobbyId: string;
  gameId: string;
  maxPlayers = 8;
  hostUserId: string;
  venueId: string | null;
  venuePublicIp: string | null = null;
  status: 'OPEN' | 'IN_GAME' | 'FINISHED' | 'CLOSED' = 'OPEN';
  players = new Map<string, RoomPlayer>();
  engine: Engine | null = null;
  io: Server;

  constructor(io: Server, lobby: { id: string; code: string; gameId: string; hostUserId: string; venueId: string | null; status: string }) {
    this.io = io;
    this.code = lobby.code;
    this.lobbyId = lobby.id;
    this.gameId = lobby.gameId;
    this.hostUserId = lobby.hostUserId;
    this.venueId = lobby.venueId;
    this.status = lobby.status as LobbyRoom['status'];
  }

  get connectedCount() {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  emit(event: string, payload: unknown) {
    this.io.to(this.code).emit(event, payload);
  }

  emitTo(playerKey: string, event: string, payload: unknown) {
    const player = this.players.get(playerKey);
    if (!player) return;
    for (const sid of player.sockets) this.io.to(sid).emit(event, payload);
  }

  publicState() {
    return {
      code: this.code,
      gameId: this.gameId,
      status: this.status,
      hostKey: `user:${this.hostUserId}`,
      players: [...this.players.values()].map((p) => ({
        key: p.key,
        nickname: p.nickname,
        connected: p.connected,
        isHost: p.userId === this.hostUserId,
      })),
    };
  }

  broadcastState() {
    this.emit('lobby:state', this.publicState());
  }

  async setStatus(status: LobbyRoom['status']) {
    this.status = status;
    await db.lobby.update({ where: { id: this.lobbyId }, data: { status } });
  }
}

const rooms = new Map<string, LobbyRoom>();

export async function getRoom(io: Server, code: string): Promise<LobbyRoom | null> {
  const existing = rooms.get(code);
  if (existing) return existing;

  const lobby = await db.lobby.findUnique({
    where: { code },
    include: {
      players: true,
      game: { select: { maxPlayers: true } },
      venue: { select: { publicIp: true } },
    },
  });
  if (!lobby || lobby.status === 'CLOSED') return null;

  const room = new LobbyRoom(io, lobby);
  room.maxPlayers = lobby.game.maxPlayers;
  room.venuePublicIp = lobby.venue?.publicIp ?? null;
  // Rehydrate roster after a server restart — everyone shows disconnected
  // until they rejoin with the same code.
  for (const p of lobby.players) {
    const key = p.userId ? `user:${p.userId}` : `guest:${p.guestId}`;
    room.players.set(key, {
      key,
      userId: p.userId ?? undefined,
      guestId: p.guestId ?? undefined,
      nickname: p.nickname,
      lobbyPlayerId: p.id,
      connected: false,
      sockets: new Set(),
    });
  }
  rooms.set(code, room);
  return room;
}

export function dropRoom(code: string) {
  rooms.delete(code);
}
