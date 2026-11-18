import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Gamepad2, LoaderCircle, Trophy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGame } from '../../contexts/GameContext';
import type { Game } from '../../types/models';
import { errorMessage } from '../../utils/format';
import { Modal } from '../common/Modal';

const GRID = 15;
const ROUND_SECONDS = 30;
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

type Point = { x: number; y: number };

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

const QUIZ: QuizQuestion[] = [
  { question: 'Столиця України?', options: ['Харків', 'Київ', 'Львів', 'Одеса'], correct: 1 },
  { question: 'Яка найдовша річка в Україні?', options: ['Дніпро', 'Дністер', 'Південний Буг', 'Десна'], correct: 0 },
  { question: 'Скільки кольорів у прапорі України?', options: ['Один', 'Два', 'Три', 'Чотири'], correct: 1 },
  { question: 'Який символ української кухні?', options: ['Борщ', 'Піца', 'Суші', 'Гамбургер'], correct: 0 },
  { question: 'У якому році Україна стала незалежною?', options: ['1989', '1991', '1996', '2004'], correct: 1 },
];

function randomFood(snake: Point[]): Point {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const point = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    if (!snake.some((part) => part.x === point.x && part.y === point.y)) return point;
  }
  return { x: 0, y: 0 };
}

function gameTitle(game: Game): string {
  return game.kind === 'snake' ? 'Змійка' : game.kind === 'dice' ? 'Костики' : 'Вікторина';
}

function gameEmoji(game: Game): string {
  return game.kind === 'snake' ? '🐍' : game.kind === 'dice' ? '🎲' : '🧠';
}

function Scoreboard({ game, currentUserId }: { game: Game; currentUserId?: string }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2">
      {game.players.map((player) => {
        const winner = game.winnerId && game.winnerId === player.userId;
        return (
          <div key={player.userId} className={`rounded-2xl border p-3 text-center ${winner ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-950/20' : 'border-ios-separator/10 bg-ios-fill/5'}`}>
            <p className="truncate text-xs font-medium text-ios-secondary">{player.displayName}{player.userId === currentUserId ? ' (ви)' : ''}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{player.score}</p>
            <p className="mt-0.5 text-[10px] text-ios-secondary">{player.submittedAt ? 'рахунок подано' : 'очікуємо'}</p>
            {winner && <p className="mt-1 text-xs font-semibold text-amber-600">🏆 Переможець</p>}
          </div>
        );
      })}
    </div>
  );
}

export function GameModal() {
  const { activeGame: game, closeGame, accept, cancel, submit } = useGame();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [snake, setSnake] = useState<Point[]>([{ x: 7, y: 7 }, { x: 6, y: 7 }, { x: 5, y: 7 }]);
  const [food, setFood] = useState<Point>({ x: 10, y: 10 });
  const [snakeScore, setSnakeScore] = useState(0);
  const [snakeRunning, setSnakeRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const direction = useRef<Point>({ x: 1, y: 0 });
  const submitted = useRef(false);

  const [rolls, setRolls] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);

  const myPlayer = game?.players.find((player) => player.userId === user?.id);
  const finished = game?.status === 'finished' || game?.status === 'cancelled' || game?.status === 'expired';
  const played = Boolean(myPlayer?.submittedAt);

  useEffect(() => {
    submitted.current = false;
    setError('');
    setBusy(false);
    setSnake([{ x: 7, y: 7 }, { x: 6, y: 7 }, { x: 5, y: 7 }]);
    setFood({ x: 10, y: 10 });
    setSnakeScore(0); setTimeLeft(ROUND_SECONDS); setSnakeRunning(false);
    direction.current = { x: 1, y: 0 };
    setRolls([]); setRolling(false); setQuizIndex(0); setQuizAnswers([]);
  }, [game?.id, game?.status]);

  const steer = useCallback((next: Point) => {
    const current = direction.current;
    if (current.x === -next.x && current.y === -next.y) return;
    direction.current = next;
    setSnakeRunning(true);
  }, []);

  const finish = useCallback(async (score: number, details: Record<string, unknown> = {}) => {
    if (!game || submitted.current) return;
    submitted.current = true;
    setBusy(true); setError('');
    try {
      await submit(game.id, score, details);
    } catch (cause) {
      submitted.current = false;
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, [game, submit]);

  // --- Змійка ---
  useEffect(() => {
    if (!game || game.kind !== 'snake' || game.status !== 'active' || !snakeRunning || played || finished) return;
    const timer = window.setInterval(() => {
      setSnake((current) => {
        const head = current[0]!;
        const dir = direction.current;
        const next = { x: head.x + dir.x, y: head.y + dir.y };
        const hitWall = next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID;
        const hitSelf = current.some((part) => part.x === next.x && part.y === next.y);
        if (hitWall || hitSelf) {
          setSnakeRunning(false);
          void finish(snakeScore, { reason: 'collision', length: snakeScore + 3 });
          return current;
        }
        if (next.x === food.x && next.y === food.y) {
          setFood(randomFood(current));
          setSnakeScore((value) => value + 1);
          return [next, ...current];
        }
        return [next, ...current.slice(0, -1)];
      });
    }, 160);
    return () => window.clearInterval(timer);
  }, [game?.id, game?.kind, game?.status, snakeRunning, snakeScore, food, played, finished, finish]);

  useEffect(() => {
    if (!game || game.kind !== 'snake' || game.status !== 'active' || !snakeRunning) return;
    const timer = window.setInterval(() => setTimeLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [game?.id, game?.kind, game?.status, snakeRunning]);

  useEffect(() => {
    if (timeLeft === 0 && snakeRunning && game?.kind === 'snake') {
      setSnakeRunning(false);
      void finish(snakeScore, { reason: 'time', length: snakeScore + 3 });
    }
  }, [timeLeft, snakeRunning, game?.kind, snakeScore, finish]);

  useEffect(() => {
    if (!game || game.kind !== 'snake' || game.status !== 'active' || !snakeRunning) return;
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const next = key === 'arrowup' || key === 'w' ? { x: 0, y: -1 }
        : key === 'arrowdown' || key === 's' ? { x: 0, y: 1 }
          : key === 'arrowleft' || key === 'a' ? { x: -1, y: 0 }
            : key === 'arrowright' || key === 'd' ? { x: 1, y: 0 }
              : null;
      if (!next) return;
      event.preventDefault();
      steer(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game?.id, game?.kind, game?.status, snakeRunning, steer]);

  // --- Костики ---
  useEffect(() => {
    if (!game || game.kind !== 'dice' || game.status !== 'active' || !rolling) return;
    const timer = window.setTimeout(() => {
      const value = 1 + Math.floor(Math.random() * 6);
      setRolls((current) => {
        const next = [...current, value];
        if (next.length === 5) void finish(next.reduce((sum, item) => sum + item, 0), { rolls: next });
        return next;
      });
      setRolling(false);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [rolling, game?.id, game?.kind, game?.status, finish]);

  // --- Вікторина ---
  function answerQuiz(index: number) {
    if (!game || quizIndex >= QUIZ.length) return;
    const nextAnswers = [...quizAnswers, index];
    setQuizAnswers(nextAnswers);
    if (quizIndex + 1 >= QUIZ.length) {
      void finish(nextAnswers.reduce((sum, answer, position) => sum + (QUIZ[position]!.correct === answer ? 1 : 0), 0), { answers: nextAnswers });
    } else {
      setQuizIndex(quizIndex + 1);
    }
  }

  async function runAction(action: 'accept' | 'cancel') {
    if (!game) return;
    setBusy(true); setError('');
    try {
      const next = action === 'accept' ? await accept(game.id) : await cancel(game.id);
      if (action === 'accept') {
        setSnakeRunning(next.kind === 'snake');
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!game) return null;

  const isCreator = game.creatorId === user?.id;
  const info = game.kind === 'snake' ? 'Збери якомога більше яблук за 30 секунд. Керуй стрілками або кнопками.'
    : game.kind === 'dice' ? 'Кинь кості п\'ять разів. Перемагає найбільша сума.'
      : 'Відповідай на п\'ять запитань. Один бал за правильну відповідь.';

  return (
    <Modal open onClose={closeGame} title={`${gameEmoji(game)} ${gameTitle(game)}`} description={info} wide>
      <Scoreboard game={game} currentUserId={user?.id} />
      {error && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}

      {game.status === 'inviting' && (
        <div className="rounded-2xl bg-ios-fill/5 p-5 text-center">
          <Gamepad2 size={32} className="mx-auto mb-2 text-ios-blue" />
          <p className="text-sm font-medium">{isCreator ? 'Запрошення надіслано. Очікуємо суперника…' : 'Вас запросили на змагання!'}</p>
          <div className="mt-4 flex justify-center gap-2">
            {!isCreator && <button type="button" disabled={busy} onClick={() => void runAction('accept')} className="primary-btn">Прийняти</button>}
            {isCreator && <button type="button" disabled={busy} onClick={() => void runAction('cancel')} className="secondary-btn">Скасувати</button>}
            <button type="button" onClick={closeGame} className="secondary-btn">Закрити</button>
          </div>
        </div>
      )}

      {game.status === 'active' && played && (
        <div className="rounded-2xl bg-ios-fill/5 p-6 text-center text-sm text-ios-secondary">
          <LoaderCircle size={26} className="mx-auto mb-2 animate-spin text-ios-blue" />
          Рахунок подано. Очікуємо суперника…
        </div>
      )}

      {game.status === 'active' && !played && game.kind === 'snake' && (
        <div>
          <div className="mb-2 flex items-center justify-between text-sm font-medium">
            <span>Яблука: <b>{snakeScore}</b></span>
            <span>Час: <b className={timeLeft <= 5 ? 'text-rose-500' : ''}>{timeLeft} c</b></span>
          </div>
          <div className="mx-auto grid w-full max-w-md gap-px overflow-hidden rounded-2xl bg-slate-200 p-1 dark:bg-slate-700" style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))` }}>
            {Array.from({ length: GRID * GRID }, (_, index) => {
              const x = index % GRID; const y = Math.floor(index / GRID);
              const isHead = snake[0]?.x === x && snake[0]?.y === y;
              const isBody = snake.some((part, position) => position > 0 && part.x === x && part.y === y);
              const isFood = food.x === x && food.y === y;
              return (
                <div key={index} className={`aspect-square rounded-[3px] ${isHead ? 'bg-ios-blue' : isBody ? 'bg-emerald-400' : isFood ? 'bg-rose-500' : 'bg-white dark:bg-slate-900'}`} />
              );
            })}
          </div>
          <div className="mx-auto mt-3 grid w-36 grid-cols-3 gap-1">
            <span />
            <button type="button" aria-label="Вгору" onClick={() => steer({ x: 0, y: -1 })} className="secondary-btn justify-center p-2"><ArrowUp size={18} /></button>
            <span />
            <button type="button" aria-label="Ліворуч" onClick={() => steer({ x: -1, y: 0 })} className="secondary-btn justify-center p-2"><ArrowLeft size={18} /></button>
            <button type="button" aria-label="Вниз" onClick={() => steer({ x: 0, y: 1 })} className="secondary-btn justify-center p-2"><ArrowDown size={18} /></button>
            <button type="button" aria-label="Праворуч" onClick={() => steer({ x: 1, y: 0 })} className="secondary-btn justify-center p-2"><ArrowRight size={18} /></button>
          </div>
          <p className="mt-3 text-center text-xs text-ios-secondary">Таймер запускається першим натисканням напрямку.</p>
        </div>
      )}

      {game.status === 'active' && !played && game.kind === 'dice' && (
        <div className="text-center">
          <div className="my-4 flex flex-wrap justify-center gap-2">
            {rolls.map((value, index) => <span key={index} className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-3xl shadow-sm dark:bg-slate-700">{DICE_FACES[value - 1]}</span>)}
            {Array.from({ length: 5 - rolls.length }, (_, index) => <span key={`empty-${index}`} className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-ios-separator/20 text-2xl text-ios-secondary">·</span>)}
          </div>
          <p className="mb-3 text-sm text-ios-secondary">Сума: <b>{rolls.reduce((sum, value) => sum + value, 0)}</b> з 5 кидків</p>
          <button type="button" disabled={rolling || rolls.length >= 5 || busy} onClick={() => setRolling(true)} className="primary-btn">
            {rolling ? 'Кидаємо…' : `Кинути кості (${5 - rolls.length})`}
          </button>
        </div>
      )}

      {game.status === 'active' && !played && game.kind === 'quiz' && (
        <div>
          <p className="mb-2 text-xs text-ios-secondary">Запитання {quizIndex + 1} з {QUIZ.length}</p>
          <p className="mb-4 text-base font-semibold">{QUIZ[quizIndex]?.question}</p>
          <div className="space-y-2">
            {QUIZ[quizIndex]?.options.map((option, index) => (
              <button key={option} type="button" onClick={() => answerQuiz(index)} className="w-full rounded-2xl bg-ios-fill/10 px-4 py-3 text-left text-sm font-medium transition hover:bg-ios-blue/10">
                {String.fromCharCode(65 + index)}. {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {finished && (
        <div className="rounded-2xl bg-ios-fill/5 p-5 text-center">
          <Trophy size={30} className="mx-auto mb-2 text-amber-500" />
          <p className="font-semibold">
            {game.status === 'finished'
              ? game.winnerId ? `${game.players.find((player) => player.userId === game.winnerId)?.displayName || 'Гравець'} перемагає!` : 'Нічия!'
              : game.status === 'cancelled' ? 'Гру скасовано' : 'Час гри минув'}
          </p>
          <button type="button" onClick={closeGame} className="secondary-btn mx-auto mt-4">Закрити</button>
        </div>
      )}
    </Modal>
  );
}
