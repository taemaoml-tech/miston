import http from 'node:http';
import { createApp } from './app';
import { createSocketServer } from './sockets/server';

export function createServer() {
  const app = createApp();
  const server = http.createServer(app);
  const io = createSocketServer(server);
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return { app, server, io };
}
