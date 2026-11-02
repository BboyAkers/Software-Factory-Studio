export type WorkspaceFileKey = 'session_store.ts' | 'redis_cache.ts' | 'auth.ts' | 'schema.prisma';

export interface FileDiffData {
  filename: string;
  originalLines: string[];
  modifiedLines: { text: string; type: 'unchanged' | 'added' | 'removed' }[];
  additions: number;
  deletions: number;
}

export interface ReasoningStep {
  id: number;
  title: string;
  status: 'done' | 'active' | 'pending';
  detail: string;
  duration: string;
}

export const REASONING_STEPS: ReasoningStep[] = [
  {
    id: 1,
    title: 'AST Analysis & Invariant Checking',
    status: 'done',
    detail: 'Inspected 14 AST references to RedisSessionStore. Confirmed CAS lock requires token expiry guard.',
    duration: '180ms'
  },
  {
    id: 2,
    title: 'Atomic Compare-And-Swap (CAS) Synthesized',
    status: 'done',
    detail: 'Generated Lua script for atomic compare-and-swap to eradicate race condition under high concurrency.',
    duration: '420ms'
  },
  {
    id: 3,
    title: 'Deterministic Sandbox Test Verification',
    status: 'active',
    detail: 'Executing tests/session.test.ts inside Firecracker microVM #284. Verifying zero memory leaks.',
    duration: '310ms'
  }
];
