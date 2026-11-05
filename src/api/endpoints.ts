import { z } from 'zod';
import {
  AgentConfigVersionSchema,
  AgentCycleResultSchema,
  AgentSchema,
  ApproveResultSchema,
  AttributionSchema,
  AuditEntrySchema,
  BenchmarkLatestSchema,
  BenchmarkStartSchema,
  BudgetSchema,
  ConnectivityResultSchema,
  ContractSchema,
  DispatchResponseSchema,
  EpicDetailSchema,
  EpicSchema,
  FileContentSchema,
  FleetStatsSchema,
  GatesResponseSchema,
  DisconnectProjectResponseSchema,
  GitHubWebhookResponseSchema,
  HealthSchema,
  IntakeEventSchema,
  IntegrationSchema,
  LocksResultSchema,
  LogEntrySchema,
  MeSchema,
  ModelCatalogEntrySchema,
  OverviewMetricsSchema,
  PipelineStagesSchema,
  PipelineStatusSchema,
  PipelineToggleSchema,
  PoliciesSchema,
  PreflightResultSchema,
  PreviewResponseSchema,
  ProjectSchema,
  ProjectTokenSchema,
  ReasoningStepSchema,
  ReleaseSchema,
  RepositorySchema,
  ReproBundleSchema,
  RotateTokenResponseSchema,
  RunSchema,
  ScreenshotSchema,
  SearchResponseSchema,
  SlackSettingsSchema,
  SlackTestResultSchema,
  SteeringHintSchema,
  SteeringStateSchema,
  SteeringSuggestionSchema,
  UpdateBudgetResponseSchema,
  VaultKeySchema,
  VerifyResultSchema,
  WorkpackDetailSchema,
  WorkpackDiffSchema,
  WorkpackSchema,
  pagedSchema,
  type AgentConfig,
  type AttributionBy,
  type ConnectRequest,
  type CreateWorkpackRequest,
  type HintKind,
  type OverviewWindow,
  type PutVaultKeyRequest,
  type SearchScope,
  type UpdatePoliciesRequest,
  type UpdateSlackRequest,
  type Workpack,
  type WorkpackStatus,
} from '../contracts';
import { request, type QueryParams } from './client';

/** A write, described rather than sent, so it can go out now or wait in the offline queue (spec §16.2). */
export interface Call<T = unknown> {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: QueryParams;
  /** The version the user acted on. A stale one is answered with 409. */
  ifMatch?: number | string;
  schema?: z.ZodType<T>;
}

export interface SendOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
  project?: string | null;
}

/** Identity, so each builder's response type is inferred from its schema. */
const call = <T>(c: Call<T>): Call<T> => c;

export function send<T>(description: Call<T>, options: SendOptions = {}): Promise<T> {
  return request<T>(description.path, {
    method: description.method,
    ...(description.body === undefined ? {} : { body: description.body }),
    ...(description.query ? { query: description.query } : {}),
    ...(description.ifMatch === undefined ? {} : { ifMatch: description.ifMatch }),
    ...(description.schema ? { schema: description.schema } : {}),
    ...options,
  });
}

/** Every read names its project: a background refetch for one project must never be sent as another. */
const get = <T>(project: string, path: string, schema: z.ZodType<T>, query?: QueryParams, signal?: AbortSignal) =>
  request<T>(path, { project, schema, ...(query ? { query } : {}), ...(signal ? { signal } : {}) });

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type AuditFilters = {
  workpack?: string;
  actor?: string;
  /** An exact action (`workpack.merged`) or a dotted prefix (`workpack`). */
  action?: string;
  since?: string;
  until?: string;
  cursor?: string | null;
  limit?: number;
};

// A type alias, not an interface, so it can be used as a query-key filter object.
export type WorkpackFilters = {
  status?: string;
  priority?: string;
  agent?: string;
  epic?: string;
  q?: string;
  archived?: boolean;
  doneSince?: string;
  limit?: number;
};

export const read = {
  me: () => request('/me', { project: null, schema: MeSchema }),
  projects: () => request('/projects', { project: null, schema: z.array(ProjectSchema) }),

  pipelineStatus: (p: string) => get(p, '/pipeline/status', PipelineStatusSchema),
  pipelineStages: (p: string, epic?: string | null) => get(p, '/pipeline/stages', PipelineStagesSchema, { epic }),

  epics: (p: string, filters: { status?: string; q?: string } = {}) => get(p, '/epics', pagedSchema(EpicSchema), { limit: 200, ...filters }),
  epic: (p: string, id: string) => get(p, `/epics/${id}`, EpicDetailSchema),
  intake: (p: string, limit = 20) => get(p, '/intake', pagedSchema(IntakeEventSchema), { limit }),

  workpacks: (p: string, filters: WorkpackFilters = {}) => get(p, '/workpacks', pagedSchema(WorkpackSchema), { limit: 500, ...filters, archived: filters.archived ? 1 : undefined }),
  workpack: (p: string, id: string) => get(p, `/workpacks/${id}`, WorkpackDetailSchema),
  runs: (p: string, workpackId: string) => get(p, `/workpacks/${workpackId}/runs`, z.array(RunSchema)),
  diff: (p: string, workpackId: string, file?: string | null) => get(p, `/workpacks/${workpackId}/diff`, WorkpackDiffSchema, { file }),
  file: (p: string, workpackId: string, path: string) => get(p, `/workpacks/${workpackId}/files`, FileContentSchema, { path }),
  gates: (p: string, workpackId: string) => get(p, `/workpacks/${workpackId}/gates`, GatesResponseSchema),
  screenshots: (p: string, workpackId: string) => get(p, `/workpacks/${workpackId}/screenshots`, z.array(ScreenshotSchema)),
  release: (p: string, workpackId: string) => get(p, `/workpacks/${workpackId}/release`, ReleaseSchema),
  repro: (p: string, workpackId: string) => get(p, `/workpacks/${workpackId}/repro`, ReproBundleSchema),
  contracts: (p: string, workpackId: string) => get(p, `/workpacks/${workpackId}/contracts`, z.array(ContractSchema)),

  run: (p: string, id: string) => get(p, `/runs/${id}`, RunSchema),
  /** The newest `limit` log lines of a run, oldest first. Pass the `nextCursor` of the previous page to go further back. */
  runLogs: (p: string, id: string, params: { cursor?: string | null; limit?: number } = {}) => get(p, `/runs/${id}/logs`, pagedSchema(LogEntrySchema), { limit: 200, ...params }),
  runReasoning: (p: string, id: string) => get(p, `/runs/${id}/reasoning`, z.array(ReasoningStepSchema)),
  steering: (p: string, runId: string) => get(p, `/runs/${runId}/steering`, SteeringStateSchema),

  budget: (p: string) => get(p, '/budget', BudgetSchema),
  attribution: (p: string, by: AttributionBy) => get(p, '/budget/attribution', AttributionSchema, { by }),

  agents: (p: string) => get(p, '/agents', z.array(AgentSchema)),
  agent: (p: string, id: string) => get(p, `/agents/${id}`, AgentSchema),
  /** Newest first. */
  agentVersions: (p: string, id: string, params: { cursor?: string | null; limit?: number } = {}) =>
    get(p, `/agents/${id}/versions`, pagedSchema(AgentConfigVersionSchema), { limit: 50, ...params }),
  agentVersion: (p: string, id: string, version: number) => get(p, `/agents/${id}/versions/${version}`, AgentConfigVersionSchema),
  fleetStats: (p: string) => get(p, '/fleet/stats', FleetStatsSchema),
  models: (p: string) => get(p, '/models', z.array(ModelCatalogEntrySchema)),

  integrations: (p: string) => get(p, '/integrations', z.array(IntegrationSchema)),
  policies: (p: string) => get(p, '/policies', PoliciesSchema),
  slack: (p: string) => get(p, '/notifications/slack', SlackSettingsSchema),
  token: (p: string) => get(p, '/tokens', ProjectTokenSchema),
  /** Maintainer and above only: the server answers 403 to anyone else, so do not call it for a lower role. */
  vault: (p: string) => get(p, '/vault/keys', z.array(VaultKeySchema)),
  /** `null` while the project has no repository. */
  repository: (p: string) => get(p, '/repository', RepositorySchema.nullable()),

  overviewMetrics: (p: string, window: OverviewWindow) => get(p, '/overview/metrics', OverviewMetricsSchema, { window }),
  health: (p: string) => get(p, '/overview/health', HealthSchema),
  /** `null` until a benchmark has run. */
  latestBenchmark: (p: string) => get(p, '/benchmarks/latest', BenchmarkLatestSchema.nullable()),

  /** Newest first. Offset-paged: pass `nextCursor` back as `cursor`. */
  audit: (p: string, filters: AuditFilters = {}) => get(p, '/audit', pagedSchema(AuditEntrySchema), { limit: 50, ...filters }),
  auditVerify: (p: string, range: { since?: string; until?: string } = {}) => get(p, '/audit/verify', VerifyResultSchema, range),

  search: (p: string, q: string, scope?: readonly SearchScope[]) => get(p, '/search', SearchResponseSchema, { q, scope: scope?.join(',') }),
};

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** What a person is looking at when they act, so the write can carry its version. */
type Versioned = Pick<Workpack, 'id' | 'version'>;

export const write = {
  pipeline: {
    pause: () => call({ method: 'POST', path: '/pipeline/pause', schema: PipelineToggleSchema }),
    resume: () => call({ method: 'POST', path: '/pipeline/resume', schema: PipelineToggleSchema }),
  },

  epic: {
    pause: (id: string) => call({ method: 'POST', path: `/epics/${id}/pause`, schema: EpicSchema }),
    resume: (id: string) => call({ method: 'POST', path: `/epics/${id}/resume`, schema: EpicSchema }),
    preview: (specMarkdown: string) => call({ method: 'POST', path: '/epics/preview', body: { specMarkdown }, schema: PreviewResponseSchema }),
    dispatch: (specMarkdown: string) => call({ method: 'POST', path: '/epics', body: { specMarkdown }, schema: DispatchResponseSchema }),
  },

  workpack: {
    create: (body: CreateWorkpackRequest) => call({ method: 'POST', path: '/workpacks', body, schema: WorkpackSchema }),
    /** Cancel by moving the card to Recently ended. */
    cancel: (wp: Versioned) => call({ method: 'PATCH', path: `/workpacks/${wp.id}/status`, body: { status: 'cancelled' satisfies WorkpackStatus }, ifMatch: wp.version, schema: WorkpackSchema }),
    requestChanges: (wp: Versioned, text: string) => call({ method: 'POST', path: `/workpacks/${wp.id}/request-changes`, body: { text }, ifMatch: wp.version, schema: WorkpackSchema }),
    pause: (wp: Versioned) => call({ method: 'POST', path: `/workpacks/${wp.id}/pause`, ifMatch: wp.version, schema: WorkpackSchema }),
    resume: (wp: Versioned) => call({ method: 'POST', path: `/workpacks/${wp.id}/resume`, ifMatch: wp.version, schema: WorkpackSchema }),
    archive: (wp: Versioned) => call({ method: 'POST', path: `/workpacks/${wp.id}/archive`, ifMatch: wp.version, schema: WorkpackSchema }),
    fork: (wp: Versioned) => call({ method: 'POST', path: `/workpacks/${wp.id}/fork`, ifMatch: wp.version, schema: WorkpackSchema }),
    promote: (wp: Versioned) => call({ method: 'POST', path: `/workpacks/${wp.id}/promote`, ifMatch: wp.version, schema: WorkpackSchema }),
    rollback: (wp: Versioned) => call({ method: 'POST', path: `/workpacks/${wp.id}/rollback`, ifMatch: wp.version, schema: WorkpackSchema }),
    holdForReview: (wp: Versioned, hold: boolean) => call({ method: 'PATCH', path: `/workpacks/${wp.id}`, body: { holdForReview: hold }, ifMatch: wp.version, schema: WorkpackSchema }),
    saveFile: (workpackId: string, path: string, content: string) => call({ method: 'PUT', path: `/workpacks/${workpackId}/files`, body: { path, content }, schema: FileContentSchema }),
  },

  contract: {
    unlock: (contractId: string, reason: string) => call({ method: 'POST', path: `/contracts/${contractId}/unlock`, body: { reason }, schema: ContractSchema }),
  },

  run: {
    lock: (runId: string, path: string) => call({ method: 'POST', path: `/runs/${runId}/locks`, body: { path }, schema: LocksResultSchema }),
    unlock: (runId: string, path: string) => call({ method: 'DELETE', path: `/runs/${runId}/locks`, query: { path }, schema: LocksResultSchema }),
  },

  steering: {
    suggest: (runId: string, text: string) => call({ method: 'POST', path: '/steering/suggest', body: { runId, text }, schema: SteeringSuggestionSchema }),
    inject: (runId: string, text: string, kind: HintKind) => call({ method: 'POST', path: `/runs/${runId}/steer`, body: { text, kind }, schema: SteeringHintSchema }),
    approve: (suggestionId: string, kind?: HintKind) => call({ method: 'POST', path: `/steering/${suggestionId}/approve`, body: kind ? { kind } : {}, schema: ApproveResultSchema }),
    reject: (suggestionId: string, reason?: string) => call({ method: 'POST', path: `/steering/${suggestionId}/reject`, body: reason ? { reason } : {}, schema: SteeringSuggestionSchema }),
  },

  budget: {
    update: (monthlyCapUsd: number, softLimitPercent: number) => call({ method: 'PUT', path: '/budget', body: { monthlyCapUsd, softLimitPercent }, schema: UpdateBudgetResponseSchema }),
  },

  agent: {
    /** Saves a new version. A behavioral change starts its eval; an autonomy-only change goes live at once. */
    saveVersion: (agentId: string, config: AgentConfig, note?: string) =>
      call({ method: 'POST', path: `/agents/${agentId}/versions`, body: note ? { config, note } : { config }, schema: AgentConfigVersionSchema }),
    /** Promote a `passed` version, or roll back to one that was active before. */
    activate: (agentId: string, version: number) => call({ method: 'PUT', path: `/agents/${agentId}/active-version`, body: { version }, schema: AgentSchema }),
    /** A manual intake cycle. Architect-Prime and SentryWatch only. */
    run: (agentId: string) => call({ method: 'POST', path: `/agents/${agentId}/run`, schema: AgentCycleResultSchema }),
  },

  integration: {
    setEnabled: (id: string, enabled: boolean) => call({ method: 'PATCH', path: `/integrations/${id}`, body: { enabled }, schema: IntegrationSchema }),
    test: (id: string) => call({ method: 'POST', path: `/integrations/${id}/test`, schema: ConnectivityResultSchema }),
    /** Write-only. The answer is `204`: the key is never read back. */
    putKey: (id: string, value: string) => call<undefined>({ method: 'PUT', path: `/integrations/${id}/key`, body: { value } }),
  },

  policies: {
    update: (patch: UpdatePoliciesRequest) => call({ method: 'PATCH', path: '/policies', body: patch, schema: PoliciesSchema }),
  },

  slack: {
    update: (patch: UpdateSlackRequest) => call({ method: 'PUT', path: '/notifications/slack', body: patch, schema: SlackSettingsSchema }),
    test: () => call({ method: 'POST', path: '/notifications/slack/test', schema: SlackTestResultSchema }),
  },

  token: {
    /** The new value is in the response and is shown exactly once. */
    rotate: () => call({ method: 'POST', path: '/tokens/rotate', schema: RotateTokenResponseSchema }),
    revoke: () => call({ method: 'POST', path: '/tokens/revoke', schema: ProjectTokenSchema }),
  },

  vault: {
    /** Creates or rotates. Omit `value` to change only the gate allow-list. */
    put: (name: string, body: Pick<PutVaultKeyRequest, 'value'> & { allowedGates?: PutVaultKeyRequest['allowedGates'] }) =>
      call({ method: 'PUT', path: `/vault/keys/${name}`, body, schema: VaultKeySchema }),
    remove: (name: string) => call<undefined>({ method: 'DELETE', path: `/vault/keys/${name}` }),
  },

  benchmark: {
    start: () => call({ method: 'POST', path: '/benchmarks', schema: BenchmarkStartSchema }),
  },

  /** Webhooks endpoint for GitHub deliveries and synthetic tests. */
  webhook: {
    github: (body: Record<string, unknown>) =>
      call({ method: 'POST', path: '/webhooks/github', body, schema: GitHubWebhookResponseSchema }),
  },

  /** Not scoped to a project: the server ignores `X-Project` for these. */
  project: {
    preflight: (body: { repo: string; token: string; defaultBranch?: string }) =>
      call({ method: 'POST', path: '/projects/connect/preflight', body, schema: PreflightResultSchema }),
    connect: (body: ConnectRequest) => call({ method: 'POST', path: '/projects/connect', body, schema: ProjectSchema }),
    disconnect: (projectId: string) =>
      call({ method: 'DELETE', path: `/projects/${projectId}`, schema: DisconnectProjectResponseSchema }),
  },
};
