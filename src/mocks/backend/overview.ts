import { OverviewWindowSchema, type BenchmarkLatest, type BenchmarkStart, type Health, type OverviewMetrics } from '../../contracts';
import { computeKpis } from '../../domain/kpis';
import { conflict, invalid } from '../http';
import { providerStats } from './agents';
import { spendOrPause } from './budget';
import { hash32 } from './codegen';
import { emit, isHardCapHit, nextId, nowMs, pace, recordAudit, schedule } from './runtime';
import type { Actor, BenchmarkRecord, ProjectState } from './store';
import { SYSTEM_ACTOR } from './store';

// ---------------------------------------------------------------------------
// KPIs (spec §15)
// ---------------------------------------------------------------------------

export function overviewMetrics(ps: ProjectState, windowParam: string | null): OverviewMetrics {
  const window = OverviewWindowSchema.safeParse(windowParam ?? '24h');
  if (!window.success) throw invalid([{ path: 'window', message: 'Use 24h or 7d.', code: 'invalid_value' }]);
  return computeKpis({
    workpacks: ps.workpacks.map((w) => ({ id: w.id, epicId: w.epicId, mergedAt: w.mergedAt, humanIntervened: w.humanIntervened })),
    epicCreatedAt: Object.fromEntries(ps.epics.map((e) => [e.id, e.createdAt])),
    // Every source counts: failed and cancelled work, evals, benchmarks and previews raise the cost per merged PR.
    spend: ps.spend.map((s) => ({ at: s.at, usdMicros: s.usdMicros })),
    warnings: ps.warnEvents,
    now: new Date(nowMs(ps.store)),
    window: window.data,
  });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

const POOL_SIZE = 12;
const MIN_WARM = 2;
const BUCKET_MS = 600_000;

export function healthView(ps: ProjectState): Health {
  const inUse = ps.workpacks.filter((w) => w.status === 'planning' || w.status === 'in-progress' || w.status === 'verification').length;
  const bucket = Math.floor(nowMs(ps.store) / BUCKET_MS);
  return {
    specialists: ps.agents.map((a) => ({ agentId: a.id, name: a.name, status: a.status })),
    providers: providerStats(ps),
    sandboxPool: {
      warm: Math.max(MIN_WARM, POOL_SIZE - inUse),
      inUse,
      coldStartP95Ms: 1800 + (hash32(`${ps.project.id}:cold-start:${bucket}`) % 801),
    },
  };
}

// ---------------------------------------------------------------------------
// Factory regression benchmark
// ---------------------------------------------------------------------------

const BENCHMARK_CASES = 40;
const BENCHMARK_MS = 12_000;

/** $18 to $26, fixed for a given benchmark. */
const benchmarkCost = (ps: ProjectState, id: string): number => 18_000_000 + (hash32(`${ps.project.id}:${id}:cost`) % 8_000_001);
/** 36 to 40 of the 40 cases pass, fixed for a given benchmark. */
const benchmarkPassed = (ps: ProjectState, id: string): number => 36 + (hash32(`${ps.project.id}:${id}:passed`) % 5);

export function startBenchmark(ps: ProjectState, actor: Actor): BenchmarkStart {
  if (isHardCapHit(ps)) throw conflict('budget_blocked', 'The budget hard cap is reached, so benchmarks are paused. An Admin can raise the cap.');
  if ([...ps.benchmarks.values()].some((b) => !b.done)) throw conflict('benchmark_running', 'A benchmark is already running.');

  const id = nextId(ps, 'bench');
  const costUsdMicros = benchmarkCost(ps, id);
  // The run is paid for up front. If that spends the last of the budget the project pauses, but the run goes on.
  spendOrPause(ps, { usdMicros: costUsdMicros, source: 'benchmark', epicId: null, workpackId: null, agentId: null });

  const record: BenchmarkRecord = { id, startedMs: nowMs(ps.store), durationMs: pace(ps.store, BENCHMARK_MS), total: BENCHMARK_CASES, done: false };
  ps.benchmarks.set(id, record);
  recordAudit(ps, actor, 'benchmark.started', { benchmarkId: id, total: record.total, costUsdMicros });
  schedule(ps, record.durationMs, `benchmark ${id}`, () => finishBenchmark(ps, record));
  return { benchmarkId: id };
}

function finishBenchmark(ps: ProjectState, record: BenchmarkRecord): void {
  if (record.done) return;
  record.done = true;
  const passed = benchmarkPassed(ps, record.id);
  recordAudit(ps, SYSTEM_ACTOR, 'benchmark.completed', { benchmarkId: record.id, passed, total: record.total });
  emit(ps, { type: 'benchmark.completed', benchmarkId: record.id, passed, total: record.total });
}

/** The newest benchmark, so Overview can show its progress or result after a reload. */
export function latestBenchmark(ps: ProjectState): BenchmarkLatest | null {
  let latest: BenchmarkRecord | undefined;
  for (const record of ps.benchmarks.values()) if (!latest || record.startedMs >= latest.startedMs) latest = record;
  if (!latest) return null;

  const elapsed = Math.max(0, nowMs(ps.store) - latest.startedMs);
  const running = Math.min(latest.total - 1, Math.floor((latest.total * elapsed) / latest.durationMs));
  return {
    id: latest.id,
    running: !latest.done,
    total: latest.total,
    completed: latest.done ? latest.total : running,
    passed: latest.done ? benchmarkPassed(ps, latest.id) : null,
    startedAt: new Date(latest.startedMs).toISOString(),
    finishedAt: latest.done ? new Date(latest.startedMs + latest.durationMs).toISOString() : null,
  };
}
