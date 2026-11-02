import { z } from 'zod';
import { AutonomyPolicySchema, IsoSchema, ReasoningEffortSchema } from './common';

export const MODEL_IDS = [
  'anthropic/claude-opus',
  'anthropic/claude-sonnet',
  'anthropic/claude-haiku',
  'deepseek/deepseek-v3',
  'openai/gpt-4o',
] as const;
export const ModelIdSchema = z.enum(MODEL_IDS);
export type ModelId = z.infer<typeof ModelIdSchema>;

export const ModelCatalogEntrySchema = z.object({
  id: ModelIdSchema,
  provider: z.enum(['anthropic', 'deepseek', 'openai']),
  displayName: z.string(),
  pinnedModel: z.string(),
  contextWindow: z.number().int(),
  inputPerMTokUsdMicros: z.number().int(),
  cachedInputPerMTokUsdMicros: z.number().int(),
  outputPerMTokUsdMicros: z.number().int(),
});
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;

export const AgentConfigSchema = z.object({
  id: z.string(),
  role: z.string(),
  stage: z.number().int().min(1).max(4).nullable(),
  model: z.object({
    primary: ModelIdSchema,
    fallbacks: z.array(ModelIdSchema),
    reasoningEffort: ReasoningEffortSchema,
    temperature: z.number().min(0).max(1),
    maxOutputTokens: z.number().int().positive(),
  }),
  systemPrompt: z.string().min(1),
  tools: z.array(z.string()),
  autonomyPolicy: AutonomyPolicySchema,
  limits: z.object({
    maxTurns: z.number().int().positive(),
    maxTokensPerRun: z.number().int().positive(),
    maxWallClockSec: z.number().int().positive(),
  }),
  skills: z.array(z.string()),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const SkillDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  promptMarkdown: z.string(),
  tools: z.array(z.string()),
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export const AgentStatusSchema = z.enum(['online', 'working', 'idle', 'degraded']);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  initials: z.string(),
  color: z.string(),
  stage: z.number().int().nullable(),
  stageLabel: z.string(),
  status: AgentStatusSchema,
  activeVersion: z.number().int(),
  evaluatingVersion: z.number().int().nullable(),
  tokens24h: z.number().int(),
  cost24hUsdMicros: z.number().int(),
  cacheHitRatio: z.number(),
  failovers24h: z.number().int(),
  responsibilities: z.array(z.string()),
  canRunNow: z.boolean(),
  config: AgentConfigSchema,
  availableSkills: z.array(SkillDefinitionSchema),
});
export type Agent = z.infer<typeof AgentSchema>;

export const VersionStatusSchema = z.enum(['evaluating', 'passed', 'failed', 'active', 'superseded']);
export type VersionStatus = z.infer<typeof VersionStatusSchema>;

export const EvalRunSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  version: z.number().int(),
  trigger: z.enum(['on-change', 'nightly', 'manual']),
  status: z.enum(['running', 'passed', 'failed']),
  ticketsTotal: z.number().int(),
  ticketsDone: z.number().int(),
  firstPassRate: z.number().nullable(),
  baselineFirstPassRate: z.number(),
  costPerPrUsdMicros: z.number().int().nullable(),
  baselineCostPerPrUsdMicros: z.number().int(),
  deltaFirstPassPts: z.number().nullable(),
  deltaCostPct: z.number().nullable(),
  reasons: z.array(z.string()),
  startedAt: IsoSchema,
  finishedAt: IsoSchema.nullable(),
});
export type EvalRun = z.infer<typeof EvalRunSchema>;

export const AgentConfigVersionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  version: z.number().int(),
  status: VersionStatusSchema,
  config: AgentConfigSchema,
  note: z.string().nullable(),
  createdBy: z.string(),
  createdAt: IsoSchema,
  activatedAt: IsoSchema.nullable(),
  evalRun: EvalRunSchema.nullable(),
  /** Whether this version needed an eval (behavioral change) or only an audited autonomy change. */
  gated: z.boolean(),
});
export type AgentConfigVersion = z.infer<typeof AgentConfigVersionSchema>;

export const CreateVersionRequestSchema = z.object({
  config: AgentConfigSchema,
  note: z.string().max(300).optional(),
});
export type CreateVersionRequest = z.infer<typeof CreateVersionRequestSchema>;

export const ActivateVersionRequestSchema = z.object({ version: z.number().int().positive() });
export type ActivateVersionRequest = z.infer<typeof ActivateVersionRequestSchema>;

export const ProviderStatSchema = z.object({
  id: z.enum(['anthropic', 'openai', 'deepseek']),
  name: z.string(),
  status: z.enum(['online', 'degraded', 'offline']),
  p50LatencyMs: z.number().int(),
  p95LatencyMs: z.number().int(),
  errorRate: z.number(),
});
export type ProviderStat = z.infer<typeof ProviderStatSchema>;

export const RoutingRowSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  primary: ModelIdSchema,
  fallbacks: z.array(ModelIdSchema),
  p50LatencyMs: z.number().int(),
  costPerMTokUsdMicros: z.number().int(),
  failovers24h: z.number().int(),
});
export type RoutingRow = z.infer<typeof RoutingRowSchema>;

export const FleetStatsSchema = z.object({
  providers: z.array(ProviderStatSchema),
  cacheHitRatio: z.number(),
  cacheHitTarget: z.number(),
  failoverRate24h: z.number(),
  failovers24h: z.number().int(),
  tokensMonth: z.number().int(),
  spendMonthUsdMicros: z.number().int(),
  routing: z.array(RoutingRowSchema),
});
export type FleetStats = z.infer<typeof FleetStatsSchema>;

/** `POST /agents/:id/run`: how many labeled issues the cycle evaluated and how many new issues it filed. */
export const AgentCycleResultSchema = z.object({
  agentId: z.string(),
  processed: z.number().int(),
  filed: z.number().int(),
});
export type AgentCycleResult = z.infer<typeof AgentCycleResultSchema>;
