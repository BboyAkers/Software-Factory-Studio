import { z } from 'zod';
import { IsoSchema } from './common';

export const BudgetSchema = z.object({
  monthlyCapUsdMicros: z.number().int(),
  spendUsdMicros: z.number().int(),
  softLimitPercent: z.number(),
  /** Always 100: the hard cap equals the monthly cap (spec §11.2). */
  hardCapPercent: z.literal(100),
  softLimitHit: z.boolean(),
  hardCapHit: z.boolean(),
  percentUsed: z.number(),
  projectedSpendUsdMicros: z.number().int(),
  /** `null` when there is no burn (unbounded runway). */
  runway: z.object({ days: z.number().int(), hours: z.number().int() }).nullable(),
  burnUsdMicrosPerHour: z.number(),
  periodStart: IsoSchema,
  periodEnd: IsoSchema,
  pausedRuns: z.number().int(),
  slackChannel: z.string(),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const UpdateBudgetRequestSchema = z.object({
  monthlyCapUsd: z.number().positive().max(1_000_000),
  softLimitPercent: z.number().min(50).max(95),
});
export type UpdateBudgetRequest = z.infer<typeof UpdateBudgetRequestSchema>;

export const UpdateBudgetResponseSchema = z.object({
  budget: BudgetSchema,
  resumedRuns: z.number().int(),
});
export type UpdateBudgetResponse = z.infer<typeof UpdateBudgetResponseSchema>;

export const AttributionBySchema = z.enum(['epic', 'agent', 'source']);
export type AttributionBy = z.infer<typeof AttributionBySchema>;

export const AttributionSchema = z.object({
  by: AttributionBySchema,
  totalUsdMicros: z.number().int(),
  items: z.array(z.object({ key: z.string(), label: z.string(), usdMicros: z.number().int() })),
});
export type Attribution = z.infer<typeof AttributionSchema>;

export const SPEND_SOURCES = ['workpack', 'eval', 'benchmark', 'preview', 'intake'] as const;
export type SpendSource = (typeof SPEND_SOURCES)[number];
