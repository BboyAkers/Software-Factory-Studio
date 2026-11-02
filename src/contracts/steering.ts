import { z } from 'zod';
import { HintKindSchema, IsoSchema } from './common';

export const SuggestionStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired']);
export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;

export const SteeringSuggestionSchema = z.object({
  id: z.string(),
  runId: z.string(),
  workpackId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  text: z.string(),
  kind: HintKindSchema,
  status: SuggestionStatusSchema,
  approverId: z.string().nullable(),
  approverName: z.string().nullable(),
  rejectReason: z.string().nullable(),
  createdAt: IsoSchema,
  decidedAt: IsoSchema.nullable(),
});
export type SteeringSuggestion = z.infer<typeof SteeringSuggestionSchema>;

export const SteeringHintSchema = z.object({
  id: z.string(),
  runId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  text: z.string(),
  kind: HintKindSchema,
  suggestionId: z.string().nullable(),
  approvedAt: IsoSchema,
  queuedAt: IsoSchema.nullable(),
  deliveredAt: IsoSchema.nullable(),
  acknowledgedAt: IsoSchema.nullable(),
  /** Turns completed since delivery without an acknowledgement. */
  turnsSinceDelivery: z.number().int(),
  /** The run ended before the hint was delivered. */
  undelivered: z.boolean(),
});
export type SteeringHint = z.infer<typeof SteeringHintSchema>;

export const SteeringStateSchema = z.object({
  suggestions: z.array(SteeringSuggestionSchema),
  hints: z.array(SteeringHintSchema),
  /** Seconds until the run's next turn boundary, when known. */
  nextTurnInSec: z.number().nullable(),
});
export type SteeringState = z.infer<typeof SteeringStateSchema>;

export const SuggestRequestSchema = z.object({
  runId: z.string(),
  text: z.string().trim().min(3).max(1000),
});
export type SuggestRequest = z.infer<typeof SuggestRequestSchema>;

export const SteerRequestSchema = z.object({
  text: z.string().trim().min(3).max(1000),
  kind: HintKindSchema.default('hint'),
});
export type SteerRequest = z.infer<typeof SteerRequestSchema>;

export const ApproveRequestSchema = z.object({ kind: HintKindSchema.optional() });
export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;

export const RejectRequestSchema = z.object({ reason: z.string().max(300).optional() });
export type RejectRequest = z.infer<typeof RejectRequestSchema>;

/** Approving a suggestion decides it and queues the hint that results. */
export const ApproveResultSchema = z.object({ suggestion: SteeringSuggestionSchema, hint: SteeringHintSchema });
export type ApproveResult = z.infer<typeof ApproveResultSchema>;
