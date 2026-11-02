import { describe, expect, it } from 'vitest';
import { computeKpis, percentile, type KpiInput } from './kpis';

const DAY = 86_400_000;
const NOW = new Date('2026-11-08T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const USD = 1_000_000;

let n = 0;
const merged = (msAgo: number, over: { human?: boolean; epicCreatedMsAgo?: number } = {}) => {
  const id = `WP-${++n}`;
  return {
    wp: { id, epicId: `E-${id}`, mergedAt: ago(msAgo), humanIntervened: over.human ?? false },
    epicCreatedAt: [`E-${id}`, ago(over.epicCreatedMsAgo ?? msAgo + 1000)] as const,
  };
};

function input(parts: ReturnType<typeof merged>[], over: Partial<KpiInput> = {}): KpiInput {
  return {
    workpacks: parts.map((p) => p.wp),
    epicCreatedAt: Object.fromEntries(parts.map((p) => p.epicCreatedAt)),
    spend: [],
    warnings: [],
    now: NOW,
    window: '7d',
    ...over,
  };
}

describe('percentile (nearest rank)', () => {
  it('picks the value at ceil(p/100 × n) of the sorted list', () => {
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([42], 90)).toBe(42);
  });
  it('is null for an empty list', () => {
    expect(percentile([], 50)).toBeNull();
  });
});

describe('overview KPIs (spec §15)', () => {
  it('counts workpacks merged in the window and the equivalent weekly rate, with change vs the previous window', () => {
    const parts = [
      ...Array.from({ length: 7 }, (_, i) => merged(i * DAY + 1000)), // 7 in the last 7 days
      ...Array.from({ length: 5 }, (_, i) => merged(8 * DAY + i * 1000)), // 5 in the 7 days before
    ];
    const k = computeKpis(input(parts));
    expect(k.velocity.merged).toBe(7);
    expect(k.velocity.perWeek).toBe(7);
    expect(k.velocity.deltaPct).toBe(40);
  });

  it('scales a 24 h count to a per-week rate and reports no change when the previous window is empty', () => {
    const k = computeKpis(input([merged(1000), merged(2000), merged(3000)], { window: '24h' }));
    expect(k.velocity.merged).toBe(3);
    expect(k.velocity.perWeek).toBe(21);
    expect(k.velocity.deltaPct).toBeNull();
  });

  it('includes a workpack merged exactly at the window start and excludes one merged in the future', () => {
    const k = computeKpis(input([merged(7 * DAY), merged(-1000)]));
    expect(k.velocity.merged).toBe(1);
  });

  it('computes the zero-intervention rate and its change in points', () => {
    const now = [merged(1000), merged(2000), merged(3000), merged(4000, { human: true })]; // 3 of 4 clean
    const before = [merged(8 * DAY), merged(8 * DAY + 1000, { human: true })]; // 1 of 2 clean
    const k = computeKpis(input([...now, ...before]));
    expect(k.zeroIntervention.rate).toBe(0.75);
    expect(k.zeroIntervention.deltaPts).toBe(25);
  });

  it('has no rate when nothing merged', () => {
    const k = computeKpis(input([]));
    expect(k.zeroIntervention.rate).toBeNull();
    expect(k.costPerMergedPr.usdMicros).toBeNull();
    expect(k.cycle.p50Sec).toBeNull();
  });

  it('divides ALL spend in the window by merged PRs, so failed work raises the cost', () => {
    const parts = [merged(1000), merged(2000), merged(3000), merged(4000)];
    const spend = [
      { at: ago(1000), usdMicros: 100 * USD },
      { at: ago(2 * DAY), usdMicros: 20 * USD }, // e.g. work that never merged
      { at: ago(9 * DAY), usdMicros: 999 * USD }, // outside the window
    ];
    expect(computeKpis(input(parts, { spend })).costPerMergedPr.usdMicros).toBe(30 * USD);
  });

  it('measures spec-to-merge from the Epic creation time, as p50 and p90', () => {
    const cycles = [100, 200, 300, 400, 1000];
    const parts = cycles.map((s, i) => merged(1000 + i * 10, { epicCreatedMsAgo: 1000 + i * 10 + s * 1000 }));
    const k = computeKpis(input(parts));
    expect(k.cycle.p50Sec).toBe(300);
    expect(k.cycle.p90Sec).toBe(1000);
  });

  it('builds one sparkline point per day for 7d and per hour for 24h', () => {
    const parts = [merged(1000), merged(DAY + 1000), merged(DAY + 2000)];
    const week = computeKpis(input(parts));
    expect(week.velocity.series).toHaveLength(7);
    expect(week.velocity.series.reduce((a, b) => a + b, 0)).toBe(3);
    expect(week.zeroIntervention.series).toHaveLength(7);
    expect(week.costPerMergedPr.series).toHaveLength(7);
    expect(week.cycle.series).toHaveLength(7);
    expect(computeKpis(input(parts, { window: '24h' })).velocity.series).toHaveLength(24);
  });

  it('counts warn-gate events per gate in the window with change vs the previous window', () => {
    const warnings = [
      { gate: 'perf.budgets' as const, at: ago(1000) },
      { gate: 'perf.budgets' as const, at: ago(DAY) },
      { gate: 'perf.budgets' as const, at: ago(8 * DAY) },
      { gate: 'a11y.scan' as const, at: ago(2000) },
      { gate: 'a11y.scan' as const, at: ago(8 * DAY) },
      { gate: 'a11y.scan' as const, at: ago(9 * DAY) },
      { gate: 'a11y.scan' as const, at: ago(10 * DAY) },
    ];
    const k = computeKpis(input([], { warnings }));
    expect(k.warnings.perf).toEqual({ count: 2, deltaPct: 100 });
    expect(k.warnings.a11y).toEqual({ count: 1, deltaPct: -67 });
    expect(k.warnings.i18n).toEqual({ count: 0, deltaPct: null });
  });
});
