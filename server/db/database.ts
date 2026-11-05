import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let dbInstance: DatabaseSync | null = null;

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH || resolve(process.cwd(), 'data/factory.db');
}

export function initDatabase(dbPath = getDatabasePath()): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Enable WAL mode for high-concurrency read/write performance and enable foreign keys
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');

  dbInstance = db;
  return db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
