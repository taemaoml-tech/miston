import { app, BrowserWindow, Menu, dialog, session, shell } from 'electron';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import express from 'express';
import httpProxy from 'http-proxy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DEFAULT_CLOUD_URL = 'https://miston-api.onrender.com';
// Origin, which the hosted API trusts (see CLIENT_URL in render.yaml). The local
// proxy rewrites the Origin header so the hosted server accepts our requests.
const CLOUD_ORIGIN = 'https://taemaoml-tech.github.io';
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'desktop-config.json');

app.setName('Miston');

let mainWindow = null;
let splashWindow = null;
let backend = null;
let quitting = false;
let currentConfig = { mode: 'cloud', cloudUrl: DEFAULT_CLOUD_URL };

/* ------------------------------------------------------------------ helpers */

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function readConfig() {
  try {
    return JSON.parse(await fs.readFile(CONFIG_FILE(), 'utf8'));
  } catch {
    return null;
  }
}

async function writeConfig(config) {
  const file = CONFIG_FILE();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(config, null, 2), 'utf8');
  currentConfig = config;
}

function normalizeConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {};
  return {
    ...config,
    mode: config.mode === 'local' ? 'local' : 'cloud',
    cloudUrl: typeof config.cloudUrl === 'string' && config.cloudUrl ? config.cloudUrl : DEFAULT_CLOUD_URL,
  };
}

async function ensureJwtSecret() {
  if (typeof currentConfig.jwtSecret === 'string' && currentConfig.jwtSecret.length >= 32) {
    return currentConfig.jwtSecret;
  }
  const jwtSecret = crypto.randomBytes(48).toString('hex');
  await writeConfig({ ...currentConfig, jwtSecret });
  return jwtSecret;
}

async function probeCloud(remote, timeoutMs = 75_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${remote}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------- backend: cloud mode
 * Serves the built client locally and proxies /api, /uploads and /socket.io
 * to the hosted Miston API. Everything is same-origin for the renderer, so no
 * CORS or webSecurity tricks are needed.
 */

async function startCloudBackend(config) {
  const remote = config.cloudUrl || DEFAULT_CLOUD_URL;
  const clientDir = path.join(__dirname, 'client');

  const healthy = await probeCloud(remote);
  if (!healthy) {
    const error = new Error(`Cloud API ${remote} is unreachable`);
    error.code = 'CLOUD_UNREACHABLE';
    error.remote = remote;
    throw error;
  }

  const proxy = httpProxy.createProxyServer({
    target: remote,
    changeOrigin: true,
    secure: true,
    headers: { origin: CLOUD_ORIGIN },
  });
  proxy.on('error', (error, _req, res) => {
    console.error('Cloud proxy error', error.message);
    if (res && !res.headersSent && typeof res.writeHead === 'function') {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Хмарний сервер недоступний' } }));
    } else if (res && typeof res.end === 'function') {
      res.end();
    }
  });

  const cloudApp = express();
  cloudApp.disable('x-powered-by');
  cloudApp.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
      + "img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; "
      + "connect-src 'self' ws: wss:",
    );
    next();
  });
  cloudApp.get('/health', (_req, res) => res.json({ status: 'ok' }));

  const proxyPaths = ['/api', '/uploads', '/socket.io'];
  cloudApp.use(proxyPaths, (req, res) => {
    // Express strips the mount prefix from req.url; the upstream needs the full path.
    req.url = req.originalUrl || req.url;
    proxy.web(req, res);
  });
  cloudApp.use(express.static(clientDir, { index: false, maxAge: '1h' }));
  cloudApp.get(/^\/(?!api(?:\/|$)|uploads(?:\/|$)|socket\.io(?:\/|$)|health(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });

  const server = http.createServer(cloudApp);
  server.on('upgrade', (req, socket, head) => {
    if (req.url && (req.url.startsWith('/socket.io') || req.url.startsWith('/api'))) {
      proxy.ws(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  const port = await getFreePort();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  backend = { kind: 'cloud', server, proxy };
  return `http://127.0.0.1:${port}/`;
}

/* --------------------------------------------------------- backend: local mode */

async function startLocalBackend() {
  const userData = app.getPath('userData');
  const dataDir = path.join(userData, 'db');
  const uploadsDir = path.join(userData, 'uploads');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });

  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { citext } = await import('@electric-sql/pglite/contrib/citext');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');

  const db = await PGlite.create({ dataDir, extensions: { pgcrypto, citext, pg_trgm } });
  const { applyMigrations } = await import('./migrations.mjs');
  await applyMigrations(db, path.join(__dirname, 'database'));

  const pgSocket = new PGLiteSocketServer({
    db,
    port: 0,
    host: '127.0.0.1',
    maxConnections: 20,
  });
  await pgSocket.start();
  const pgPort = Number(pgSocket.getServerConn().split(':').pop());

  const port = await getFreePort();
  const jwtSecret = await ensureJwtSecret();

  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres`;
  process.env.DB_SSL = 'disable';
  process.env.JWT_SECRET = jwtSecret;
  process.env.PORT = String(port);
  process.env.CLIENT_URL = `http://127.0.0.1:${port}`;
  process.env.UPLOAD_DIR = uploadsDir;
  process.env.CLIENT_DIR = path.join(__dirname, 'client');
  process.env.TRUST_PROXY = 'false';

  const { createServer } = require('./server/server.js');
  const { pool } = require('./server/db/pool.js');
  const { server, io } = createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  backend = { kind: 'local', db, pgSocket, server, io, pool };
  return `http://127.0.0.1:${port}/`;
}

async function stopBackend() {
  const current = backend;
  backend = null;
  if (!current) return;
  try { current.io?.close(); } catch { /* ignore */ }
  await new Promise((resolve) => {
    try { current.server.close(() => resolve()); } catch { resolve(); }
    setTimeout(resolve, 3000).unref?.();
  });
  try { current.proxy?.close(); } catch { /* ignore */ }
  try { await current.pool?.end(); } catch { /* ignore */ }
  try { await current.pgSocket?.stop(); } catch { /* ignore */ }
  try { await current.db?.close(); } catch { /* ignore */ }
}

/* --------------------------------------------------------------------- window */

function splashHtml(mode) {
  const subtitle = mode === 'cloud'
    ? 'Прокидаємо хмарний сервер…<br><span style="font-size:11px;color:#94a3b8">Це може тривати до хвилини</span>'
    : 'Запускаємо локальний сервер…';
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>
  html,body{margin:0;height:100%;overflow:hidden}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;
    background:linear-gradient(135deg,#eef2ff 0%,#f8fafc 55%,#f5f3ff 100%);
    font-family:"Segoe UI",system-ui,sans-serif;color:#1e293b;-webkit-user-select:none}
  .mark{width:96px;height:96px;border-radius:26px;
    background:linear-gradient(135deg,#6366f1,#7c3aed 55%,#a855f7);
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 18px 40px rgba(99,102,241,.38)}
  .mark svg{width:66px;height:66px}
  h1{margin:0;font-size:26px;letter-spacing:.4px}
  p{margin:0;font-size:13px;color:#64748b;line-height:1.5;text-align:center}
  .bar{width:190px;height:4px;border-radius:999px;background:#e2e8f0;overflow:hidden}
  .bar span{display:block;width:40%;height:100%;border-radius:999px;
    background:linear-gradient(90deg,#6366f1,#a855f7);animation:slide 1.1s ease-in-out infinite}
  @keyframes slide{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}
</style></head><body>
  <div class="mark">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 20a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H32l-8 6v-6h-4a6 6 0 0 1-6-6V20Z" fill="#fff"/>
      <path d="M23 35V23l9 7 9-7v12" fill="none" stroke="#6d28d9" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <div style="text-align:center;display:flex;flex-direction:column;gap:6px">
    <h1>Miston</h1>
    <p>${subtitle}</p>
  </div>
  <div class="bar"><span></span></div>
</body></html>`;
}

function createSplash(mode) {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 340,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: '#f8fafc',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(mode))}`);
  splashWindow.once('ready-to-show', () => splashWindow?.show());
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#f8fafc',
    title: 'Miston',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    splashWindow?.destroy();
    splashWindow = null;
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'f5' || (input.control && key === 'r')) {
      mainWindow?.webContents.reload();
      event.preventDefault();
    } else if (input.control && input.shift && key === 'i') {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu(config) {
  const template = [
    {
      label: 'Miston',
      submenu: [
        {
          label: config.mode === 'cloud' ? 'Сервер: Хмара Miston' : 'Сервер: Локальний (цей ПК)',
          enabled: false,
        },
        { label: 'Змінити сервер…', click: () => switchServer(config) },
        { type: 'separator' },
        { label: 'Перезавантажити', accelerator: 'F5', click: () => mainWindow?.webContents.reload() },
        { label: 'Інструменти розробника', accelerator: 'Ctrl+Shift+I', click: () => mainWindow?.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'Вийти', role: 'quit' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function switchServer(config) {
  const result = await dialog.showMessageBox({
    type: 'question',
    title: 'Miston',
    message: 'До якого сервера підключитися?',
    detail: 'Хмара Miston — ваш наявний акаунт (miston-api.onrender.com).\n'
      + 'Локальний режим — окрема база лише на цьому комп’ютері.',
    buttons: ['Хмара Miston', 'Локальний режим', 'Скасувати'],
    defaultId: config.mode === 'cloud' ? 0 : 1,
    cancelId: 2,
    noLink: true,
  });
  if (result.response === 2) return;
  const mode = result.response === 0 ? 'cloud' : 'local';
  if (mode === config.mode) return;
  await writeConfig({ ...config, mode });
  quitting = true;
  await stopBackend();
  app.relaunch();
  app.exit(0);
}

function setupPermissions() {
  const allowed = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowed.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));
}

/* ----------------------------------------------------------------------- boot */

async function askServerMode() {
  const result = await dialog.showMessageBox({
    type: 'question',
    title: 'Miston',
    message: 'До якого сервера підключитися?',
    detail: 'Хмара Miston — вхід у ваш наявний акаунт (потрібен інтернет).\n'
      + 'Локальний режим — нова порожня база лише на цьому комп’ютері.',
    buttons: ['Хмара Miston', 'Локальний режим'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return result.response === 1 ? 'local' : 'cloud';
}

async function boot() {
  const raw = await readConfig();
  let config = normalizeConfig(raw);
  if (!raw) {
    config = normalizeConfig({ mode: await askServerMode(), cloudUrl: DEFAULT_CLOUD_URL });
    await writeConfig(config);
  } else {
    currentConfig = config;
  }

  createSplash(config.mode);

  for (;;) {
    try {
      const url = config.mode === 'cloud' ? await startCloudBackend(config) : await startLocalBackend(config);
      console.log(`Miston backend ready (${config.mode}) at ${url}`);
      createMainWindow(url);
      buildMenu(config);
      return;
    } catch (error) {
      if (config.mode === 'cloud' && error?.code === 'CLOUD_UNREACHABLE') {
        const choice = await dialog.showMessageBox({
          type: 'warning',
          title: 'Miston',
          message: 'Хмарний сервер недоступний',
          detail: `Не вдалося підключитися до ${error.remote}.\n\n`
            + 'Перевірте інтернет або спробуйте ще раз (безкоштовний сервер Render '
            + 'може "прокидатися" до хвилини). Можна також перейти в локальний режим — '
            + 'але це буде окрема порожня база без ваших хмарних акаунтів.',
          buttons: ['Спробувати ще раз', 'Локальний режим', 'Вийти'],
          defaultId: 0,
          cancelId: 2,
          noLink: true,
        });
        if (choice.response === 0) continue;
        if (choice.response === 1) {
          config = { ...config, mode: 'local' };
          await writeConfig(config);
          continue;
        }
        app.exit(0);
        return;
      }

      splashWindow?.destroy();
      splashWindow = null;
      await dialog.showMessageBox({
        type: 'error',
        title: 'Miston',
        message: 'Не вдалося запустити Miston',
        detail: `${error?.stack || error}`,
        buttons: ['Закрити'],
      });
      app.exit(1);
      return;
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupPermissions();
    await boot();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    stopBackend().finally(() => app.exit(0));
  });
}
