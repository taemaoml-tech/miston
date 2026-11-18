import { Gamepad2 } from 'lucide-react';
import { useGame } from '../../contexts/GameContext';
import type { Game } from '../../types/models';
import { formatTime } from '../../utils/format';
import { Modal } from '../common/Modal';

const TITLES: Record<Game['kind'], { emoji: string; title: string; command: string }> = {
  snake: { emoji: '🐍', title: 'Змійка', command: '/game_snake' },
  dice: { emoji: '🎲', title: 'Костики', command: '/game_dice' },
  quiz: { emoji: '🧠', title: 'Вікторина', command: '/game_quiz' },
};

const STATUS_LABELS: Record<Game['status'], string> = {
  inviting: 'Запрошення',
  active: 'Триває',
  finished: 'Завершено',
  cancelled: 'Скасовано',
  expired: 'Минув час',
};

export function GameHistoryModal() {
  const { history, historyOpen, setHistoryOpen, loadingHistory, openGame } = useGame();
  return (
    <Modal
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      title="Історія ігор"
      description="Команди: /game_snake, /game_dice, /game_quiz"
      wide
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.values(TITLES).map((entry) => (
          <span key={entry.command} className="rounded-full bg-ios-fill/10 px-3 py-1 text-xs font-medium">{entry.emoji} {entry.command} — {entry.title}</span>
        ))}
      </div>
      {loadingHistory ? (
        <p className="py-6 text-center text-sm text-ios-secondary">Завантаження…</p>
      ) : history.length === 0 ? (
        <div className="py-8 text-center text-sm text-ios-secondary"><Gamepad2 size={28} className="mx-auto mb-2" />Ігор ще не було. Напишіть /game_snake у чат, щоб запросити суперника.</div>
      ) : (
        <div className="space-y-2">
          {history.map((game) => {
            const info = TITLES[game.kind];
            return (
              <button key={game.id} type="button" onClick={() => { setHistoryOpen(false); openGame(game.id); }} className="flex w-full items-center gap-3 rounded-2xl bg-ios-fill/5 p-3 text-left transition hover:bg-ios-fill/10">
                <span className="text-xl">{info.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{info.title} · {STATUS_LABELS[game.status]}</span>
                  <span className="block truncate text-xs text-ios-secondary">
                    {game.players.map((player) => `${player.displayName} ${player.score}`).join(' · ') || '—'} · {formatTime(game.createdAt)}
                  </span>
                </span>
                {game.winnerId && <span className="text-sm">🏆</span>}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
