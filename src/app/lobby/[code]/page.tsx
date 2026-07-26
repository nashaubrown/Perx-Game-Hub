'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLobby } from '@/hooks/useLobby';
import { useMe } from '@/hooks/useMe';
import { WaitingRoom } from '@/components/game/WaitingRoom';
import { TriviaView } from '@/components/game/TriviaView';
import { WordRushView } from '@/components/game/WordRushView';
import { EmojiView } from '@/components/game/EmojiView';
import { ChessView } from '@/components/game/ChessView';
import { RummyView } from '@/components/game/RummyView';
import { LudoView } from '@/components/game/LudoView';
import { TwentyOneView } from '@/components/game/TwentyOneView';
import { TruthDareView } from '@/components/game/TruthDareView';
import { FinalView, type FinalPayload } from '@/components/game/FinalView';

const GAME_VIEWS: Record<string, React.ComponentType<{ lobby: any }>> = {
  trivia: TriviaView,
  wordrush: WordRushView,
  emoji: EmojiView,
  chess: ChessView,
  rummy: RummyView,
  ludo: LudoView,
  '21q': TwentyOneView,
  truthdare: TruthDareView,
};

export default function LobbyPage() {
  const { code } = useParams<{ code: string }>();
  const me = useMe();
  const lobby = useLobby(code.toUpperCase());
  const [final, setFinal] = useState<FinalPayload | null>(null);
  const [playing, setPlaying] = useState(false);

  const { on } = lobby;
  useEffect(() => {
    on('game:starting', () => {
      setFinal(null);
      setPlaying(true);
    });
    on('game:final', (payload: FinalPayload) => {
      setPlaying(false);
      setFinal(payload);
    });
  }, [on]);

  if (lobby.error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-4xl">🤔</p>
        <p className="font-bold">{lobby.error}</p>
        <Link href="/join" className="btn-ghost max-w-48">
          Try another code
        </Link>
      </main>
    );
  }

  if (!lobby.state) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse text-ink-400">Connecting to the table…</p>
      </main>
    );
  }

  const inGame = lobby.state.status === 'IN_GAME' || playing;

  return (
    <main className="min-h-dvh px-4 pb-8">
      {!lobby.connected && (
        <div className="fixed inset-x-0 top-0 z-50 bg-warning py-1 text-center text-xs font-bold text-ink-950">
          Reconnecting… your seat is safe
        </div>
      )}

      {final ? (
        <FinalView payload={final} lobby={lobby} isGuest={me === null} />
      ) : inGame ? (
        (() => {
          const View = GAME_VIEWS[lobby.state.gameId] ?? TriviaView;
          return <View lobby={lobby} />;
        })()
      ) : (
        <WaitingRoom lobby={lobby} />
      )}
    </main>
  );
}
