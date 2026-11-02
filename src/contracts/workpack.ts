import { z } from 'zod';
import {
  IsoSchema,
  LogLevelSchema,
  PausedReasonSchema,
  PrioritySchema,
  QueuedReasonSchema,
  WorkpackStatusSchema,
} from './common';

export const GateSummarySchema = z.object({
  passed: z.number().int(),
  failed: z.number().int(),
  running: z.number().int(),
  total: z.number().int(),
});
export type GateSummary = z.infer<typeof GateSummarySchema>;

export const WorkpackSchema = z.object({
  id: z.string(),
  epicId: z.string(),
  title: z.string(),
  description: z.string(),
  status: WorkpackStatusSchema,
  priority: PrioritySchema,
  category: z.string(),
  language: z.literal('typescript'),
  /** Current stage owner. Derived from stage, never user-chosen. */
  assignedAgentId: z.string().nullable(),
  branch: z.string(),
  prNumber: z.number().int().nullable(),
  commitSha: z.string().nullable(),
  targetFiles: z.array(z.string()),
  dependsOn: z.array(z.string()),
  linesAdded: z.number().int(),
  linesRemoved: z.number().int(),
  filesCount: z.number().int(),
  completeness: z.number(),
  tokensConsumed: z.number().int(),
  costUsdMicros: z.number().int(),
  attempt: z.number().int(),
  maxAttempts: z.number().int(),
  version: z.number().int(),
  /** Highest-precedence reason; set only while `status === 'queued'`. */
  queuedReason: QueuedReasonSchema.nullable(),
  /** All queued reasons in precedence order. */
  queuedReasons: z.array(QueuedReasonSchema),
  blockedBy: z.string().nullable(),
  paused: z.boolean(),
  pausedReasons: z.array(PausedReasonSchema),
  pausedBy: z.string().nullable(),
  pausedAt: IsoSchema.nullable(),
  slaDueAt: IsoSchema.nullable(),
  slaBreached: z.boolean(),
  escalatedAt: IsoSchema.nullable(),
  forkOf: z.string().nullable(),
  revertOf: z.string().nullable(),
  invariants: z.array(z.string()),
  humanLockedFiles: z.array(z.string()),
  humanIntervened: z.boolean(),
  autonomyOverride: z.literal('require-review').nullable(),
  proposal: z.boolean(),
  failureReason: z.string().nullable(),
  activeRunId: z.string().nullable(),
  activeDiffStream: z.string().nullable(),
  phaseName: z.string().nullable(),
  gateSummary: GateSummarySchema.nullable(),
  createdAt: IsoSchema,
  startedAt: IsoSchema.nullable(),
  endedAt: IsoSchema.nullable(),
  archived: z.boolean(),
  archivedAt: IsoSchema.nullable(),
  mergedAt: IsoSchema.nullable(),
  completedAt: IsoSchema.nullable(),
});
export type Workpack = z.infer<typeof WorkpackSchema>;

export const RunStatusSchema = z.enum(['running', 'paused', 'succeeded', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSchema = z.object({
  id: z.string(),
  workpackId: z.string(),
  stage: z.number().int().min(1).max(4),
  agentId: z.string(),
  agentConfigVersion: z.number().int(),
  attempt: z.number().int(),
  turn: z.number().int(),
  status: RunStatusSchema,
  startedAt: IsoSchema,
  endedAt: IsoSchema.nullable(),
  tokens: z.number().int(),
  costUsdMicros: z.number().int(),
  transcriptUri: z.string().nullable(),
});
export type Run = z.infer<typeof RunSchema>;

export const WorkpackDetailSchema = WorkpackSchema.extend({
  runs: z.array(RunSchema),
  contractIds: z.array(z.string()),
  epicTitle: z.string(),
  deployment: z
    .object({
      status: z.enum(['queued', 'in-progress', 'succeeded', 'failed']),
      environment: z.literal('staging'),
      sha: z.string(),
      url: z.string().nullable(),
      updatedAt: IsoSchema,
    })
    .nullable(),
});
export type WorkpackDetail = z.infer<typeof WorkpackDetailSchema>;

export const LogEntrySchema = z.object({
  id: z.string(),
  runId: z.string(),
  ts: IsoSchema,
  level: LogLevelSchema,
  tag: z.string(),
  message: z.string(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const ReasoningStepSchema = z.object({
  step: z.number().int(),
  title: z.string(),
  status: z.enum(['active', 'done']),
  ts: IsoSchema,
});
export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;

export const DiffLineSchema = z.object({
  type: z.enum(['context', 'added', 'removed', 'hunk']),
  text: z.string(),
  oldNumber: z.number().int().nullable(),
  newNumber: z.number().int().nullable(),
});
export type DiffLine = z.infer<typeof DiffLineSchema>;

export const DiffFileSchema = z.object({
  path: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  locked: z.boolean(),
  lockedBy: z.string().nullable(),
  writing: z.boolean(),
});
export type DiffFile = z.infer<typeof DiffFileSchema>;

export const WorkpackDiffSchema = z.object({
  files: z.array(DiffFileSchema),
  file: z.object({ path: z.string(), lines: z.array(DiffLineSchema) }).nullable(),
});
export type WorkpackDiff = z.infer<typeof WorkpackDiffSchema>;

export const FileContentSchema = z.object({
  path: z.string(),
  content: z.string(),
  locked: z.boolean(),
  lockedBy: z.string().nullable(),
});
export type FileContent = z.infer<typeof FileContentSchema>;

export const CreateWorkpackRequestSchema = z.object({
  epicId: z.string().min(1),
  title: z.string().min(3),
  description: z.string().default(''),
  priority: PrioritySchema,
  category: z.string().min(1),
  targetFiles: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]),
  holdForReview: z.boolean().default(false),
});
export type CreateWorkpackRequest = z.infer<typeof CreateWorkpackRequestSchema>;

/** The files a person holds locked on a run, after taking or releasing one. */
export const LocksResultSchema = z.object({ humanLockedFiles: z.array(z.string()), version: z.number().int() });
export type LocksResult = z.infer<typeof LocksResultSchema>;
