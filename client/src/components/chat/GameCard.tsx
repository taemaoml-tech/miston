import { Gamepad2, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import type { Game, Message } from '../../types/models';
import { errorMessage } from '../../utils/format';

const STATUS_LABELS: Record<Game['status'], string> = {
  inviting: 'Очікує на суперника',
  active: 'Гра триває',
  finished: 'Гру завершено',
  cancelled: 'Гру скасовано',
  expired: 'Час минув',
};

const TITLES: Record<Game['kind'], { emoji: string; title: string }> = {
  snake: { emoji: '🐍', title: 'Змійка' },
  dice: { emoji: '🎲', title: 'Костики' },
  quiz: { emoji: '🧠', title: 'Вікторина' },
};

export function GameCard({ message }: { message: Message }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { openGame, accept } = useGame();
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!message.gameId) return;
    let active = true;
    void api.games.get(message.gameId).then(({ game: next }) => { if (active) setGame(next); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [message.gameId]);

  useEffect(() => {
    if (!socket || !message.gameId) return;
    const onUpdate = (payload: { game?: Game }) => {
      const next = payload.game;
      if (next && next.id === message.gameId) setGame(next);
    };
    socket.on('game:updated', onUpdate);
    return () => { socket.off('game:updated', onUpdate); };
  }, [socket, message.gameId]);

  if (!game) {
    return <div className="my-1 flex items-center gap-2 rounded-2xl bg-ios-fill/5 px-3 py-2 text-xs text-ios-secondary"><LoaderCircle size={14} className="animate-spin" /> Завантаження гри…</div>;
  }

  const info = TITLES[game.kind];
  const isOpponent = game.opponentId === user?.id && game.creatorId !== user?.id;
  const result = game.status === 'finished'
    ? game.players.map((player) => `${player.displayName}: ${player.score}`).join(' · ')
    : '';

  async function onAccept() {
    setBusy(true); setError('');
    try {
      const next = await accept(game!.id);
      setGame(next);
      openGame(next.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="my-1 w-64 max-w-full rounded-2xl border border-ios-separator/10 bg-ios-fill/5 p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ios-blue/10 text-lg">{info.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{info.title}</p>
          <p className="text-[11px] text-ios-secondary">{STATUS_LABELS[game.status]}</p>
        </div>
        <Gamepad2 size={16} className="shrink-0 text-ios-secondary" />
      </div>
      {result && <p className="mt-2 text-xs text-ios-secondary">{result}</p>}
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
      <div className="mt-3 flex gap-2">
        {isOpponent && game.status === 'inviting' && (
          <button type="button" disabled={busy} onClick={() => void onAccept()} className="primary-btn flex-1 px-3 py-1.5 text-xs">Прийняти</button>
        )}
        {game.status === 'active' || game.status === 'finished' ? (
          <button type="button" onClick={() => openGame(game.id)} className="secondary-btn flex-1 px-3 py-1.5 text-xs">Відкрити гру</button>
        ) : null}
      </div>
    </div>
  );
}
