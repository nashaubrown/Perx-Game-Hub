'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

export type LobbyState = {
  code: string;
  gameId: string;
  status: 'OPEN' | 'IN_GAME' | 'FINISHED' | 'CLOSED';
  venueId: string | null;
  hostKey: string;
  players: { key: string; nickname: string; connected: boolean; isHost: boolean }[];
};

/**
 * One socket per lobby screen. Socket.IO's built-in reconnection plus a
 * rejoin-on-reconnect handler covers locked phones and flaky cafe Wi-Fi —
 * the server keeps your seat and replays current game state on rejoin.
 */
export function useLobby(code: string, nickname?: string) {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<LobbyState | null>(null);
  const [you, setYou] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const handlers = useRef(new Map<string, (payload: any) => void>());

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || '', {
      withCredentials: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;

    const join = () => {
      socket.emit('lobby:join', { code, nickname }, (res: any) => {
        if (res?.error) {
          setError(res.error);
        } else {
          setError(null);
          setState(res.state);
          setYou(res.you);
        }
      });
    };

    socket.on('connect', () => {
      setConnected(true);
      join(); // also fires on every reconnect — reclaims the seat
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('lobby:state', (s: LobbyState) => setState(s));
    socket.onAny((event: string, payload: any) => {
      handlers.current.get(event)?.(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, nickname]);

  const on = useCallback((event: string, handler: (payload: any) => void) => {
    handlers.current.set(event, handler);
  }, []);

  const send = useCallback((action: Record<string, unknown>) => {
    socketRef.current?.emit('game:action', action);
  }, []);

  const start = useCallback((cb?: (res: any) => void) => {
    socketRef.current?.emit('lobby:start', {}, cb);
  }, []);

  const leave = useCallback(() => {
    socketRef.current?.emit('lobby:leave');
  }, []);

  return { state, you, error, connected, on, send, start, leave };
}
