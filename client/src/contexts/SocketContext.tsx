import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_ORIGIN, tokenStore } from '../api/client';
import { useAuth } from './AuthContext';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  // Залежність за id, а не за об'єктом user: редагування профілю дає новий об'єкт
  // і розривало б realtime-з'єднання на кожне збереження.
  useEffect(() => {
    if (!userId) return;
    // Сокет зазвичай живе поруч з API; окремий VITE_SOCKET_URL — лише для іншого хостингу.
    const socketUrl = import.meta.env.VITE_SOCKET_URL || API_ORIGIN || undefined;
    const nextSocket = io(socketUrl, {
      // Функція, а не об'єкт: перепідключення бере актуальний токен, а не той,
      // що міг протермінуватися, поки сторінка була відкрита.
      auth: (completer) => completer({ token: tokenStore.token }),
      withCredentials: true,
    });
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    nextSocket.on('connect', onConnect);
    nextSocket.on('disconnect', onDisconnect);
    setSocket(nextSocket);
    return () => {
      nextSocket.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [userId]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}
