import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import type { Game } from '../types/models';

interface GameContextValue {
  activeGame: Game | null;
  history: Game[];
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  loadingHistory: boolean;
  openGame: (id: string) => void;
  closeGame: () => void;
  openHistory: (conversationId?: string) => void;
  accept: (id: string) => Promise<Game>;
  cancel: (id: string) => Promise<Game>;
  submit: (id: string, score: number, details?: Record<string, unknown>) => Promise<Game>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [history, setHistory] = useState<Game[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const upsert = useCallback((game: Game) => {
    setActiveGame((current) => current?.id === game.id ? game : current);
    setHistory((current) => current.map((item) => item.id === game.id ? game : item));
  }, []);

  useEffect(() => {
    if (!socket || !user) return;
    const onInvite = (payload: { game?: Game }) => {
      const game = payload?.game;
      if (!game || (game.creatorId !== user.id && game.opponentId !== user.id)) return;
      setActiveGame((current) => current?.id === game.id ? current : game);
    };
    const onUpdate = (payload: { game?: Game }) => {
      const game = payload?.game;
      if (!game || (game.creatorId !== user.id && game.opponentId !== user.id)) return;
      upsert(game);
    };
    socket.on('game:invite', onInvite);
    socket.on('game:updated', onUpdate);
    return () => {
      socket.off('game:invite', onInvite);
      socket.off('game:updated', onUpdate);
    };
  }, [socket, user, upsert]);

  const openGame = useCallback((id: string) => {
    void api.games.get(id).then(({ game }) => setActiveGame(game)).catch(() => undefined);
  }, []);

  const closeGame = useCallback(() => setActiveGame(null), []);

  const openHistory = useCallback((conversationId?: string) => {
    setHistoryOpen(true);
    setLoadingHistory(true);
    void api.games.history(conversationId).then(({ games }) => setHistory(games))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, []);

  const accept = useCallback(async (id: string) => {
    const { game } = await api.games.accept(id);
    upsert(game);
    return game;
  }, [upsert]);

  const cancel = useCallback(async (id: string) => {
    const { game } = await api.games.cancel(id);
    upsert(game);
    return game;
  }, [upsert]);

  const submit = useCallback(async (id: string, score: number, details?: Record<string, unknown>) => {
    const { game } = await api.games.submit(id, score, details);
    upsert(game);
    return game;
  }, [upsert]);

  const value = useMemo<GameContextValue>(() => ({
    activeGame, history, historyOpen, setHistoryOpen, loadingHistory,
    openGame, closeGame, openHistory, accept, cancel, submit,
  }), [activeGame, history, historyOpen, loadingHistory, openGame, closeGame, openHistory, accept, cancel, submit]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within GameProvider');
  return context;
}
