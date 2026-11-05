import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createStore } from '../src/mocks/backend/store';
import { closeDatabase, initDatabase } from './db/database';
import { createSchema } from './db/schema';
import { initAndSeedDatabase } from './db/seed';
import { handleSseStream } from './events';
import { handleCors } from './http';
import { createDispatcher } from './routes';
import { setupTerminalWebSocket } from './terminal';

const PORT = Number(process.env.PORT || 3001);

async function startServer(): Promise<void> {
  console.log('----------------------------------------------------');
  console.log('🚀 Starting Software Factory Studio Node.js Backend');
  console.log('----------------------------------------------------');

  // 1. Initialize SQLite Database
  const db = initDatabase();
  console.log('[SQLite] Initialized database with WAL mode and foreign keys enabled.');

  // 2. Run DDL schema migrations
  createSchema(db);
  console.log('[SQLite] Verified database schema.');

  // 3. Initialize in-memory store and seed SQLite if empty
  const store = createStore();
  await initAndSeedDatabase(db, store);

  // 4. Create HTTP Server
  const dispatcher = createDispatcher(store, db);

  const server = createServer(async (req, res) => {
    if (handleCors(req, res)) return;

    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    let pathname = url.pathname;

    // Handle Server-Sent Events (SSE)
    const isProjectStream = pathname === '/stream' || pathname === '/api/v1/stream';
    const runStreamMatch = pathname.match(/^(?:\/api\/v1)?\/runs\/([^/]+)\/stream$/);

    if (req.method === 'GET' && (isProjectStream || runStreamMatch)) {
      const projectId = (req.headers['x-project'] as string) || url.searchParams.get('project');
      const ps = projectId ? store.projects.get(projectId) : undefined;

      if (!ps) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ type: 'not_found', title: `Project '${projectId}' not found.` }));
        return;
      }

      const runId = runStreamMatch ? runStreamMatch[1] : null;
      handleSseStream(req, res, store, ps, runId, url);
      return;
    }

    // Handle REST API requests
    await dispatcher(req, res);
  });

  // 5. Create WebSocket Server for Interactive Sandboxes & Terminals
  const wss = new WebSocketServer({ server });
  setupTerminalWebSocket(wss, () => store);
  console.log('[WebSocket] Sandbox terminal service bound to HTTP server.');

  // 6. Listen
  server.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[API Base] http://localhost:${PORT}/api/v1`);
    console.log(`[Database] SQLite (data/factory.db)`);
    console.log('----------------------------------------------------');
  });

  const shutdown = () => {
    console.log('\nGracefully shutting down...');
    wss.close();
    server.close(() => {
      closeDatabase();
      console.log('Server and database closed. Bye!');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
