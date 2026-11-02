import { GATE_CATALOG, checkRunName, gateEntry, type GateFailure, type GateId, type GateResult, type GateStatus, type Metric, type Run, type Workpack } from '../../contracts';
import { hash32 } from './codegen';
import { refreshGateSummary, touchesSchema } from './quality';
import { emit, nextId, nowIso, pace, rngOf, schedule } from './runtime';
import { captureMatrix, routesFor } from './screenshots';
import type { ProjectState } from './store';

export type PlannedOutcome = 'passed' | 'failed' | 'quarantined' | 'skipped';
export type GatePlan = Record<GateId, PlannedOutcome>;

/** Blocking gates, weighted by how often each one is the cause of a failure. */
const FAILURE_WEIGHTS: [GateId, number][] = [
  ['tests.unit_integration', 35],
  ['static.types_lint', 20],
  ['tests.e2e_viewports', 20],
  ['security.sast_sbom', 10],
  ['contract.conformance', 8],
  ['diff.scope', 7],
];

/** When each gate starts and ends, in multiples of `tuning.gateMs`. */
const TIMELINE: Record<GateId, [start: number, end: number]> = {
  'static.types_lint': [0, 0.5],
  'contract.conformance': [0, 0.4],
  'diff.scope': [0, 0.3],
  'security.sast_sbom': [0.3, 1.2],
  'tests.unit_integration': [0.5, 1.4],
  'migration.safety': [0.5, 0.9],
  'tests.e2e_viewports': [1.2, 2.4],
  'perf.budgets': [1.4, 2.0],
  'a11y.scan': [1.4, 2.1],
  'i18n.check': [1.4, 1.8],
};

// ---------------------------------------------------------------------------
// Planning: which gates will fail on this run
// ---------------------------------------------------------------------------

/** Later attempts fail a little less often: the agent has the previous failures to work from. */
const attemptFactor = (attempt: number): number => (attempt <= 1 ? 1 : attempt === 2 ? 0.85 : 0.7);

export function planGates(ps: ProjectState, wp: Workpack, run: Pick<Run, 'attempt'>): GatePlan {
  const rng = rngOf(ps.store);
  const plan = {} as GatePlan;
  for (const gate of GATE_CATALOG) plan[gate.id] = 'passed';
  if (!touchesSchema(wp)) plan['migration.safety'] = 'skipped';

  const rate = ps.store.sim.gateFailureRate * attemptFactor(run.attempt);
  const failing = new Set<GateId>();
  if (rng.chance(rate)) {
    const total = FAILURE_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
    let roll = rng.next() * total;
    for (const [gate, weight] of FAILURE_WEIGHTS) {
      roll -= weight;
      if (roll <= 0) {
        failing.add(gate);
        break;
      }
    }
    if (rng.chance(rate / 3)) failing.add(rng.pick(FAILURE_WEIGHTS)[0]);
  }
  for (const gate of failing) plan[gate] = 'failed';

  for (const gate of GATE_CATALOG) if (gate.severity === 'warn' && rng.chance(0.15)) plan[gate.id] = 'failed';
  if (rng.chance(0.1)) {
    const flaky = rng.pick<GateId>(['tests.unit_integration', 'tests.e2e_viewports']);
    if (plan[flaky] === 'passed') plan[flaky] = 'quarantined';
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Content of a result
// ---------------------------------------------------------------------------

const primaryFile = (wp: Workpack): string => wp.targetFiles.find((f) => !f.includes('*')) ?? 'src/index.ts';

function excerpt(file: string, line: number, lines: string[]): string {
  const start = Math.max(1, line - 2);
  const rows = lines.map((text, i) => `${String(start + i).padStart(4)} | ${text}`);
  rows.splice(2, 0, `     | ${' '.repeat(6)}^^^^^^^^`);
  return `${file}\n${rows.join('\n')}`;
}

function failuresFor(wp: Workpack, gate: GateId, seed: number): GateFailure[] {
  const file = primaryFile(wp);
  const line = 10 + (seed % 70);
  const code = ['const result = await load(id);', 'if (!result) return null;', 'return result.items.map((item) => item.value);', '}', ''];
  switch (gate) {
    case 'static.types_lint':
      return [{ file, line, message: "Type 'string | undefined' is not assignable to type 'string'.", excerpt: excerpt(file, line, code) }];
    case 'tests.unit_integration': {
      const test = wp.targetFiles.find((f) => /\.(test|spec)\./.test(f)) ?? file.replace(/\.tsx?$/, '.test.ts');
      return [{ file: test, line, message: `AssertionError: expected ${1 + (seed % 5)} to equal ${6 + (seed % 3)}`, excerpt: excerpt(test, line, ["it('retries with backoff', async () => {", '  const attempts = await run();', '  expect(attempts).toBe(3);', '});', '']) }];
    }
    case 'tests.e2e_viewports':
      return [{ file: `tests/e2e/${routesFor(wp.targetFiles)[0]?.slice(1) || 'home'}.spec.ts`, line: 8, message: 'Locator getByRole("main") resolved to a hidden element at the mobile viewport.', excerpt: excerpt('tests/e2e/page.spec.ts', 8, ["await page.setViewportSize({ width: 390, height: 844 });", "await page.goto('/');", "await expect(page.getByRole('main')).toBeVisible();", '', ''])}];
    case 'security.sast_sbom':
      return [{ file, line, message: 'semgrep: javascript.lang.security.audit.unvalidated-redirect (high)', excerpt: excerpt(file, line, ['const next = req.query.next;', 'res.redirect(next);', '', '', ''])}];
    case 'contract.conformance':
      return [{ file: 'contracts/shared.ts', line: 3, message: 'A locked contract was modified: contracts/shared.ts', excerpt: excerpt('contracts/shared.ts', 3, ['export interface Command {', '-  id: string;', '+  id: number;', '}', ''])}];
    case 'diff.scope':
      return [{ file: 'src/unrelated/helper.ts', line: 1, message: 'File changed outside the workpack’s target files.', excerpt: 'src/unrelated/helper.ts is not matched by any target file glob.' }];
    case 'perf.budgets':
      return [{ file: 'dist/assets/index.js', line: 1, message: `Bundle grew by ${12 + (seed % 20)} kB (budget 10 kB).`, excerpt: 'dist/assets/index.js  +' + (12 + (seed % 20)) + ' kB gzip' }];
    case 'a11y.scan':
      return [{ file, line, message: 'Button has no accessible name (critical).', excerpt: excerpt(file, line, ['<button onClick={save}>', '  <Icon name="save" />', '</button>', '', ''])}];
    case 'i18n.check':
      return [{ file, line, message: 'Hard-coded user-facing string; use a message key.', excerpt: excerpt(file, line, ['<h2>', '  Save your changes', '</h2>', '', ''])}];
    case 'migration.safety':
      return [{ file: 'migrations/0042_drop_column.sql', line: 4, message: 'Destructive column drop without a backfill.', excerpt: 'ALTER TABLE invoices DROP COLUMN legacy_ref;' }];
  }
}

function metricsFor(wp: Workpack, gate: GateId, outcome: PlannedOutcome, seed: number): Metric[] {
  const between = (min: number, max: number) => min + (seed % (max - min + 1));
  const failed = outcome === 'failed';
  switch (gate) {
    case 'static.types_lint':
      return [{ label: 'tsc errors', value: failed ? String(between(1, 4)) : '0' }, { label: 'lint warnings', value: '0' }];
    case 'tests.unit_integration': {
      const total = between(18, 64);
      const bad = failed ? between(1, 3) : 0;
      return [
        { label: 'tests', value: bad ? `${total - bad} passed, ${bad} failed` : `${total} passed` },
        { label: 'coverage (changed lines)', value: `${failed ? between(61, 79) : between(81, 96)}%` },
      ];
    }
    case 'tests.e2e_viewports': {
      const runs = routesFor(wp.targetFiles).length * 9;
      const bad = failed ? between(1, 2) : 0;
      return [{ label: 'viewport runs', value: bad ? `${runs - bad} passed, ${bad} failed` : `${runs} passed` }, { label: 'screenshots', value: `${runs} captured` }];
    }
    case 'security.sast_sbom':
      return [{ label: 'new findings', value: failed ? '1 high · 0 critical' : '0 high · 0 critical' }, { label: 'licenses', value: 'policy clean' }];
    case 'contract.conformance':
      return [{ label: 'locked contracts changed', value: failed ? '1' : '0' }, { label: 'breaking API changes', value: '0' }];
    case 'diff.scope':
      return [{ label: 'files outside scope', value: failed ? '1' : '0' }, { label: 'human-locked files touched', value: '0' }];
    case 'perf.budgets':
      return [{ label: 'bundle delta', value: failed ? `+${12 + (seed % 20)} kB` : `+${(seed % 30) / 10} kB` }, { label: 'LCP p95', value: `${(1.4 + (seed % 9) / 10).toFixed(1)} s` }];
    case 'a11y.scan':
      return [{ label: 'new critical issues', value: failed ? '1' : '0' }, { label: 'pages scanned', value: String(routesFor(wp.targetFiles).length) }];
    case 'i18n.check':
      return [{ label: 'missing keys', value: failed ? String(between(1, 3)) : '0' }];
    case 'migration.safety':
      return outcome === 'skipped' ? [{ label: 'Reason', value: 'No migration in this diff' }] : [{ label: 'dry run', value: failed ? 'failed' : 'passed' }];
  }
}

function statusOf(outcome: PlannedOutcome): GateStatus {
  return outcome === 'quarantined' ? 'quarantined' : outcome;
}

function seedOf(wp: Workpack, run: Pick<Run, 'id'>, gate: GateId): number {
  return hash32(`${wp.id}|${run.id}|${gate}`);
}

function newResult(ps: ProjectState, wp: Workpack, run: Run, gate: GateId, startedAt: string): GateResult {
  const entry = gateEntry(gate);
  return {
    id: nextId(ps, 'gate'),
    workpackId: wp.id,
    runId: run.id,
    gate,
    severity: entry.severity,
    status: 'queued',
    metrics: [],
    failures: [],
    checkRun: checkRunName(gate),
    startedAt,
    finishedAt: null,
  };
}

/** Fill a result with its final status, metrics, failures, and (for e2e) the screenshot matrix. */
function finishResult(ps: ProjectState, wp: Workpack, run: Run, result: GateResult, outcome: PlannedOutcome, at: string): void {
  const seed = seedOf(wp, run, result.gate);
  result.status = statusOf(outcome);
  result.severity = outcome === 'quarantined' ? 'quarantine' : gateEntry(result.gate).severity;
  result.metrics = metricsFor(wp, result.gate, outcome, seed);
  result.failures = outcome === 'failed' ? failuresFor(wp, result.gate, seed) : [];
  result.finishedAt = at;

  if (outcome === 'failed' && gateEntry(result.gate).severity === 'warn') {
    const warn = result.gate as 'perf.budgets' | 'a11y.scan' | 'i18n.check';
    ps.warnEvents.push({ gate: warn, at });
  }
  if (outcome === 'quarantined') {
    const list = ps.quarantined.get(wp.id) ?? [];
    const file = result.gate === 'tests.e2e_viewports' ? `tests/e2e/${routesFor(wp.targetFiles)[0]?.slice(1) || 'home'}.spec.ts` : (wp.targetFiles.find((f) => /\.(test|spec)\./.test(f)) ?? `${primaryFile(wp).replace(/\.tsx?$/, '')}.test.ts`);
    list.push({ name: `retries after a transient network error (${wp.id})`, file, retries: ['failed', 'passed'], issueUrl: `https://github.com/${ps.repository?.fullName ?? ps.project.repo}/issues/${100 + (seed % 800)}` });
    ps.quarantined.set(wp.id, list);
  }
  if (result.gate === 'tests.e2e_viewports' && outcome !== 'skipped') {
    ps.screenshots.set(
      wp.id,
      captureMatrix({
        idFor: () => nextId(ps, 'shot'),
        title: wp.title,
        targetFiles: wp.targetFiles,
        capturedAt: at,
        failingRoute: outcome === 'failed' ? (routesFor(wp.targetFiles)[0] ?? null) : null,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Synchronous: every gate final at once (seeds and tests)
// ---------------------------------------------------------------------------

/** Record a finished gate run. Gates not mentioned pass (migration safety is skipped without a schema change). */
export function recordGateResults(ps: ProjectState, wp: Workpack, run: Run, outcomes: Partial<GatePlan> = {}): GateResult[] {
  const at = nowIso(ps.store);
  const results = GATE_CATALOG.map((g) => {
    const outcome = outcomes[g.id] ?? (g.id === 'migration.safety' && !touchesSchema(wp) ? 'skipped' : 'passed');
    const result = newResult(ps, wp, run, g.id, at);
    finishResult(ps, wp, run, result, outcome, at);
    return result;
  });
  ps.gateResults.push(...results);
  refreshGateSummary(ps, wp);
  return results;
}

// ---------------------------------------------------------------------------
// Asynchronous: the simulator runs the gates over time
// ---------------------------------------------------------------------------

export interface GateRunSummary {
  plan: GatePlan;
  /** Blocking gates that failed. */
  blockingFailures: GateId[];
}

/**
 * Start the ten gates for a run. Each one goes queued → running → final on the timeline above,
 * announcing every change, and `onComplete` fires once all ten are final.
 */
export function startGateRun(ps: ProjectState, wp: Workpack, run: Run, onComplete: (summary: GateRunSummary) => void): void {
  const plan = planGates(ps, wp, run);
  const gateMs = ps.store.tuning.gateMs;
  const startedAt = nowIso(ps.store);
  const results = GATE_CATALOG.map((g) => newResult(ps, wp, run, g.id, startedAt));
  ps.gateResults.push(...results);
  refreshGateSummary(ps, wp);
  for (const r of results) emit(ps, { type: 'gate.updated', workpackId: wp.id, gate: r.gate, severity: r.severity, status: r.status, metrics: r.metrics });

  let remaining = results.length;
  const live = () => wp.status === 'verification' && run.status !== 'cancelled' && run.status !== 'failed';

  for (const result of results) {
    const [start, end] = TIMELINE[result.gate];
    schedule(ps, pace(ps.store, start * gateMs), `${wp.id} ${result.gate} running`, () => {
      if (!live()) return;
      result.status = 'running';
      refreshGateSummary(ps, wp);
      emit(ps, { type: 'gate.updated', workpackId: wp.id, gate: result.gate, severity: result.severity, status: 'running', metrics: [] });
    });
    schedule(ps, pace(ps.store, end * gateMs), `${wp.id} ${result.gate} done`, () => {
      if (!live()) return;
      finishResult(ps, wp, run, result, plan[result.gate], nowIso(ps.store));
      refreshGateSummary(ps, wp);
      emit(ps, { type: 'gate.updated', workpackId: wp.id, gate: result.gate, severity: result.severity, status: result.status, metrics: result.metrics });
      remaining -= 1;
      if (remaining === 0) {
        const blockingFailures = results.filter((r) => r.status === 'failed' && r.severity === 'block').map((r) => r.gate);
        onComplete({ plan, blockingFailures });
      }
    });
  }
}
