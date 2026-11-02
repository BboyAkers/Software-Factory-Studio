/**
 * TanStack Query key factory. Every cached resource lives under `['p', projectId, …]` so the stream
 * reducer can patch or invalidate by prefix (spec §16.1). Pages must build keys from here, never inline.
 */
export type Filters = Record<string, unknown>;

export const keys = {
  me: () => ['me'] as const,
  projects: () => ['projects'] as const,
  all: (p: string) => ['p', p] as const,

  // workpacks: list, detail, and everything hanging off one workpack
  workpacks: (p: string) => ['p', p, 'workpacks'] as const,
  workpackList: (p: string, filters: Filters = {}) => ['p', p, 'workpacks', 'list', filters] as const,
  workpackLists: (p: string) => ['p', p, 'workpacks', 'list'] as const,
  workpack: (p: string, id: string) => ['p', p, 'workpacks', 'detail', id] as const,
  workpackDiff: (p: string, id: string, file?: string | null) => ['p', p, 'workpacks', 'diff', id, file ?? null] as const,
  workpackDiffs: (p: string, id: string) => ['p', p, 'workpacks', 'diff', id] as const,
  workpackFile: (p: string, id: string, path: string) => ['p', p, 'workpacks', 'file', id, path] as const,
  workpackFiles: (p: string, id: string) => ['p', p, 'workpacks', 'file', id] as const,
  gates: (p: string, id: string) => ['p', p, 'workpacks', 'gates', id] as const,
  screenshots: (p: string, id: string) => ['p', p, 'workpacks', 'screenshots', id] as const,
  release: (p: string, id: string) => ['p', p, 'workpacks', 'release', id] as const,
  repro: (p: string, id: string) => ['p', p, 'workpacks', 'repro', id] as const,
  contracts: (p: string, id: string) => ['p', p, 'workpacks', 'contracts', id] as const,

  // epics and intake
  epics: (p: string) => ['p', p, 'epics'] as const,
  epicList: (p: string, filters: Filters = {}) => ['p', p, 'epics', 'list', filters] as const,
  epic: (p: string, id: string) => ['p', p, 'epics', 'detail', id] as const,
  intake: (p: string) => ['p', p, 'intake'] as const,

  // pipeline
  pipeline: (p: string) => ['p', p, 'pipeline'] as const,
  pipelineStatus: (p: string) => ['p', p, 'pipeline', 'status'] as const,
  stages: (p: string, epicId: string | null) => ['p', p, 'pipeline', 'stages', epicId] as const,

  // runs
  runs: (p: string) => ['p', p, 'runs'] as const,
  run: (p: string, id: string) => ['p', p, 'runs', 'detail', id] as const,
  runLogs: (p: string, id: string, level: string = 'all') => ['p', p, 'runs', 'logs', id, level] as const,
  runLogsAll: (p: string, id: string) => ['p', p, 'runs', 'logs', id] as const,
  runReasoning: (p: string, id: string) => ['p', p, 'runs', 'reasoning', id] as const,
  steering: (p: string, runId: string) => ['p', p, 'runs', 'steering', runId] as const,

  // budget
  budget: (p: string) => ['p', p, 'budget'] as const,
  attribution: (p: string, by: string) => ['p', p, 'budget', 'attribution', by] as const,

  // fleet
  agents: (p: string) => ['p', p, 'agents'] as const,
  agentList: (p: string) => ['p', p, 'agents', 'list'] as const,
  agent: (p: string, id: string) => ['p', p, 'agents', 'detail', id] as const,
  versions: (p: string, id: string) => ['p', p, 'agents', 'versions', id] as const,
  fleetStats: (p: string) => ['p', p, 'fleet', 'stats'] as const,
  models: (p: string) => ['p', p, 'fleet', 'models'] as const,

  // settings
  integrations: (p: string) => ['p', p, 'settings', 'integrations'] as const,
  policies: (p: string) => ['p', p, 'settings', 'policies'] as const,
  token: (p: string) => ['p', p, 'settings', 'token'] as const,
  vault: (p: string) => ['p', p, 'settings', 'vault'] as const,
  slack: (p: string) => ['p', p, 'settings', 'slack'] as const,
  repository: (p: string) => ['p', p, 'settings', 'repository'] as const,

  // insight
  overviewMetrics: (p: string, window: string) => ['p', p, 'overview', 'metrics', window] as const,
  overview: (p: string) => ['p', p, 'overview'] as const,
  health: (p: string) => ['p', p, 'overview', 'health'] as const,
  /** Under `overview`, so `benchmark.completed` refreshes it. */
  benchmark: (p: string) => ['p', p, 'overview', 'benchmark'] as const,
  audit: (p: string, filters: Filters = {}) => ['p', p, 'audit', 'list', filters] as const,
  auditAll: (p: string) => ['p', p, 'audit'] as const,
  auditVerify: (p: string, range: Filters = {}) => ['p', p, 'audit', 'verify', range] as const,
  search: (p: string, query: string, scope: string) => ['p', p, 'search', query, scope] as const,
} as const;
