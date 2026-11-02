import { z } from 'zod';
import { IsoSchema } from './common';
import { AgentStatusSchema, ProviderStatSchema } from './agent';

export const OverviewWindowSchema = z.enum(['24h', '7d']);
export type OverviewWindow = z.infer<typeof OverviewWindowSchema>;

const SeriesSchema = z.array(z.number());

export const OverviewMetricsSchema = z.object({
  window: OverviewWindowSchema,
  updatedAt: IsoSchema,
  velocity: z.object({
    merged: z.number().int(),
    perWeek: z.number(),
    deltaPct: z.number().nullable(),
    series: SeriesSchema,
  }),
  zeroIntervention: z.object({
    rate: z.number().nullable(),
    deltaPts: z.number().nullable(),
    series: SeriesSchema,
  }),
  costPerMergedPr: z.object({
    usdMicros: z.number().nullable(),
    deltaPct: z.number().nullable(),
    series: SeriesSchema,
  }),
  cycle: z.object({
    p50Sec: z.number().nullable(),
    p90Sec: z.number().nullable(),
    series: SeriesSchema,
  }),
  warnings: z.object({
    perf: z.object({ count: z.number().int(), deltaPct: z.number().nullable() }),
    a11y: z.object({ count: z.number().int(), deltaPct: z.number().nullable() }),
    i18n: z.object({ count: z.number().int(), deltaPct: z.number().nullable() }),
  }),
});
export type OverviewMetrics = z.infer<typeof OverviewMetricsSchema>;

export const HealthSchema = z.object({
  specialists: z.array(z.object({ agentId: z.string(), name: z.string(), status: AgentStatusSchema })),
  providers: z.array(ProviderStatSchema),
  sandboxPool: z.object({ warm: z.number().int(), inUse: z.number().int(), coldStartP95Ms: z.number().int() }),
});
export type Health = z.infer<typeof HealthSchema>;

export const BenchmarkStartSchema = z.object({ benchmarkId: z.string() });
export type BenchmarkStart = z.infer<typeof BenchmarkStartSchema>;

/** `GET /benchmarks/latest`: lets Overview show a running or finished benchmark after a reload. `null` body when none has run. */
export const BenchmarkLatestSchema = z.object({
  id: z.string(),
  running: z.boolean(),
  total: z.number().int(),
  /** Cases run so far; equals `total` once finished. */
  completed: z.number().int(),
  /** `null` while running. */
  passed: z.number().int().nullable(),
  startedAt: IsoSchema,
  finishedAt: IsoSchema.nullable(),
});
export type BenchmarkLatest = z.infer<typeof BenchmarkLatestSchema>;
