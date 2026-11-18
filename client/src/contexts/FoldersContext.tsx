import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import type { ChatFolder } from '../types/models';
import { useAuth } from './AuthContext';

interface FoldersContextValue {
  folders: ChatFolder[];
  activeFolderId: string | null;
  loading: boolean;
  error: string;
  setActiveFolderId: (id: string | null) => void;
  refresh: () => Promise<void>;
  createFolder: (name: string, color?: string) => Promise<ChatFolder>;
  renameFolder: (id: string, data: { name?: string; color?: string }) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  addConversation: (folderId: string, conversationId: string) => Promise<void>;
  removeConversation: (folderId: string, conversationId: string) => Promise<void>;
}

const noop = async () => undefined;
const FoldersContext = createContext<FoldersContextValue>({
  folders: [],
  activeFolderId: null,
  loading: false,
  error: '',
  setActiveFolderId: () => undefined,
  refresh: noop,
  createFolder: async () => ({ id: '', name: '', color: 'blue', conversationIds: [], createdAt: '' }),
  renameFolder: noop,
  deleteFolder: noop,
  addConversation: noop,
  removeConversation: noop,
});

export function FoldersProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [activeFolderId, setActiveFolderIdState] = useState<string | null>(() => localStorage.getItem('miston.activeFolder'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user) { setFolders([]); return; }
    setLoading(true);
    setError('');
    try {
      const result = await api.folders.list();
      setFolders(result.folders);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не вдалося завантажити папки.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setActiveFolderId = useCallback((id: string | null) => {
    setActiveFolderIdState(id);
    if (id) localStorage.setItem('miston.activeFolder', id);
    else localStorage.removeItem('miston.activeFolder');
  }, []);

  useEffect(() => {
    if (activeFolderId && !loading && !folders.some((folder) => folder.id === activeFolderId)) setActiveFolderId(null);
  }, [folders, activeFolderId, loading, setActiveFolderId]);

  const createFolder = useCallback(async (name: string, color = 'blue') => {
    const result = await api.folders.create(name, color);
    setFolders((current) => [...current, result.folder]);
    return result.folder;
  }, []);

  const renameFolder = useCallback(async (id: string, data: { name?: string; color?: string }) => {
    const result = await api.folders.rename(id, data);
    setFolders((current) => current.map((folder) => folder.id === id
      ? { ...folder, name: result.folder.name, color: result.folder.color }
      : folder));
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    await api.folders.remove(id);
    setFolders((current) => current.filter((folder) => folder.id !== id));
    if (activeFolderId === id) setActiveFolderId(null);
  }, [activeFolderId, setActiveFolderId]);

  const addConversation = useCallback(async (folderId: string, conversationId: string) => {
    await api.folders.addConversation(folderId, conversationId);
    setFolders((current) => current.map((folder) => folder.id === folderId && !folder.conversationIds.includes(conversationId)
      ? { ...folder, conversationIds: [...folder.conversationIds, conversationId] }
      : folder));
  }, []);

  const removeConversation = useCallback(async (folderId: string, conversationId: string) => {
    await api.folders.removeConversation(folderId, conversationId);
    setFolders((current) => current.map((folder) => folder.id === folderId
      ? { ...folder, conversationIds: folder.conversationIds.filter((id) => id !== conversationId) }
      : folder));
  }, []);

  const value = useMemo(() => ({
    folders, activeFolderId, loading, error, setActiveFolderId, refresh,
    createFolder, renameFolder, deleteFolder, addConversation, removeConversation,
  }), [folders, activeFolderId, loading, error, setActiveFolderId, refresh, createFolder, renameFolder, deleteFolder, addConversation, removeConversation]);

  return <FoldersContext.Provider value={value}>{children}</FoldersContext.Provider>;
}

export function useFolders() {
  return useContext(FoldersContext);
}
