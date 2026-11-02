import { QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import type { AttributionBy, OverviewWindow, SearchScope } from '../contracts';
import { keys } from '../domain/queryKeys';
import { isApiError } from './client';
import { read, type AuditFilters, type WorkpackFilters } from './endpoints';
import { sessionStore, useStoreSelector } from './state';

/**
 * The current project's id, or `''` before one is selected. Set by the `/p/$project` route.
 * Query keys carry it, so a query for one project can never be filled with another's data.
 */
export const useProjectId = (): string => useStoreSelector(sessionStore, (s) => s.projectId) ?? '';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The stream keeps cached data fresh, so a refetch is the exception rather than the rule (spec §16.1).
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // A 4xx will not get better by asking again; a dropped network might.
        retry: (count, error) => !isApiError(error) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

/** `queryOptions` for every read. Keys come from `keys`, which is also what the stream reducer patches. */
export const q = {
  me: () => queryOptions({ queryKey: keys.me(), queryFn: () => read.me(), staleTime: 5 * 60_000 }),
  projects: () => queryOptions({ queryKey: keys.projects(), queryFn: () => read.projects(), staleTime: 60_000 }),

  pipelineStatus: (p: string) => queryOptions({ queryKey: keys.pipelineStatus(p), queryFn: () => read.pipelineStatus(p), enabled: p !== '' }),
  stages: (p: string, epic: string | null) => queryOptions({ queryKey: keys.stages(p, epic), queryFn: () => read.pipelineStages(p, epic), enabled: p !== '' }),

  epics: (p: string, filters: { status?: string; q?: string } = {}) => queryOptions({ queryKey: keys.epicList(p, filters), queryFn: () => read.epics(p, filters), enabled: p !== '' }),
  epic: (p: string, id: string | null) => queryOptions({ queryKey: keys.epic(p, id ?? ''), queryFn: () => read.epic(p, id!), enabled: p !== '' && !!id }),
  intake: (p: string, limit = 20) => queryOptions({ queryKey: [...keys.intake(p), limit], queryFn: () => read.intake(p, limit), enabled: p !== '' }),

  workpacks: (p: string, filters: WorkpackFilters = {}) => queryOptions({ queryKey: keys.workpackList(p, filters), queryFn: () => read.workpacks(p, filters), enabled: p !== '' }),
  workpack: (p: string, id: string | null) => queryOptions({ queryKey: keys.workpack(p, id ?? ''), queryFn: () => read.workpack(p, id!), enabled: p !== '' && !!id }),
  diff: (p: string, id: string | null, file: string | null = null) => queryOptions({ queryKey: keys.workpackDiff(p, id ?? '', file), queryFn: () => read.diff(p, id!, file), enabled: p !== '' && !!id }),
  file: (p: string, id: string | null, path: string | null) => queryOptions({ queryKey: keys.workpackFile(p, id ?? '', path ?? ''), queryFn: () => read.file(p, id!, path!), enabled: p !== '' && !!id && !!path }),
  gates: (p: string, id: string | null) => queryOptions({ queryKey: keys.gates(p, id ?? ''), queryFn: () => read.gates(p, id!), enabled: p !== '' && !!id }),
  screenshots: (p: string, id: string | null) => queryOptions({ queryKey: keys.screenshots(p, id ?? ''), queryFn: () => read.screenshots(p, id!), enabled: p !== '' && !!id }),
  release: (p: string, id: string | null) => queryOptions({ queryKey: keys.release(p, id ?? ''), queryFn: () => read.release(p, id!), enabled: p !== '' && !!id }),
  repro: (p: string, id: string | null) => queryOptions({ queryKey: keys.repro(p, id ?? ''), queryFn: () => read.repro(p, id!), enabled: p !== '' && !!id }),
  contracts: (p: string, id: string | null) => queryOptions({ queryKey: keys.contracts(p, id ?? ''), queryFn: () => read.contracts(p, id!), enabled: p !== '' && !!id }),
  runs: (p: string, workpackId: string | null) => queryOptions({ queryKey: [...keys.runs(p), 'of', workpackId ?? ''], queryFn: () => read.runs(p, workpackId!), enabled: p !== '' && !!workpackId }),

  run: (p: string, id: string | null) => queryOptions({ queryKey: keys.run(p, id ?? ''), queryFn: () => read.run(p, id!), enabled: p !== '' && !!id }),
  /** The newest page of a run's log. Older pages are fetched with `read.runLogs` and held by the component. */
  runLogs: (p: string, id: string | null) => queryOptions({ queryKey: keys.runLogs(p, id ?? '', 'all'), queryFn: () => read.runLogs(p, id!), enabled: p !== '' && !!id }),
  runReasoning: (p: string, id: string | null) => queryOptions({ queryKey: keys.runReasoning(p, id ?? ''), queryFn: () => read.runReasoning(p, id!), enabled: p !== '' && !!id }),
  steering: (p: string, runId: string | null) => queryOptions({ queryKey: keys.steering(p, runId ?? ''), queryFn: () => read.steering(p, runId!), enabled: p !== '' && !!runId }),

  budget: (p: string) => queryOptions({ queryKey: keys.budget(p), queryFn: () => read.budget(p), enabled: p !== '' }),
  attribution: (p: string, by: AttributionBy) => queryOptions({ queryKey: keys.attribution(p, by), queryFn: () => read.attribution(p, by), enabled: p !== '' }),

  agents: (p: string) => queryOptions({ queryKey: keys.agentList(p), queryFn: () => read.agents(p), enabled: p !== '' }),
  agent: (p: string, id: string | null) => queryOptions({ queryKey: keys.agent(p, id ?? ''), queryFn: () => read.agent(p, id!), enabled: p !== '' && !!id }),
  agentVersions: (p: string, id: string | null) => queryOptions({ queryKey: keys.versions(p, id ?? ''), queryFn: () => read.agentVersions(p, id!), enabled: p !== '' && !!id }),
  fleetStats: (p: string) => queryOptions({ queryKey: keys.fleetStats(p), queryFn: () => read.fleetStats(p), enabled: p !== '' }),
  models: (p: string) => queryOptions({ queryKey: keys.models(p), queryFn: () => read.models(p), enabled: p !== '', staleTime: 10 * 60_000 }),

  integrations: (p: string) => queryOptions({ queryKey: keys.integrations(p), queryFn: () => read.integrations(p), enabled: p !== '' }),
  policies: (p: string) => queryOptions({ queryKey: keys.policies(p), queryFn: () => read.policies(p), enabled: p !== '' }),
  slack: (p: string) => queryOptions({ queryKey: keys.slack(p), queryFn: () => read.slack(p), enabled: p !== '' }),
  token: (p: string) => queryOptions({ queryKey: keys.token(p), queryFn: () => read.token(p), enabled: p !== '' }),
  /** Pass `allowed: false` for a role below Maintainer, so the request that would be refused is never sent. */
  vault: (p: string, allowed: boolean) => queryOptions({ queryKey: keys.vault(p), queryFn: () => read.vault(p), enabled: p !== '' && allowed }),
  repository: (p: string) => queryOptions({ queryKey: keys.repository(p), queryFn: () => read.repository(p), enabled: p !== '' }),

  overviewMetrics: (p: string, window: OverviewWindow) => queryOptions({ queryKey: keys.overviewMetrics(p, window), queryFn: () => read.overviewMetrics(p, window), enabled: p !== '' }),
  health: (p: string) => queryOptions({ queryKey: keys.health(p), queryFn: () => read.health(p), enabled: p !== '' }),
  latestBenchmark: (p: string) => queryOptions({ queryKey: keys.benchmark(p), queryFn: () => read.latestBenchmark(p), enabled: p !== '' }),

  audit: (p: string, filters: AuditFilters = {}) => queryOptions({ queryKey: keys.audit(p, filters), queryFn: () => read.audit(p, filters), enabled: p !== '' }),
  auditVerify: (p: string, range: { since?: string; until?: string } = {}) => queryOptions({ queryKey: keys.auditVerify(p, range), queryFn: () => read.auditVerify(p, range), enabled: p !== '', staleTime: 0 }),

  /** Search is typed as the person types, so a short `staleTime` keeps repeated terms instant without going stale. */
  search: (p: string, query: string, scope: readonly SearchScope[] = []) =>
    queryOptions({ queryKey: keys.search(p, query, scope.join(',')), queryFn: () => read.search(p, query, scope), enabled: p !== '' && query.trim() !== '', staleTime: 15_000 }),
};

// ---------------------------------------------------------------------------
// Hooks: the same options, bound to the current project
// ---------------------------------------------------------------------------

export const useMe = () => useQuery(q.me());
export const useProjects = () => useQuery(q.projects());

export const usePipelineStatus = () => useQuery(q.pipelineStatus(useProjectId()));
export const useStages = (epic: string | null) => useQuery(q.stages(useProjectId(), epic));

export const useEpics = (filters: { status?: string; q?: string } = {}) => useQuery(q.epics(useProjectId(), filters));
export const useEpic = (id: string | null) => useQuery(q.epic(useProjectId(), id));
export const useIntake = (limit = 20) => useQuery(q.intake(useProjectId(), limit));

export const useWorkpacks = (filters: WorkpackFilters = {}) => useQuery(q.workpacks(useProjectId(), filters));
export const useWorkpack = (id: string | null) => useQuery(q.workpack(useProjectId(), id));
export const useDiff = (id: string | null, file: string | null = null) => useQuery(q.diff(useProjectId(), id, file));
export const useGates = (id: string | null) => useQuery(q.gates(useProjectId(), id));
export const useScreenshots = (id: string | null) => useQuery(q.screenshots(useProjectId(), id));
export const useRelease = (id: string | null) => useQuery(q.release(useProjectId(), id));
export const useRepro = (id: string | null) => useQuery(q.repro(useProjectId(), id));
export const useContracts = (id: string | null) => useQuery(q.contracts(useProjectId(), id));
export const useWorkpackRuns = (workpackId: string | null) => useQuery(q.runs(useProjectId(), workpackId));

export const useRun = (id: string | null) => useQuery(q.run(useProjectId(), id));
export const useRunLogs = (id: string | null) => useQuery(q.runLogs(useProjectId(), id));
export const useRunReasoning = (id: string | null) => useQuery(q.runReasoning(useProjectId(), id));
export const useSteering = (runId: string | null) => useQuery(q.steering(useProjectId(), runId));

export const useBudget = () => useQuery(q.budget(useProjectId()));
export const useAttribution = (by: AttributionBy) => useQuery(q.attribution(useProjectId(), by));

export const useAgents = () => useQuery(q.agents(useProjectId()));
export const useAgent = (id: string | null) => useQuery(q.agent(useProjectId(), id));
export const useAgentVersions = (id: string | null) => useQuery(q.agentVersions(useProjectId(), id));
export const useFleetStats = () => useQuery(q.fleetStats(useProjectId()));
export const useModels = () => useQuery(q.models(useProjectId()));

export const useIntegrations = () => useQuery(q.integrations(useProjectId()));
export const usePolicies = () => useQuery(q.policies(useProjectId()));
export const useSlack = () => useQuery(q.slack(useProjectId()));
export const useToken = () => useQuery(q.token(useProjectId()));
export const useVault = (allowed: boolean) => useQuery(q.vault(useProjectId(), allowed));
export const useRepository = () => useQuery(q.repository(useProjectId()));

export const useOverviewMetrics = (window: OverviewWindow) => useQuery(q.overviewMetrics(useProjectId(), window));
export const useHealth = () => useQuery(q.health(useProjectId()));
export const useLatestBenchmark = () => useQuery(q.latestBenchmark(useProjectId()));

export const useAudit = (filters: AuditFilters = {}) => useQuery(q.audit(useProjectId(), filters));
export const useSearchResults = (query: string, scope: readonly SearchScope[] = []) => useQuery(q.search(useProjectId(), query, scope));
