import type { DatabaseSync } from 'node:sqlite';
import type { Store } from '../../src/mocks/backend/store';
import { seedWorld } from '../../src/mocks/seeds';
import { saveProject } from './sync';

export async function initAndSeedDatabase(db: DatabaseSync, store: Store): Promise<void> {
  const row = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
  
  if (row.count === 0) {
    console.log('[SQLite] Empty database detected. Seeding initial projects...');
    await seedWorld(store, 'healthy');
    for (const ps of store.projects.values()) {
      saveProject(db, ps);
    }
    console.log(`[SQLite] Seed complete. Projects stored in SQLite: ${[...store.projects.keys()].join(', ')}`);
  } else {
    console.log(`[SQLite] Existing database detected with ${row.count} project(s). Populating store...`);
    // Seed in-memory world structure first
    await seedWorld(store, 'healthy');

    // Read projects from SQLite to update in-memory store
    const projects = db.prepare('SELECT * FROM projects').all() as {
      id: string;
      name: string;
      repo: string;
      defaultBranch: string;
      createdAt: string;
    }[];

    for (const p of projects) {
      const ps = store.projects.get(p.id);
      if (ps) {
        ps.project.name = p.name;
        ps.project.repo = p.repo;
        ps.project.defaultBranch = p.defaultBranch;
      }
    }
  }
}
