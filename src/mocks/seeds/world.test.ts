import { afterEach, describe, expect, it } from 'vitest';
import type { Workpack } from '../../contracts';
import { verifyChain } from '../../domain/auditChain';
import { computeKpis } from '../../domain/kpis';
import { advanceClock, budgetView, nowMs } from '../backend/runtime';
import { tickStore } from '../backend/simulator';
import { createStore, type ProjectState, type ScenarioId, type Store } from '../backend/store';
import { TEST_NOW_MS } from '../testing';
import { DOGFOOD_PROJECT_ID, SANDBOX_PROJECT_ID, seedWorld } from './index';

/** Seed a world on a fixed clock so every run sees the same instant. */
async function world(scenario: ScenarioId = 'healthy'): Promise<{ store: Store; ps: ProjectState }> {
  const store = createStore();
  store.clock.fixedMs = TEST_NOW_MS;
  await seedWorld(store, scenario);
  return { store, ps: store.projects.get(DOGFOOD_PROJECT_ID)! };
}

const open = (w: Workpack) => w.status !== 'done' && w.status !== 'failed' && w.status !== 'cancelled';
const running = (ps: ProjectState) => ps.workpacks.filter((w) => ['planning', 'in-progress', 'verification'].includes(w.status));
const stepFor = (store: Store, ms: number, stepMs = 500) => {
  for (let t = 0; t < ms; t += stepMs) {
    advanceClock(store, stepMs);
    tickStore(store);
  }
};

describe('the seeded world obeys the spec before anything runs (healthy scenario)', () => {
  afterEach(() => undefined);

  it('has two projects: the dogfood project, populated, and an empty sandbox', async () => {
    const { store, ps } = await world();
    expect([...store.projects.keys()]).toEqual([DOGFOOD_PROJECT_ID, SANDBOX_PROJECT_ID]);
    expect(ps.project.repo).toBe('BboyAkers/Software-Factory-Studio');
    const sandbox = store.projects.get(SANDBOX_PROJECT_ID)!;
    expect(sandbox.epics).toHaveLength(0);
    expect(sandbox.workpacks).toHaveLength(0);
    expect(sandbox.repository).not.toBeNull();
  });

  it('shows every status on the board, with the Recently ended tray and an archive', async () => {
    const { ps } = await world();
    const count = (status: Workpack['status'], archived = false) => ps.workpacks.filter((w) => w.status === status && w.archived === archived).length;
    for (const status of ['queued', 'planning', 'in-progress', 'verification', 'awaiting-review'] as const) expect(count(status), status).toBeGreaterThan(0);
    expect(count('done')).toBeGreaterThanOrEqual(40);
    expect(count('failed')).toBe(1);
    expect(count('cancelled')).toBe(1);
    expect(count('failed', true) + count('cancelled', true)).toBe(2);
    expect(ps.workpacks.length).toBeGreaterThanOrEqual(65);
  });

  it('keeps the eight slots busy and never exceeds them, with every queued reason on show', async () => {
    const { ps } = await world();
    expect(running(ps)).toHaveLength(8);
    const queued = ps.workpacks.filter((w) => w.status === 'queued');
    const reasons = new Set(queued.map((w) => w.queuedReason));
    expect(reasons).toEqual(new Set(['capacity', 'paused', 'file-lock', 'deps']));
    for (const w of queued.filter((x) => x.queuedReason === 'file-lock')) expect(w.blockedBy).not.toBeNull();
  });

  it('never has more than three attempts, an orphaned workpack, or a dangling dependency', async () => {
    const { ps } = await world();
    const ids = new Set(ps.workpacks.map((w) => w.id));
    for (const w of ps.workpacks) {
      expect(w.attempt, w.id).toBeLessThanOrEqual(3);
      expect(ps.epics.some((e) => e.id === w.epicId), w.id).toBe(true);
      for (const d of w.dependsOn) expect(ids.has(d), `${w.id} → ${d}`).toBe(true);
      expect(w.branch, w.id).toMatch(/^factory\/WP-\d+-/);
      if (w.status === 'done') expect(w.mergedAt, w.id).not.toBeNull();
      if (w.status === 'failed') expect(w.failureReason, w.id).toMatch(/attempts|veto/);
    }
    for (const e of ps.epics) for (const id of e.workpackIds) expect(ids.has(id)).toBe(true);
  });

  it('has a live run, with a scratch pad and reasoning, behind every in-progress workpack', async () => {
    const { ps } = await world();
    for (const w of ps.workpacks.filter((x) => x.status === 'in-progress')) {
      const run = ps.runs.find((r) => r.id === w.activeRunId)!;
      expect(run, w.id).toBeDefined();
      expect(run.endedAt, w.id).toBeNull();
      expect(ps.scratch.has(run.id), w.id).toBe(true);
      expect(ps.logs.get(run.id)?.length ?? 0, w.id).toBeGreaterThan(2);
      expect(ps.reasoning.get(run.id)?.some((s) => s.status === 'active'), w.id).toBe(true);
      expect(w.completeness, w.id).toBeGreaterThan(0);
    }
  });

  it('gives work awaiting review its gate results, screenshots and a PR, and a failed one its failures', async () => {
    const { ps } = await world();
    for (const w of ps.workpacks.filter((x) => x.status === 'awaiting-review')) {
      expect(ps.gateResults.filter((g) => g.workpackId === w.id).length, w.id).toBe(10);
      expect(ps.screenshots.get(w.id)?.length ?? 0, w.id).toBeGreaterThan(0);
      expect(w.prNumber, w.id).not.toBeNull();
    }
    const failed = ps.workpacks.find((w) => w.status === 'failed' && !w.archived)!;
    expect(failed.attempt).toBe(3);
    expect(ps.gateResults.some((g) => g.workpackId === failed.id && g.status === 'failed')).toBe(true);
  });

  it('shows the steering states side by side on the live composer run', async () => {
    const { ps } = await world();
    const composer = ps.workpacks.find((w) => w.title.startsWith('Steering composer'))!;
    const run = ps.runs.find((r) => r.id === composer.activeRunId)!;
    const suggestions = ps.suggestions.filter((s) => s.runId === run.id).map((s) => s.status).sort();
    expect(suggestions).toEqual(['approved', 'pending', 'rejected']);
    const hints = ps.hints.filter((h) => h.runId === run.id);
    expect(hints.some((h) => h.deliveredAt && h.acknowledgedAt)).toBe(true);
    expect(hints.some((h) => h.deliveredAt === null && h.queuedAt !== null)).toBe(true);
    expect(composer.humanLockedFiles).toEqual(['src/pages/mission-control/hooks/useSteer.ts']);
    expect(composer.humanIntervened).toBe(true);
    expect(composer.invariants).toContain('Never log the text of a steering hint');
  });

  it('has a hash chain that verifies end to end, in time order', async () => {
    const { ps } = await world();
    expect(ps.audit.length).toBeGreaterThan(300);
    expect(await verifyChain(ps.audit)).toMatchObject({ ok: true, checked: ps.audit.length });
    for (let i = 1; i < ps.audit.length; i++) {
      expect(Date.parse(ps.audit[i]!.createdAt), `entry ${i}`).toBeGreaterThanOrEqual(Date.parse(ps.audit[i - 1]!.createdAt));
    }
  });

  it('has Epics at every stage, each with locked contracts once past stage 1', async () => {
    const { ps } = await world();
    const byStatus = (s: string) => ps.epics.filter((e) => e.status === s);
    expect(byStatus('completed')).toHaveLength(5);
    expect(byStatus('executing').length).toBeGreaterThanOrEqual(5);
    expect(byStatus('stage-2')).toHaveLength(1);
    expect(byStatus('intake')).toHaveLength(1);
    for (const e of byStatus('completed')) expect(e.completedAt, e.id).not.toBeNull();
    for (const e of [...byStatus('completed'), ...byStatus('executing')]) {
      const contracts = ps.contracts.filter((c) => c.epicId === e.id);
      expect(contracts.length, e.id).toBeGreaterThanOrEqual(3);
      expect(ps.dags.get(e.id)?.length, e.id).toBe(e.workpackIds.length);
    }
  });

  it('records intake outcomes of every kind and keeps one GitHub issue per Epic', async () => {
    const { ps } = await world();
    expect(new Set(ps.intake.map((e) => e.outcome))).toEqual(new Set(['accepted', 'duplicate', 'rejected']));
    expect(ps.intake.some((e) => e.code === 'unsupported_language')).toBe(true);
    for (const e of ps.epics) expect(ps.issues.filter((i) => i.url === e.sourceRef)).toHaveLength(1);
  });

  it('is within budget with a projection that does not alarm, and a runway that outlasts the month', async () => {
    const { store, ps } = await world();
    const b = budgetView(ps);
    expect(b.hardCapHit).toBe(false);
    expect(b.softLimitHit).toBe(false);
    expect(b.percentUsed).toBeGreaterThan(8);
    expect(b.percentUsed).toBeLessThan(40);
    expect(b.projectedSpendUsdMicros).toBeLessThan(b.monthlyCapUsdMicros);
    const hoursLeft = (Date.parse(b.periodEnd) - nowMs(store)) / 3_600_000;
    expect(b.runway!.days * 24 + b.runway!.hours).toBeGreaterThan(hoursLeft * 0.8);
  });

  it('has two weeks of delivery behind the Overview, trending up, with the cost of failed work in the price', async () => {
    const { store, ps } = await world();
    const input = (window: '24h' | '7d') => ({
      workpacks: ps.workpacks,
      epicCreatedAt: Object.fromEntries(ps.epics.map((e) => [e.id, e.createdAt])),
      spend: ps.spend.map((s) => ({ at: s.at, usdMicros: s.usdMicros })),
      warnings: ps.warnEvents,
      now: new Date(nowMs(store)),
      window,
    });
    const week = computeKpis(input('7d'));
    expect(week.velocity.merged).toBeGreaterThan(12);
    expect(week.velocity.deltaPct).toBeGreaterThan(0);
    expect(week.zeroIntervention.rate).toBeGreaterThan(0.7);
    expect(week.costPerMergedPr.usdMicros).toBeGreaterThan(1_000_000);
    expect(week.cycle.p50Sec).not.toBeNull();
    expect(week.warnings.perf.count + week.warnings.a11y.count + week.warnings.i18n.count).toBeGreaterThan(0);
    expect(computeKpis(input('24h')).velocity.merged).toBeGreaterThan(0);
  });

  it('is deterministic: the same clock and seed build the same world', async () => {
    const a = await world();
    const b = await world();
    expect(b.ps.workpacks.map((w) => `${w.id}:${w.status}:${w.completeness}`)).toEqual(a.ps.workpacks.map((w) => `${w.id}:${w.status}:${w.completeness}`));
    expect(b.ps.audit.at(-1)!.hash).toBe(a.ps.audit.at(-1)!.hash);
  });
});

describe('the scenario presets', () => {
  it('soft-limit puts spend at 82% of the cap without pausing anything', async () => {
    const { ps } = await world('soft-limit');
    const b = budgetView(ps);
    expect(b).toMatchObject({ softLimitHit: true, hardCapHit: false, pausedRuns: 0 });
    expect(b.percentUsed).toBeCloseTo(82, 0);
  });

  it('hard-cap pauses every open workpack for the budget and fails none of them', async () => {
    const { ps } = await world('hard-cap');
    const b = budgetView(ps);
    expect(b.hardCapHit).toBe(true);
    const openWork = ps.workpacks.filter(open);
    expect(b.pausedRuns).toBe(openWork.length);
    for (const w of openWork) expect(w.pausedReasons, w.id).toContain('budget-hard-cap');
    expect(ps.workpacks.filter((w) => w.status === 'failed' && !w.archived)).toHaveLength(1);
    expect(ps.workpacks.filter((w) => w.status === 'queued').every((w) => w.queuedReason === 'budget')).toBe(true);
  });

  it('gate-failures raises the blocking failure rate to 60%', async () => {
    const { store } = await world('gate-failures');
    expect(store.sim.gateFailureRate).toBe(0.6);
    expect(store.sim.scenario).toBe('gate-failures');
  });

  it('sla-pressure puts several open P0/P1 workpacks within the hour of breaching', async () => {
    const { store, ps } = await world('sla-pressure');
    const soon = ps.workpacks.filter((w) => open(w) && w.slaDueAt && Date.parse(w.slaDueAt) - nowMs(store) < 45 * 60_000 && Date.parse(w.slaDueAt) > nowMs(store));
    expect(soon.length).toBeGreaterThanOrEqual(3);
    stepFor(store, 60 * 60_000, 60_000);
    expect(ps.workpacks.filter((w) => w.slaBreached).length).toBeGreaterThanOrEqual(3);
    for (const w of ps.workpacks.filter((x) => x.slaBreached && open(x))) expect(w.priority).toMatch(/^P[01]/);
  });

  it('quiet leaves the project with no data and every empty state to see, but a working platform', async () => {
    const { store, ps } = await world('quiet');
    expect(ps.epics).toHaveLength(0);
    expect(ps.workpacks).toHaveLength(0);
    expect(ps.intake).toHaveLength(0);
    expect(budgetView(ps).spendUsdMicros).toBe(0);
    expect(store.projects.size).toBe(2);
  });
});

describe('the seeded world keeps obeying the spec while the simulator runs', () => {
  it('stays within capacity and attempts, keeps the audit chain valid, and makes things happen', async () => {
    const { store, ps } = await world();
    const before = ps.workpacks.map((w) => `${w.id}:${w.status}`).join();
    for (let minute = 0; minute < 6; minute++) {
      stepFor(store, 60_000, 500);
      expect(running(ps).length, `minute ${minute}`).toBeLessThanOrEqual(8);
      for (const w of ps.workpacks) expect(w.attempt, `${w.id} minute ${minute}`).toBeLessThanOrEqual(3);
    }
    expect(ps.workpacks.map((w) => `${w.id}:${w.status}`).join()).not.toBe(before);
    expect(ps.workpacks.length).toBeGreaterThan(71);
    const finished = ps.epics.find((e) => e.title === 'Connect repository wizard')!;
    expect(finished.status).toBe('executing');
    await ps.auditQueue;
    expect(await verifyChain(ps.audit)).toMatchObject({ ok: true });
  });
});
