import fs from 'node:fs/promises';
import { config } from './config/env';
import { pool } from './db/pool';
import { createServer } from './server';

async function start(): Promise<void> {
  await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
  const { server, io } = createServer();
  server.listen(config.PORT, () => {
    console.log(`Miston API listening on port ${config.PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    io.close();
    server.close(() => {
      pool.end()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
