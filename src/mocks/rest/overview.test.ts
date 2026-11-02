import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BenchmarkLatestSchema,
  BenchmarkStartSchema,
  HealthSchema,
  OverviewMetricsSchema,
  type Attribution,
  type AuditEntry,
  type BenchmarkLatest,
  type Budget,
  type FleetStats,
  type Health,
  type OverviewMetrics,
  type Paged,
  type Problem,
  type Role,
  type Workpack,
} from '../../contracts';
import { chargeSpend, setAgentStatus } from '../backend/runtime';
import { TEST_NOW_MS, addEpic, addWorkpack, advance, createWorld, setSpend, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(TEST_NOW_MS - ms).toISOString();
const ROLE_ORDER: Role[] = ['viewer', 'engineer', 'maintainer', 'admin'];
type Failure = Omit<Problem, 'status'>;

const audit = async (action: string) => (await w.call<Paged<AuditEntry>>('GET', `/audit?action=${action}`)).body.items;

describe('overview metrics', () => {
  const metrics = (query = '', role: Role = 'viewer') => w.call<OverviewMetrics & Failure>('GET', `/overview/metrics${query}`, { role });

  /** Three merges in the last day (one with a human edit), one merge in the day before, and an unmerged workpack. */
  function arrangeMerges() {
    const epic = addEpic(w.ps);
    epic.createdAt = ago(10 * HOUR);
    const merged = (agoMs: number, over: Partial<Workpack> = {}) => {
      const wp = addWorkpack(w.ps, { epicId: epic.id, status: 'done' });
      wp.mergedAt = ago(agoMs);
      return Object.assign(wp, over);
    };
    merged(30 * 60_000);
    merged(2 * HOUR, { humanIntervened: true });
    merged(5 * HOUR);
    merged(30 * HOUR);
    addWorkpack(w.ps, { epicId: epic.id, status: 'awaiting-review' });
  }
  const spend = (usdMicros: number, source: 'workpack' | 'eval' | 'benchmark' | 'preview' | 'intake') =>
    chargeSpend(w.ps, { usdMicros, source, epicId: null, workpackId: null, agentId: null });

  it('defaults to the last 24 hours, with hourly series, and parses against the contract', async () => {
    const res = await metrics();
    expect(res.status).toBe(200);
    const m = OverviewMetricsSchema.parse(res.body);
    expect(m.window).toBe('24h');
    expect(m.updatedAt).toBe(new Date(TEST_NOW_MS).toISOString());
    for (const series of [m.velocity.series, m.zeroIntervention.series, m.costPerMergedPr.series, m.cycle.series]) expect(series).toHaveLength(24);
  });

  it('gives daily series for 7d', async () => {
    const m = OverviewMetricsSchema.parse((await metrics('?window=7d')).body);
    expect(m.window).toBe('7d');
    expect(m.velocity.series).toHaveLength(7);
  });

  it('rejects any other window, naming the field', async () => {
    for (const window of ['30d', '1h', '']) {
      const res = await metrics(`?window=${window}`);
      expect(res.status, window).toBe(422);
      expect(res.body.type).toBe('validation_failed');
      expect(res.body.errors?.[0]?.path).toBe('window');
    }
  });

  it('counts merged workpacks and sets them against the window before', async () => {
    arrangeMerges();
    const m = (await metrics()).body;
    expect(m.velocity).toMatchObject({ merged: 3, perWeek: 21, deltaPct: 200 });
    expect(m.velocity.series.reduce((a, b) => a + b, 0)).toBe(3);
    expect([m.velocity.series[23], m.velocity.series[22], m.velocity.series[19]]).toEqual([1, 1, 1]);

    const week = (await metrics('?window=7d')).body;
    expect(week.velocity).toMatchObject({ merged: 4, perWeek: 4, deltaPct: null });
  });

  it('works out the zero-intervention rate from merged workpacks a human did not touch', async () => {
    arrangeMerges();
    const { zeroIntervention } = (await metrics()).body;
    expect(zeroIntervention.rate).toBeCloseTo(2 / 3, 5);
    expect(zeroIntervention.deltaPts).toBe(-33.3);
  });

  it('divides all spend of any source by the merged workpacks, so failed work raises the cost', async () => {
    arrangeMerges();
    spend(6_000_000, 'workpack');
    spend(1_500_000, 'eval');
    spend(500_000, 'benchmark');
    const { costPerMergedPr } = (await metrics()).body;
    expect(costPerMergedPr.usdMicros).toBe(Math.round(8_000_000 / 3));
    expect(costPerMergedPr.deltaPct).toBeNull();
  });

  it('measures the spec-to-merge cycle from the Epic’s creation to the merge, as p50 and p90', async () => {
    arrangeMerges();
    const { cycle } = (await metrics()).body;
    expect(cycle).toMatchObject({ p50Sec: 28_800, p90Sec: 34_200 });
  });

  it('counts the warn gates in the window against the one before', async () => {
    w.ps.warnEvents.push(
      { gate: 'perf.budgets', at: ago(HOUR) },
      { gate: 'perf.budgets', at: ago(2 * HOUR) },
      { gate: 'perf.budgets', at: ago(30 * HOUR) },
      { gate: 'a11y.scan', at: ago(HOUR) },
    );
    const { warnings } = (await metrics()).body;
    expect(warnings).toEqual({ perf: { count: 2, deltaPct: 100 }, a11y: { count: 1, deltaPct: null }, i18n: { count: 0, deltaPct: null } });
  });

  it('shows no rate, cost or cycle for a project that has merged nothing', async () => {
    const m = (await metrics()).body;
    expect(m.velocity).toMatchObject({ merged: 0, perWeek: 0, deltaPct: null });
    expect(m.zeroIntervention).toMatchObject({ rate: null, deltaPts: null });
    expect(m.costPerMergedPr.usdMicros).toBeNull();
    expect(m.cycle).toMatchObject({ p50Sec: null, p90Sec: null });
  });

  it('is readable by a viewer', async () => {
    expect((await metrics('', 'viewer')).status).toBe(200);
  });
});

describe('system health', () => {
  const health = async () => (await w.call<Health>('GET', '/overview/health', { role: 'viewer' })).body;

  it('lists the six specialists with their live status, parsing against the contract', async () => {
    const res = await w.call<Health>('GET', '/overview/health', { role: 'viewer' });
    expect(res.status).toBe(200);
    const h = HealthSchema.parse(res.body);
    expect(h.specialists.map((s) => [s.agentId, s.name, s.status])).toEqual([
      ['architect-prime', 'Architect-Prime', 'idle'],
      ['codecraft', 'CodeCraft', 'idle'],
      ['gatekeeper', 'GateKeeper', 'idle'],
      ['secops-vanguard', 'SecOps-Vanguard', 'idle'],
      ['docuforge', 'DocuForge', 'idle'],
      ['sentrywatch', 'SentryWatch', 'idle'],
    ]);
    setAgentStatus(w.ps, 'codecraft', 'working');
    setAgentStatus(w.ps, 'gatekeeper', 'degraded');
    const later = await health();
    expect(later.specialists.find((s) => s.agentId === 'codecraft')!.status).toBe('working');
    expect(later.specialists.find((s) => s.agentId === 'gatekeeper')!.status).toBe('degraded');
  });

  it('shows the same three providers as the fleet stats', async () => {
    const stats = (await w.call<FleetStats>('GET', '/fleet/stats')).body;
    expect((await health()).providers).toEqual(stats.providers);
    await w.call('PATCH', '/integrations/deepseek', { role: 'admin', body: { enabled: false } });
    expect((await health()).providers.find((p) => p.id === 'deepseek')!.status).toBe('offline');
  });

  it('has twelve warm sandboxes when nothing runs', async () => {
    expect((await health()).sandboxPool).toMatchObject({ warm: 12, inUse: 0 });
  });

  it('counts a sandbox in use for each workpack in planning, in progress or verification, and no other', async () => {
    for (const status of ['planning', 'in-progress', 'in-progress', 'verification', 'queued', 'awaiting-review', 'done', 'failed'] as const) {
      addWorkpack(w.ps, { status });
    }
    expect((await health()).sandboxPool).toMatchObject({ inUse: 4, warm: 8 });
  });

  it('keeps at least two sandboxes warm however many are in use', async () => {
    for (let i = 0; i < 11; i++) addWorkpack(w.ps, { status: 'in-progress', targetFiles: [`src/file-${i}.ts`] });
    expect((await health()).sandboxPool).toMatchObject({ inUse: 11, warm: 2 });
  });

  it('reports a cold start between 1.8 and 2.6 seconds, steady from call to call', async () => {
    const first = (await health()).sandboxPool.coldStartP95Ms;
    expect(first).toBeGreaterThanOrEqual(1800);
    expect(first).toBeLessThanOrEqual(2600);
    expect((await health()).sandboxPool.coldStartP95Ms).toBe(first);
  });
});

describe('the factory benchmark', () => {
  const start = (role: Role = 'maintainer') => w.call<{ benchmarkId: string } & Failure>('POST', '/benchmarks', { role });
  const latest = async () => (await w.call<BenchmarkLatest | null>('GET', '/benchmarks/latest', { role: 'viewer' })).body;
  const benchmarkSpend = async () => (await w.call<Attribution>('GET', '/budget/attribution?by=source')).body.items.find((i) => i.key === 'benchmark')?.usdMicros ?? 0;
  const completions = () => w.ps.events.ring.filter((e) => e.event.type === 'benchmark.completed');

  it('is for a maintainer', async () => {
    for (const role of ROLE_ORDER.slice(0, 2)) {
      const denied = await start(role);
      expect(denied.status, role).toBe(403);
      expect(denied.body).toMatchObject({ type: 'forbidden', requiredRole: 'maintainer' });
    }
    expect((await start('maintainer')).status).toBe(202);
  });

  it('answers 202 with the benchmark id', async () => {
    const res = await start();
    expect(res.status).toBe(202);
    expect(BenchmarkStartSchema.parse(res.body)).toEqual({ benchmarkId: 'bench-1' });
  });

  it('spends between $18 and $26 up front, attributed to benchmarks', async () => {
    const before = (await w.call<Budget>('GET', '/budget')).body.spendUsdMicros;
    await start();
    const spent = await benchmarkSpend();
    expect(spent).toBeGreaterThanOrEqual(18_000_000);
    expect(spent).toBeLessThanOrEqual(26_000_000);
    expect((await w.call<Budget>('GET', '/budget')).body.spendUsdMicros - before).toBe(spent);
  });

  it('finishes after about twelve seconds with 36 to 40 of 40 passed, and announces it', async () => {
    const { benchmarkId } = (await start()).body;
    advance(w, 11_000);
    expect(completions()).toHaveLength(0);
    advance(w, 1_000);
    expect(completions()).toHaveLength(1);
    const event = completions()[0]!.event as { benchmarkId: string; passed: number; total: number };
    expect(event).toMatchObject({ type: 'benchmark.completed', benchmarkId, total: 40 });
    expect(event.passed).toBeGreaterThanOrEqual(36);
    expect(event.passed).toBeLessThanOrEqual(40);

    advance(w, 30_000);
    expect(completions()).toHaveLength(1);
  });

  it('gives the same cost and the same result every run', async () => {
    await start();
    advance(w, 12_000);
    const first = { spent: await benchmarkSpend(), passed: (completions()[0]!.event as { passed: number }).passed };

    w.close();
    w = createWorld();
    await start();
    advance(w, 12_000);
    expect({ spent: await benchmarkSpend(), passed: (completions()[0]!.event as { passed: number }).passed }).toEqual(first);
  });

  it('runs one at a time: 409 benchmark_running until it finishes, then another may start', async () => {
    await start();
    const second = await start();
    expect(second.status).toBe(409);
    expect(second.body.type).toBe('benchmark_running');
    advance(w, 12_000);
    const third = await start();
    expect(third.status).toBe(202);
    expect(third.body.benchmarkId).toBe('bench-2');
  });

  it('is blocked at the hard cap with 409 budget_blocked, and spends nothing', async () => {
    setSpend(w.ps, w.ps.budget.capUsdMicros);
    const res = await start();
    expect(res.status).toBe(409);
    expect(res.body.type).toBe('budget_blocked');
    expect(await benchmarkSpend()).toBe(0);
    expect(await latest()).toBeNull();
  });

  it('may use up the last of the budget: it still runs, and the project pauses at the cap', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    setSpend(w.ps, w.ps.budget.capUsdMicros - 5_000_000);
    const res = await start();
    expect(res.status).toBe(202);
    const budget = (await w.call<Budget>('GET', '/budget')).body;
    expect(budget).toMatchObject({ hardCapHit: true, spendUsdMicros: w.ps.budget.capUsdMicros });
    expect((await w.call<Workpack>('GET', `/workpacks/${wp.id}`)).body.pausedReasons).toEqual(['budget-hard-cap']);
    advance(w, 12_000);
    expect(completions()).toHaveLength(1);
    expect((await start()).body.type).toBe('budget_blocked');
  });

  it('takes a quarter of the time at 4× speed', async () => {
    w.store.sim.speed = 4;
    await start();
    advance(w, 3_000);
    expect(completions()).toHaveLength(1);
  });

  it('audits the start and the finish', async () => {
    const { benchmarkId } = (await start()).body;
    advance(w, 12_000);
    const [started] = await audit('benchmark.started');
    expect(started).toMatchObject({ actor: 'u-maintainer', target: { benchmarkId, total: 40 } });
    const [finished] = await audit('benchmark.completed');
    expect(finished).toMatchObject({ actor: 'system', actorType: 'system', target: { benchmarkId, total: 40 } });
    expect(finished!.target.passed).toBeGreaterThanOrEqual(36);
  });

  describe('the latest benchmark, for a reload', () => {
    it('is null until one has run, and readable by a viewer', async () => {
      const res = await w.call<BenchmarkLatest | null>('GET', '/benchmarks/latest', { role: 'viewer' });
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it('shows the running benchmark with its progress and no result yet', async () => {
      const { benchmarkId } = (await start()).body;
      expect(BenchmarkLatestSchema.parse(await latest())).toEqual({
        id: benchmarkId,
        running: true,
        total: 40,
        completed: 0,
        passed: null,
        startedAt: new Date(TEST_NOW_MS).toISOString(),
        finishedAt: null,
      });
      advance(w, 6_000);
      expect(await latest()).toMatchObject({ running: true, completed: 20, passed: null });
    });

    it('shows the finished benchmark with its result and finish time', async () => {
      const { benchmarkId } = (await start()).body;
      advance(w, 12_000);
      const done = BenchmarkLatestSchema.parse(await latest());
      expect(done).toMatchObject({ id: benchmarkId, running: false, total: 40, completed: 40, finishedAt: new Date(TEST_NOW_MS + 12_000).toISOString() });
      expect(done.passed).toBe((completions()[0]!.event as { passed: number }).passed);
    });

    it('is always the newest', async () => {
      await start();
      advance(w, 12_000);
      const second = (await start()).body.benchmarkId;
      expect((await latest())!.id).toBe(second);
    });
  });
});
