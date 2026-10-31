import type { WorkspaceFileKey, FileDiffData } from '../lib/workspaceStreamModel';

export function getFileDiff(fileKey: WorkspaceFileKey): FileDiffData {
  switch (fileKey) {
    case 'session_store.ts':
      return {
        filename: 'src/auth/session_store.ts',
        additions: 12,
        deletions: 4,
        originalLines: [
          'export class RedisSessionStore {',
          '  private client: Redis;',
          '  async acquire(key: string): Promise<boolean> {',
          '    return await this.client.set(key, "locked");',
          '  }',
          '}'
        ],
        modifiedLines: [
          { text: 'import { Redis } from "ioredis";', type: 'added' },
          { text: 'import { TelemetrySpan } from "../telemetry";', type: 'added' },
          { text: 'export class RedisSessionStore {', type: 'unchanged' },
          { text: '  private client: Redis;', type: 'unchanged' },
          { text: '  // REFACTORED: Atomic CAS with 3000ms TTL safeguards', type: 'added' },
          { text: '  async acquire(key: string, ttlMs = 3000): Promise<boolean> {', type: 'added' },
          { text: '    const token = crypto.randomUUID();', type: 'added' },
          { text: '    const result = await this.client.set(key, token, "PX", ttlMs, "NX");', type: 'added' },
          { text: '    return result === "OK";', type: 'added' },
          { text: '  }', type: 'unchanged' },
          { text: '}', type: 'unchanged' }
        ]
      };
    case 'redis_cache.ts':
      return {
        filename: 'src/cache/redis_cache.ts',
        additions: 8,
        deletions: 2,
        originalLines: ['export function getCache(k: string) { return cache[k]; }'],
        modifiedLines: [
          { text: 'import { clusterPool } from "./pool";', type: 'added' },
          { text: 'export async function getCache(k: string) {', type: 'unchanged' },
          { text: '  return await clusterPool.getWithFallback(k);', type: 'added' },
          { text: '}', type: 'unchanged' }
        ]
      };
    default:
      return {
        filename: `src/${fileKey}`,
        additions: 6,
        deletions: 1,
        originalLines: ['// Base file contents'],
        modifiedLines: [
          { text: '// Modified with telemetry bindings', type: 'added' },
          { text: 'export const status = "verified";', type: 'unchanged' }
        ]
      };
  }
}
