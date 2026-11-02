import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContractSchema, GateResultSchema, ReleaseSchema, ReproBundleSchema, ScreenshotSchema, type Contract, type GatesResponse, type Priority, type Problem, type Release, type ReproBundle, type Screenshot, type Workpack } from '../../contracts';
import { recordGateResults, type GatePlan } from '../backend/gates';
import { flushAudit } from '../backend/runtime';
import { advance, addWorkpack, createWorld, eventTypes, type Result, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

const DAY = 86_400_000;

/** A workpack waiting for review whose latest gate run has the given outcomes (all pass by default). */
function reviewable(priority: Priority = 'P2 Normal', outcomes: Partial<GatePlan> = {}, targetFiles = ['src/billing/service.ts']) {
  const wp = addWorkpack(w.ps, { status: 'awaiting-review', priority, targetFiles });
  const run = w.ps.runs.find((r) => r.workpackId === wp.id)!;
  recordGateResults(w.ps, wp, run, outcomes);
  return wp;
}
const gates = async (id: string) => (await w.call<GatesResponse>('GET', `/workpacks/${id}/gates`)).body;
const release = async (id: string) => (await w.call<Release>('GET', `/workpacks/${id}/release`)).body;
const promote = (wp: Workpack, role: 'engineer' | 'maintainer' = 'maintainer') =>
  w.call<Result<Workpack>>('POST', `/workpacks/${wp.id}/promote`, { role, headers: { 'if-match': String(wp.version) } });

describe('gate results (spec §8)', () => {
  it('lists the ten gates in order with severity, check-run name and metrics', async () => {
    const wp = reviewable();
    const { results } = await gates(wp.id);
    expect(results).toHaveLength(10);
    results.forEach((r) => GateResultSchema.parse(r));
    expect(results.map((r) => r.checkRun)).toEqual([
      'factory/gates/01-types-lint',
      'factory/gates/02-unit-integration',
      'factory/gates/03-e2e-viewports',
      'factory/gates/04-security',
      'factory/gates/05-contract',
      'factory/gates/06-diff-scope',
      'factory/gates/07-perf',
      'factory/gates/08-a11y',
      'factory/gates/09-i18n',
      'factory/gates/10-migration',
    ]);
    expect(results.filter((r) => r.severity === 'block')).toHaveLength(7);
    expect(results.filter((r) => r.severity === 'warn').map((r) => r.gate)).toEqual(['perf.budgets', 'a11y.scan', 'i18n.check']);
    expect(results.find((r) => r.gate === 'migration.safety')).toMatchObject({ status: 'skipped' });
    expect(results.find((r) => r.gate === 'tests.unit_integration')!.metrics.length).toBeGreaterThan(0);
  });

  it('gives a failed gate its file, line, message and an excerpt within 8 KB', async () => {
    const wp = reviewable('P2 Normal', { 'tests.unit_integration': 'failed' });
    const failed = (await gates(wp.id)).results.find((r) => r.gate === 'tests.unit_integration')!;
    expect(failed.status).toBe('failed');
    expect(failed.failures).toHaveLength(1);
    const [failure] = failed.failures;
    expect(failure).toMatchObject({ file: expect.stringMatching(/\.test\.ts$/), message: expect.stringMatching(/expected/) });
    expect(failure!.line).toBeGreaterThan(0);
    expect(failure!.excerpt.length).toBeGreaterThan(10);
    expect(failure!.excerpt.length).toBeLessThanOrEqual(8 * 1024);
  });

  it('quarantines a flaky test with its retries and a tracking issue, and it does not count as a failure', async () => {
    const wp = reviewable('P2 Normal', { 'tests.e2e_viewports': 'quarantined' });
    const body = await gates(wp.id);
    expect(body.results.find((r) => r.gate === 'tests.e2e_viewports')).toMatchObject({ status: 'quarantined', severity: 'quarantine' });
    expect(body.quarantined).toEqual([expect.objectContaining({ retries: ['failed', 'passed'], issueUrl: expect.stringContaining('github.com/acme/app/issues/') })]);
    expect((await release(wp.id)).canPromote).toBe(true);
  });

  it('shows only the newest run when a workpack was retried', async () => {
    const wp = reviewable('P2 Normal', { 'static.types_lint': 'failed' });
    const second = { ...w.ps.runs.find((r) => r.workpackId === wp.id)!, id: 'run-retry', attempt: 2 };
    w.ps.runs.push(second);
    advance(w, 5_000);
    recordGateResults(w.ps, wp, second, {});
    const body = await gates(wp.id);
    expect(new Set(body.results.map((r) => r.runId))).toEqual(new Set(['run-retry']));
    expect(body.results.every((r) => r.status !== 'failed')).toBe(true);
  });

  it('summarizes the gates on the workpack for board cards', async () => {
    const wp = reviewable('P2 Normal', { 'security.sast_sbom': 'failed' });
    const detail = (await w.call<Workpack>('GET', `/workpacks/${wp.id}`)).body;
    expect(detail.gateSummary).toEqual({ total: 10, passed: 8, failed: 1, running: 0 });
  });
});

describe('screenshot matrix (spec §8.1)', () => {
  it('is empty until the e2e gate has run', async () => {
    const wp = addWorkpack(w.ps, { status: 'verification' });
    expect((await w.call<Screenshot[]>('GET', `/workpacks/${wp.id}/screenshots`)).body).toEqual([]);
  });

  it('holds one capture per route, viewport and browser, kept for 30 days', async () => {
    const wp = reviewable('P2 Normal', {}, ['src/pages/task-matrix/TaskMatrix.tsx']);
    const shots = (await w.call<Screenshot[]>('GET', `/workpacks/${wp.id}/screenshots`)).body;
    shots.forEach((s) => ScreenshotSchema.parse(s));
    expect(shots).toHaveLength(2 * 3 * 3);
    expect(new Set(shots.map((s) => s.route))).toEqual(new Set(['/task-matrix', '/task-matrix/details']));
    expect(new Set(shots.map((s) => `${s.viewport}:${s.width}x${s.height}`))).toEqual(new Set(['desktop:1440x900', 'tablet:768x1024', 'mobile:390x844']));
    expect(new Set(shots.map((s) => s.browser))).toEqual(new Set(['chromium', 'firefox', 'webkit']));
    expect(shots.every((s) => s.uri.startsWith('data:image/svg+xml'))).toBe(true);
    expect(Date.parse(shots[0]!.expiresAt) - Date.parse(shots[0]!.capturedAt)).toBe(30 * DAY);
    expect(new Set(shots.map((s) => s.uri)).size).toBeGreaterThan(9);
  });
});

describe('release and sign-off (spec §8.1, §5.1 rule 18)', () => {
  it('can be promoted when every blocking gate passed, and P2 needs no sign-off', async () => {
    const wp = reviewable('P2 Normal');
    const r = await release(wp.id);
    ReleaseSchema.parse(r);
    expect(r).toMatchObject({ canPromote: true, unmet: [], merged: false, deployment: null, noDeploymentReported: false });
    expect(r.signoff.map((s) => [s.id, s.state])).toEqual([
      ['blocking-gates', 'met'],
      ['secops-veto', 'met'],
      ['human-signoff', 'na'],
      ['contract-conformance', 'met'],
    ]);
  });

  it('requires sign-off for P0, P1 and schema changes, but promoting is that sign-off so it never blocks', async () => {
    for (const wp of [reviewable('P0 Blocker'), reviewable('P1 High'), reviewable('P2 Normal', {}, ['migrations/0043_add_index.sql'])]) {
      const r = await release(wp.id);
      expect(r.signoff.find((s) => s.id === 'human-signoff'), wp.id).toMatchObject({ state: 'unmet' });
      expect(r.signoff.find((s) => s.id === 'human-signoff')!.detail).toMatch(/promoting records it/i);
      expect(r.canPromote, wp.id).toBe(true);
    }
  });

  it('does not require sign-off when that policy is off', async () => {
    w.ps.policies.humanSignoffP0P1Schema = false;
    const r = await release(reviewable('P0 Blocker').id);
    expect(r.signoff.find((s) => s.id === 'human-signoff')!.state).toBe('na');
  });

  it('blocks promotion on a failed blocking gate and names it', async () => {
    const wp = reviewable('P2 Normal', { 'security.sast_sbom': 'failed' });
    const r = await release(wp.id);
    expect(r.canPromote).toBe(false);
    expect(r.unmet.join(' ')).toMatch(/Security/);
    expect(r.signoff.find((s) => s.id === 'blocking-gates')).toMatchObject({ state: 'unmet' });
  });

  it('never blocks promotion for a warn-only gate', async () => {
    const wp = reviewable('P2 Normal', { 'perf.budgets': 'failed', 'a11y.scan': 'failed', 'i18n.check': 'failed' });
    expect((await release(wp.id)).canPromote).toBe(true);
  });

  it('blocks promotion on a SecOps-Vanguard veto', async () => {
    const wp = reviewable('P2 Normal');
    w.ps.vetoed.add(wp.id);
    const r = await release(wp.id);
    expect(r.canPromote).toBe(false);
    expect(r.signoff.find((s) => s.id === 'secops-veto')).toMatchObject({ state: 'unmet' });
  });

  it('blocks promotion for a workpack that is not awaiting review', async () => {
    const wp = addWorkpack(w.ps, { status: 'verification' });
    const r = await release(wp.id);
    expect(r.canPromote).toBe(false);
    expect(r.unmet[0]).toMatch(/verification, not awaiting review/);
  });

  it('renders the PR body with every section the spec lists', async () => {
    const wp = reviewable('P2 Normal', { 'tests.e2e_viewports': 'quarantined' }, ['src/pages/task-matrix/TaskMatrix.tsx']);
    const body = (await release(wp.id)).prBodyMarkdown;
    for (const heading of ['## Summary', '## Changes', '## New dependencies', '## Gate results', '## Quarantined flaky tests', '## Screenshots', '## Cost', '## Transcript']) {
      expect(body, heading).toContain(heading);
    }
    expect(body).toContain('factory/gates/01-types-lint');
    expect(body).toContain('18 captures');
  });

  it('reports each check run with its conclusion', async () => {
    const wp = reviewable('P2 Normal', { 'tests.unit_integration': 'failed', 'perf.budgets': 'failed' });
    const { checkRuns } = await release(wp.id);
    expect(checkRuns).toHaveLength(10);
    expect(checkRuns.find((c) => c.name.endsWith('02-unit-integration'))!.status).toBe('failure');
    expect(checkRuns.find((c) => c.name.endsWith('07-perf'))!.status).toBe('neutral');
    expect(checkRuns.find((c) => c.name.endsWith('01-types-lint'))!.status).toBe('success');
  });
});

describe('promoting (approve and merge)', () => {
  it('merges to done, assigns the PR, and starts a staging deployment that follows its events', async () => {
    const wp = reviewable('P2 Normal');
    const res = await promote(wp);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'done', completeness: 100 });
    expect(res.body.mergedAt).not.toBeNull();
    expect(res.body.prNumber).toBeGreaterThan(400);

    expect((await release(wp.id)).deployment).toMatchObject({ status: 'queued', environment: 'staging' });
    advance(w, 4_000);
    expect((await release(wp.id)).deployment!.status).toBe('in-progress');
    advance(w, 6_000);
    const final = (await release(wp.id)).deployment!;
    expect(['succeeded', 'failed']).toContain(final.status);
    expect(final.url !== null).toBe(final.status === 'succeeded');
    const statuses = w.ps.events.ring.map((e) => e.event).filter((e) => e.type === 'deploy.status').map((e) => (e as { status: string }).status);
    expect(statuses.slice(0, 2)).toEqual(['queued', 'in-progress']);
    expect(await release(wp.id)).toMatchObject({ merged: true, canPromote: false });
  });

  it('records who promoted it in the audit chain', async () => {
    const wp = reviewable('P1 High');
    await promote(wp);
    await flushAudit(w.ps);
    expect(w.ps.audit.find((e) => e.action === 'workpack.merged')).toMatchObject({ actorName: 'Test maintainer', target: { workpackId: wp.id } });
  });

  it('forbids an engineer', async () => {
    const wp = reviewable('P2 Normal');
    const res = await promote(wp, 'engineer');
    expect(res.status).toBe(403);
    expect(res.body.requiredRole).toBe('maintainer');
  });

  it('refuses with 409 while a blocking gate has failed, and says why', async () => {
    const wp = reviewable('P2 Normal', { 'diff.scope': 'failed' });
    const res = await promote(wp);
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/Diff scope/);
    expect((await w.call<Workpack>('GET', `/workpacks/${wp.id}`)).body.status).toBe('awaiting-review');
  });

  it('refuses a workpack that is not awaiting review and a stale version', async () => {
    const running = addWorkpack(w.ps, { status: 'in-progress' });
    expect((await promote(running)).status).toBe(409);

    const wp = reviewable('P2 Normal');
    const stale = await w.call<Problem>('POST', `/workpacks/${wp.id}/promote`, { role: 'maintainer', headers: { 'if-match': String(wp.version - 1) } });
    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe('stale_version');
  });

  it('says "no deployment reported" when none arrives within 30 minutes of the merge', async () => {
    const wp = reviewable('P2 Normal');
    await promote(wp);
    // GitHub never reports a deployment: drop the simulated events that would have arrived.
    w.ps.timers.length = 0;
    w.ps.deployments.delete(wp.id);
    expect((await release(wp.id)).noDeploymentReported).toBe(false);
    advance(w, 31 * 60_000, 60_000);
    expect((await release(wp.id)).noDeploymentReported).toBe(true);
  });
});

describe('contracts and unlocking (spec §7.3, §16.7)', () => {
  const attach = (wp: Workpack, locked = true): Contract => {
    const contract: Contract = {
      id: `ctr-${w.ps.contracts.length + 1}`,
      epicId: wp.epicId,
      kind: 'ts-types',
      path: 'contracts/billing.ts',
      content: 'export interface BillingCommand { id: string }',
      hash: 'a'.repeat(64),
      locked,
      unlockedBy: null,
      unlockedAt: null,
      unlockReason: null,
    };
    w.ps.contracts.push(contract);
    w.ps.attached.set(wp.id, [...(w.ps.attached.get(wp.id) ?? []), contract.id]);
    return contract;
  };
  const unlock = (id: string, reason: string, role: 'engineer' | 'maintainer' = 'maintainer') =>
    w.call<Result<Contract>>('POST', `/contracts/${id}/unlock`, { role, userId: 'u-mira', name: 'Mira', body: { reason } });

  it('lists the attached contracts with their lock state', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    const contract = attach(wp);
    const res = await w.call<Contract[]>('GET', `/workpacks/${wp.id}/contracts`);
    expect(res.body).toHaveLength(1);
    ContractSchema.parse(res.body[0]);
    expect(res.body[0]).toMatchObject({ id: contract.id, locked: true, unlockedBy: null });
  });

  it('lets a Maintainer unlock with a reason of at least ten characters, and records who, when and why', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    const contract = attach(wp);
    expect((await unlock(contract.id, 'too short')).status).toBe(422);
    expect((await unlock(contract.id, 'The command needs a trace id', 'engineer')).status).toBe(403);

    const ok = await unlock(contract.id, 'The command needs a trace id');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ locked: false, unlockedBy: 'Mira', unlockReason: 'The command needs a trace id' });
    expect(ok.body.unlockedAt).not.toBeNull();
    expect(eventTypes(w.ps)).toContain('contract.unlocked');
    await flushAudit(w.ps);
    expect(w.ps.audit.find((e) => e.action === 'contract.unlocked')).toMatchObject({ actorName: 'Mira', target: { contractId: contract.id, reason: 'The command needs a trace id' } });
  });

  it('refuses to unlock a contract twice and answers 404 for an unknown one', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    const contract = attach(wp);
    await unlock(contract.id, 'First unlock is fine');
    expect((await unlock(contract.id, 'Second unlock is not')).status).toBe(409);
    expect((await unlock('ctr-999', 'Does not exist at all')).status).toBe(404);
  });

  it('notes in the sign-off panel that a contract was unlocked by a Maintainer', async () => {
    const wp = reviewable('P2 Normal');
    const contract = attach(wp);
    await unlock(contract.id, 'Widen the type for the new field');
    const item = (await release(wp.id)).signoff.find((s) => s.id === 'contract-conformance')!;
    expect(item.state).toBe('met');
    expect(item.detail).toMatch(/Maintainer-unlocked/);
  });
});

describe('repro bundle (spec Appendix E)', () => {
  it('bundles the failure for a failed workpack: branch, commit, gates, transcript, and redacted secrets', async () => {
    const wp = addWorkpack(w.ps, { status: 'failed' });
    const run = w.ps.runs.find((r) => r.workpackId === wp.id)!;
    recordGateResults(w.ps, wp, run, { 'tests.unit_integration': 'failed' });
    w.ps.vault.push({ name: 'PLAYWRIGHT_TEST_TOKEN', allowedGates: ['tests.e2e_viewports'], createdBy: 'Mira', createdAt: new Date().toISOString(), rotatedAt: null, lastUsedAt: null });

    const res = await w.call<ReproBundle>('GET', `/workpacks/${wp.id}/repro`);
    const bundle = ReproBundleSchema.parse(res.body);
    expect(bundle).toMatchObject({ workpackId: wp.id, branch: wp.branch, commitSha: wp.commitSha, transcriptUri: run.transcriptUri });
    expect(bundle.gateResults.find((g) => g.gate === 'tests.unit_integration')!.failures).toHaveLength(1);
    expect(bundle.envRedacted).toEqual(['PLAYWRIGHT_TEST_TOKEN=<redacted>']);
    expect(JSON.stringify(bundle)).not.toMatch(/secret|password/i);
  });
});
