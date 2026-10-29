import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config/env';
import { registerSockets } from './index';

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    serveClient: false,
    cors: {
      origin: config.CORS_ORIGINS,
      credentials: true,
    },
    maxHttpBufferSize: 1_000_000,
  });
  registerSockets(io);
  return io;
}
