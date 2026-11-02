import type { OverviewMetrics, OverviewWindow } from '../contracts';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface KpiWorkpack {
  id: string;
  epicId: string;
  mergedAt: string | null;
  humanIntervened: boolean;
}

export interface SpendPoint {
  at: string;
  usdMicros: number;
}

export type WarnGate = 'perf.budgets' | 'a11y.scan' | 'i18n.check';

export interface WarnEvent {
  gate: WarnGate;
  at: string;
}

export interface KpiInput {
  workpacks: KpiWorkpack[];
  /** Epic id → creation time, for spec-to-merge cycle time. */
  epicCreatedAt: Record<string, string>;
  spend: SpendPoint[];
  warnings: WarnEvent[];
  now: Date;
  window: OverviewWindow;
}

/** Nearest-rank percentile: the value at rank ceil(p/100 × n) of the sorted list. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1]!;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pctChange = (now: number, before: number): number | null => (before > 0 ? round1(((now - before) / before) * 100) : null);

interface Range {
  start: number;
  end: number;
  /** The end is inclusive for the current window and exclusive for the previous one. */
  inclusiveEnd: boolean;
}

const within = (t: number, r: Range) => t >= r.start && (r.inclusiveEnd ? t <= r.end : t < r.end);

interface Slice {
  merged: KpiWorkpack[];
  spend: number;
  cycles: number[];
}

function slice(input: KpiInput, range: Range): Slice {
  const merged = input.workpacks.filter((w) => w.mergedAt !== null && within(Date.parse(w.mergedAt), range));
  const spend = input.spend.filter((s) => within(Date.parse(s.at), range)).reduce((sum, s) => sum + s.usdMicros, 0);
  const cycles = merged.flatMap((w) => {
    const created = input.epicCreatedAt[w.epicId];
    return created ? [(Date.parse(w.mergedAt!) - Date.parse(created)) / 1000] : [];
  });
  return { merged, spend, cycles };
}

const cleanRate = (s: Slice) => (s.merged.length > 0 ? s.merged.filter((w) => !w.humanIntervened).length / s.merged.length : null);
const costPerPr = (s: Slice) => (s.merged.length > 0 ? Math.round(s.spend / s.merged.length) : null);

export function computeKpis(input: KpiInput): OverviewMetrics {
  const windowMs = input.window === '24h' ? DAY_MS : 7 * DAY_MS;
  const bucketMs = input.window === '24h' ? HOUR_MS : DAY_MS;
  const buckets = windowMs / bucketMs;
  const end = input.now.getTime();
  const start = end - windowMs;
  const current: Range = { start, end, inclusiveEnd: true };
  const previous: Range = { start: start - windowMs, end: start, inclusiveEnd: false };

  const now = slice(input, current);
  const before = slice(input, previous);

  const rate = cleanRate(now);
  const prevRate = cleanRate(before);
  const cost = costPerPr(now);
  const prevCost = costPerPr(before);

  const series = Array.from({ length: buckets }, (_, i): Slice => {
    const range: Range = { start: start + i * bucketMs, end: start + (i + 1) * bucketMs, inclusiveEnd: i === buckets - 1 };
    return slice(input, range);
  });

  const warn = (gate: WarnGate) => {
    const count = input.warnings.filter((w) => w.gate === gate && within(Date.parse(w.at), current)).length;
    const prev = input.warnings.filter((w) => w.gate === gate && within(Date.parse(w.at), previous)).length;
    return { count, deltaPct: prev > 0 ? Math.round(((count - prev) / prev) * 100) : null };
  };

  return {
    window: input.window,
    updatedAt: input.now.toISOString(),
    velocity: {
      merged: now.merged.length,
      perWeek: (now.merged.length * 7 * DAY_MS) / windowMs,
      deltaPct: pctChange(now.merged.length, before.merged.length),
      series: series.map((s) => s.merged.length),
    },
    zeroIntervention: {
      rate,
      deltaPts: rate !== null && prevRate !== null ? round1((rate - prevRate) * 100) : null,
      series: series.map((s) => round1((cleanRate(s) ?? 0) * 100)),
    },
    costPerMergedPr: {
      usdMicros: cost,
      deltaPct: cost !== null && prevCost !== null ? pctChange(cost, prevCost) : null,
      series: series.map((s) => costPerPr(s) ?? 0),
    },
    cycle: {
      p50Sec: percentile(now.cycles, 50),
      p90Sec: percentile(now.cycles, 90),
      series: series.map((s) => percentile(s.cycles, 50) ?? 0),
    },
    warnings: { perf: warn('perf.budgets'), a11y: warn('a11y.scan'), i18n: warn('i18n.check') },
  };
}
