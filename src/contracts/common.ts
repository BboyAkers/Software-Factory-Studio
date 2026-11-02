import { z } from 'zod';

export const ROLES = ['viewer', 'engineer', 'maintainer', 'admin'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const PRIORITIES = ['P0 Blocker', 'P1 High', 'P2 Normal'] as const;
export const PrioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof PrioritySchema>;

export const WORKPACK_STATUSES = [
  'queued',
  'planning',
  'in-progress',
  'verification',
  'awaiting-review',
  'done',
  'failed',
  'cancelled',
] as const;
export const WorkpackStatusSchema = z.enum(WORKPACK_STATUSES);
export type WorkpackStatus = z.infer<typeof WorkpackStatusSchema>;

export const QUEUED_REASONS = ['integration-off', 'budget', 'paused', 'deps', 'file-lock', 'capacity'] as const;
export const QueuedReasonSchema = z.enum(QUEUED_REASONS);
export type QueuedReason = z.infer<typeof QueuedReasonSchema>;

export const PAUSED_REASONS = ['manual-global', 'manual-workpack', 'budget-hard-cap', 'integration-disabled'] as const;
export const PausedReasonSchema = z.enum(PAUSED_REASONS);
export type PausedReason = z.infer<typeof PausedReasonSchema>;

export const AutonomyPolicySchema = z.enum(['fully-autonomous', 'draft-and-queue', 'propose-only']);
export type AutonomyPolicy = z.infer<typeof AutonomyPolicySchema>;

export const EpicModeSchema = z.enum(['feature', 'refactor', 'bug', 'security']);
export type EpicMode = z.infer<typeof EpicModeSchema>;

export const EPIC_STATUSES = ['intake', 'stage-1', 'stage-2', 'executing', 'completed', 'failed', 'cancelled'] as const;
export const EpicStatusSchema = z.enum(EPIC_STATUSES);
export type EpicStatus = z.infer<typeof EpicStatusSchema>;

export const HintKindSchema = z.enum(['hint', 'constraint', 'veto']);
export type HintKind = z.infer<typeof HintKindSchema>;

export const ReasoningEffortSchema = z.enum(['Low', 'Medium', 'High', 'Max']);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const LogLevelSchema = z.enum(['info', 'warn', 'success', 'agent', 'error']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

/** RFC 3339 timestamp. */
export const IsoSchema = z.string();

export const MetricSchema = z.object({ label: z.string(), value: z.string() });
export type Metric = z.infer<typeof MetricSchema>;

export const FieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string().optional(),
});
export type FieldError = z.infer<typeof FieldErrorSchema>;

/** application/problem+json body (spec §10.1). */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.array(FieldErrorSchema).optional(),
  requiredRole: RoleSchema.optional(),
  allowed: z.array(z.string()).optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;

export function pagedSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}
