import { z } from 'zod';
import { EpicModeSchema, EpicStatusSchema, IsoSchema, PrioritySchema, FieldErrorSchema } from './common';

export const ContractKindSchema = z.enum(['ts-types', 'openapi', 'playwright', 'invariant']);
export type ContractKind = z.infer<typeof ContractKindSchema>;

export const ContractSchema = z.object({
  id: z.string(),
  epicId: z.string(),
  kind: ContractKindSchema,
  path: z.string(),
  content: z.string(),
  hash: z.string(),
  locked: z.boolean(),
  unlockedBy: z.string().nullable(),
  unlockedAt: IsoSchema.nullable(),
  unlockReason: z.string().nullable(),
});
export type Contract = z.infer<typeof ContractSchema>;

export const EpicSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  source: z.enum(['github', 'sentry-via-github']),
  origin: z.enum(['spec-studio', 'github-ui', 'sentry']),
  sourceRef: z.string(),
  issueNumber: z.number().int(),
  title: z.string(),
  specMarkdown: z.string(),
  mode: EpicModeSchema,
  priority: PrioritySchema,
  areas: z.array(z.string()),
  acceptance: z.array(z.string()),
  status: EpicStatusSchema,
  paused: z.boolean(),
  workpackIds: z.array(z.string()),
  spendUsdMicros: z.number().int(),
  budgetCapNote: z.string().nullable(),
  createdBy: z.string(),
  createdAt: IsoSchema,
  completedAt: IsoSchema.nullable(),
});
export type Epic = z.infer<typeof EpicSchema>;

export const DagNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  targetFiles: z.array(z.string()),
  dependsOn: z.array(z.string()),
  complexity: z.enum(['Low', 'Medium', 'High']),
  estimatedTokens: z.number().int(),
  stage: z.enum(['synthesis', 'verification', 'docs']),
  /** Other node ids that could run at the same time and share target files with this node (one waits for the other). */
  overlapsWith: z.array(z.string()),
  /** Workpacks that are running now and hold files this node needs: it will queue behind them. */
  queuesBehind: z.array(z.string()),
  /** The workpack created from this node once the Epic is decomposed; `null` in a preview. */
  workpackId: z.string().nullable(),
});
export type DagNode = z.infer<typeof DagNodeSchema>;

export const EpicDetailSchema = EpicSchema.extend({
  dag: z.array(DagNodeSchema),
  contracts: z.array(ContractSchema),
});
export type EpicDetail = z.infer<typeof EpicDetailSchema>;

export const StageStateSchema = z.enum(['completed', 'active', 'pending', 'blocked']);
export type StageState = z.infer<typeof StageStateSchema>;

export const PipelineStageSchema = z.object({
  id: z.number().int().min(1).max(4),
  title: z.string(),
  subtitle: z.string(),
  agentName: z.string(),
  agentRole: z.string(),
  state: StageStateSchema,
  duration: z.string().nullable(),
  metric: z.string().nullable(),
  workpackIds: z.array(z.string()),
});
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

export const PipelineStagesSchema = z.object({
  epicId: z.string().nullable(),
  stages: z.array(PipelineStageSchema),
});
export type PipelineStages = z.infer<typeof PipelineStagesSchema>;

export const PipelineStatusSchema = z.object({
  /** True while any project-wide reason holds the pipeline: a manual pause, the hard cap, or GitHub being off. */
  paused: z.boolean(),
  /** Project-wide reasons in force: `manual-global`, `budget-hard-cap`, `integration-disabled`. */
  pausedReasons: z.array(z.string()),
  /** Who paused it and when, for the manual pause only. */
  pausedBy: z.string().nullable(),
  pausedAt: IsoSchema.nullable(),
  capacity: z.object({ used: z.number().int(), max: z.number().int() }),
  /** Workpacks in planning, in progress or verification: the ones holding a slot. */
  running: z.number().int(),
  queued: z.number().int(),
  awaitingReview: z.number().int(),
  /** Every workpack that has not ended: `queued` + `running` + `awaitingReview`. */
  active: z.number().int(),
  hardCapHit: z.boolean(),
});
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;

/** Result of a global pause or resume: the new status plus how many workpacks changed. */
export const PipelineToggleSchema = z.object({
  status: PipelineStatusSchema,
  affected: z.number().int(),
});
export type PipelineToggle = z.infer<typeof PipelineToggleSchema>;

export const IntakeEventSchema = z.object({
  id: z.string(),
  issueRef: z.string(),
  issueNumber: z.number().int(),
  issueTitle: z.string(),
  origin: z.enum(['spec-studio', 'github-ui', 'sentry']),
  outcome: z.enum(['accepted', 'duplicate', 'rejected', 'forming']),
  code: z.string().nullable(),
  errors: z.array(FieldErrorSchema),
  epicId: z.string().nullable(),
  canonicalEpicId: z.string().nullable(),
  createdAt: IsoSchema,
});
export type IntakeEvent = z.infer<typeof IntakeEventSchema>;

export const PreviewRequestSchema = z.object({ specMarkdown: z.string() });
export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;

export const PreviewResponseSchema = z.object({
  title: z.string(),
  contracts: z.array(ContractSchema.omit({ epicId: true, locked: true, unlockedBy: true, unlockedAt: true, unlockReason: true })),
  dag: z.array(DagNodeSchema),
  estimate: z.object({
    tokens: z.number().int(),
    costLowUsdMicros: z.number().int(),
    costHighUsdMicros: z.number().int(),
    durationMinutes: z.number().int(),
    budgetSharePercent: z.number(),
  }),
});
export type PreviewResponse = z.infer<typeof PreviewResponseSchema>;

export const DispatchResponseSchema = z.object({
  issue: z.object({ number: z.number().int(), url: z.string() }),
  intakeId: z.string(),
});
export type DispatchResponse = z.infer<typeof DispatchResponseSchema>;
