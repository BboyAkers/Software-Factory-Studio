import { z } from 'zod';
import { EpicModeSchema } from './common';
import { ContractKindSchema } from './epic';

export const DslPrioritySchema = z.enum(['P0', 'P1', 'P2']);
export type DslPriority = z.infer<typeof DslPrioritySchema>;

/** Spec Appendix C. Required: title, mode, priority, areas[], acceptance[]. */
export const EpicDslSchema = z.object({
  title: z.string({ error: 'Add a title' }).trim().min(3, 'Title needs at least 3 characters').max(140, 'Title is limited to 140 characters'),
  mode: EpicModeSchema,
  priority: DslPrioritySchema,
  areas: z.array(z.string().trim().min(1)).min(1, 'Add at least one area'),
  acceptance: z.array(z.string().trim().min(3, 'Acceptance criteria need at least 3 characters')).min(1, 'Add at least one acceptance criterion'),
  language: z.string().optional(),
  contracts: z.array(z.object({ kind: ContractKindSchema, path: z.string().min(1) })).optional(),
  dag_hints: z.array(z.string()).optional(),
  test_plan: z.array(z.string()).optional(),
  budget_cap_note: z.string().optional(),
});
export type EpicDsl = z.infer<typeof EpicDslSchema>;
