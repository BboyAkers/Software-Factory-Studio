import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  Attribution,
  DispatchResponse,
  EpicDetail,
  IntakeEvent,
  Paged,
  PipelineStages,
  PipelineStatus,
  PreviewResponse,
  Problem,
} from '../../contracts';
import { evaluateIssue, fileIssue } from '../backend/epics';
import { advance, addEpic, addWorkpack, createWorld, setSpend, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

const SPEC = `---
title: "Stripe webhook retry"
mode: feature
priority: P1
areas: [billing, webhooks]
acceptance:
  - "Retries are idempotent"
  - "Backoff is exponential"
---

Stripe sometimes delivers a webhook twice. Retry safely.
`;

const intake = async () => (await w.call<Paged<IntakeEvent>>('GET', '/intake')).body.items;
const dispatch = (spec = SPEC, role: 'viewer' | 'engineer' = 'engineer') =>
  w.call<DispatchResponse & Problem>('POST', '/epics', { role, body: { specMarkdown: spec } });

describe('previewing a spec (dry run)', () => {
  it('returns contracts, a workpack graph and a cost estimate without creating anything', async () => {
    const res = await w.call<PreviewResponse>('POST', '/epics/preview', { role: 'engineer', body: { specMarkdown: SPEC } });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Stripe webhook retry');
    expect(res.body.contracts.map((c) => c.kind)).toEqual(expect.arrayContaining(['ts-types', 'openapi', 'playwright']));
    expect(res.body.contracts.every((c) => c.hash.length === 64 && c.content.length > 20)).toBe(true);
    expect(res.body.dag.length).toBeGreaterThanOrEqual(3);
    expect(res.body.estimate.costHighUsdMicros).toBeGreaterThan(res.body.estimate.costLowUsdMicros);
    expect(res.body.estimate.budgetSharePercent).toBeGreaterThan(0);
    expect(res.body.estimate.budgetSharePercent).toBeLessThanOrEqual(100);
    expect(w.ps.epics).toHaveLength(0);
    expect(w.ps.workpacks).toHaveLength(0);
  });

  it('builds a valid graph: acyclic, dependencies in order, tests after code, docs last', async () => {
    const { body } = await w.call<PreviewResponse>('POST', '/epics/preview', { role: 'engineer', body: { specMarkdown: SPEC } });
    const index = new Map(body.dag.map((n, i) => [n.id, i]));
    for (const node of body.dag) {
      for (const dep of node.dependsOn) expect(index.get(dep)!, `${node.id} depends on ${dep}`).toBeLessThan(index.get(node.id)!);
    }
    const last = body.dag.at(-1)!;
    expect(last.stage).toBe('docs');
    const tests = body.dag.find((n) => n.stage === 'verification')!;
    expect(tests.dependsOn.length).toBeGreaterThan(0);
    expect(body.dag.every((n) => n.workpackId === null)).toBe(true);
  });

  it('flags nodes that would contend for the same file, and nodes that queue behind running work', async () => {
    addWorkpack(w.ps, { status: 'in-progress', targetFiles: ['src/billing/service.ts'] });
    const { body } = await w.call<PreviewResponse>('POST', '/epics/preview', { role: 'engineer', body: { specMarkdown: SPEC } });
    const billing = body.dag.find((n) => n.targetFiles.includes('src/billing/service.ts'))!;
    expect(billing.queuesBehind).toHaveLength(1);
    const contending = body.dag.filter((n) => n.overlapsWith.length > 0);
    expect(contending.length).toBeGreaterThanOrEqual(2);
    for (const n of contending) for (const other of n.overlapsWith) expect(body.dag.find((x) => x.id === other)!.overlapsWith).toContain(n.id);
  });

  it('is deterministic: the same spec previews to the same contracts and graph', async () => {
    const a = await w.call<PreviewResponse>('POST', '/epics/preview', { role: 'engineer', body: { specMarkdown: SPEC } });
    const b = await w.call<PreviewResponse>('POST', '/epics/preview', { role: 'engineer', body: { specMarkdown: SPEC } });
    expect(b.body.contracts).toEqual(a.body.contracts);
    expect(b.body.dag).toEqual(a.body.dag);
  });

  it('spends a little and attributes it to previews', async () => {
    await w.call('POST', '/epics/preview', { role: 'engineer', body: { specMarkdown: SPEC } });
    const bySource = await w.call<Attribution>('GET', '/budget/attribution?by=source');
    expect(bySource.body.items).toEqual([expect.objectContaining({ key: 'preview', label: 'Spec previews' })]);
    expect(bySource.body.totalUsdMicros).toBeGreaterThan(0);
    expect(bySource.body.totalUsdMicros).toBeLessThan(1_000_000);
  });

  it('reports field errors and the language guard as 422', async () => {
    const noAcceptance = await w.call<Problem>('POST', '/epics/preview', { role: 'engineer', body: { specMarkdown: SPEC.replace(/acceptance:[\s\S]*?---\n/, '---\n') } });
    expect(noAcceptance.status).toBe(422);
    expect(noAcceptance.body.type).toBe('validation_failed');
    expect(noAcceptance.body.errors?.map((e) => e.path)).toContain('acceptance');

    const python = await w.call<Problem>('POST', '/epics/preview', { role: 'engineer', body: { specMarkdown: SPEC.replace('areas:', 'language: python\nareas:') } });
    expect(python.status).toBe(422);
    expect(python.body.type).toBe('unsupported_language');
  });

  it('allows six previews a minute per person and then answers 429', async () => {
    for (let i = 0; i < 6; i++) {
      expect((await w.call('POST', '/epics/preview', { role: 'engineer', userId: 'u-1', body: { specMarkdown: SPEC } })).status).toBe(200);
    }
    const limited = await w.call<Problem>('POST', '/epics/preview', { role: 'engineer', userId: 'u-1', body: { specMarkdown: SPEC } });
    expect(limited.status).toBe(429);
    expect(limited.body.type).toBe('rate_limited');
    expect((await w.call('POST', '/epics/preview', { role: 'engineer', userId: 'u-2', body: { specMarkdown: SPEC } })).status).toBe(200);
    advance(w, 61_000);
    expect((await w.call('POST', '/epics/preview', { role: 'engineer', userId: 'u-1', body: { specMarkdown: SPEC } })).status).toBe(200);
  });

  it('refuses at the budget hard cap with 409 budget_blocked', async () => {
    setSpend(w.ps, w.ps.budget.capUsdMicros);
    const res = await w.call<Problem>('POST', '/epics/preview', { role: 'engineer', body: { specMarkdown: SPEC } });
    expect(res.status).toBe(409);
    expect(res.body.type).toBe('budget_blocked');
  });
});

describe('dispatching a spec (files a GitHub issue; the Epic forms from it)', () => {
  it('answers 202 with the issue and shows a Forming entry until the webhook arrives', async () => {
    const res = await dispatch();
    expect(res.status).toBe(202);
    expect(res.body.issue.number).toBeGreaterThan(100);
    expect(res.body.issue.url).toBe(`https://github.com/acme/app/issues/${res.body.issue.number}`);

    const before = await intake();
    expect(before).toEqual([expect.objectContaining({ id: res.body.intakeId, outcome: 'forming', epicId: null, origin: 'spec-studio' })]);
    expect(w.ps.epics).toHaveLength(0);
  });

  it('files the issue with the factory label and the canonical DSL body', async () => {
    const res = await dispatch();
    const issue = w.ps.issues.find((i) => i.number === res.body.issue.number)!;
    expect(issue.labels).toContain('factory');
    expect(issue.origin).toBe('spec-studio');
    expect(issue.body.startsWith('---\ntitle: "Stripe webhook retry"')).toBe(true);
  });

  it('turns the Forming entry into Accepted and creates the Epic when the webhook is processed', async () => {
    const { body: sent } = await dispatch();
    advance(w, 3_000);

    const [event] = await intake();
    expect(event).toMatchObject({ id: sent.intakeId, outcome: 'accepted', code: null });
    const epic = (await w.call<EpicDetail>('GET', `/epics/${event!.epicId}`)).body;
    expect(epic).toMatchObject({ title: 'Stripe webhook retry', mode: 'feature', priority: 'P1 High', origin: 'spec-studio', issueNumber: sent.issue.number });
    expect(epic.sourceRef).toBe(sent.issue.url);
    const issue = w.ps.issues.find((i) => i.number === sent.issue.number)!;
    expect(issue.labels).toContain('factory:accepted');
    expect(issue.comments[0]!.body).toContain(`Accepted as ${epic.id}`);
  });

  it('moves the Epic through contracts and decomposition into locked contracts and linked workpacks', async () => {
    await dispatch();
    advance(w, 4_000);
    const epicId = w.ps.epics[0]!.id;
    expect((await w.call<EpicDetail>('GET', `/epics/${epicId}`)).body.status).toBe('stage-1');

    advance(w, 6_000);
    expect((await w.call<EpicDetail>('GET', `/epics/${epicId}`)).body.status).toBe('stage-2');

    advance(w, 6_000);
    const epic = (await w.call<EpicDetail>('GET', `/epics/${epicId}`)).body;
    expect(epic.status).toBe('executing');
    expect(epic.contracts.length).toBeGreaterThanOrEqual(3);
    expect(epic.contracts.every((c) => c.locked)).toBe(true);
    expect(epic.dag.length).toBeGreaterThanOrEqual(3);
    expect(epic.workpackIds).toHaveLength(epic.dag.length);
    expect(epic.dag.map((n) => n.workpackId)).toEqual(epic.workpackIds);
    expect(epic.spendUsdMicros).toBeGreaterThan(0);

    const [first] = epic.dag;
    const wp = w.ps.workpacks.find((x) => x.id === first!.workpackId)!;
    expect(wp).toMatchObject({ epicId, priority: 'P1 High', status: 'queued' });
    expect(wp.dependsOn).toEqual([]);
    const dependent = epic.dag.find((n) => n.dependsOn.length > 0)!;
    expect(w.ps.workpacks.find((x) => x.id === dependent.workpackId)!.dependsOn).toEqual(
      dependent.dependsOn.map((d) => epic.dag.find((n) => n.id === d)!.workpackId),
    );
    expect(w.ps.attached.get(wp.id)!.length).toBeGreaterThan(0);
  });

  it('forms a duplicate entry, not a second Epic, when the same issue is delivered again', async () => {
    const { body: sent } = await dispatch();
    advance(w, 3_000);
    const epicId = w.ps.epics[0]!.id;

    evaluateIssue(w.ps, sent.issue.number);
    const [latest] = await intake();
    expect(latest).toMatchObject({ outcome: 'duplicate', canonicalEpicId: epicId, epicId: null });
    expect(w.ps.epics).toHaveLength(1);
    expect(w.ps.issues[0]!.labels).toContain('factory:duplicate');
  });

  it('rejects an invalid issue with its field errors, a comment on the issue, and no Epic', async () => {
    const issue = fileIssue(w.ps, { title: 'Half-written spec', body: SPEC.replace(/acceptance:[\s\S]*?---\n/, '---\n'), origin: 'github-ui', author: 'octocat' });
    evaluateIssue(w.ps, issue.number);
    const [event] = await intake();
    expect(event).toMatchObject({ outcome: 'rejected', code: 'validation_failed', epicId: null, origin: 'github-ui' });
    expect(event!.errors.map((e) => e.path)).toContain('acceptance');
    expect(issue.labels).toContain('factory:rejected');
    expect(issue.comments[0]!.body).toMatch(/acceptance/);
    expect(w.ps.epics).toHaveLength(0);
  });

  it('rejects a non-TypeScript issue with unsupported_language', async () => {
    const issue = fileIssue(w.ps, { title: 'Python service', body: SPEC.replace('areas:', 'language: python\nareas:'), origin: 'github-ui', author: 'octocat' });
    evaluateIssue(w.ps, issue.number);
    expect((await intake())[0]).toMatchObject({ outcome: 'rejected', code: 'unsupported_language' });
  });

  it('ignores an issue without the factory label and records nothing', async () => {
    const issue = fileIssue(w.ps, { title: 'Unlabeled', body: SPEC, origin: 'github-ui', author: 'octocat', labels: ['bug'] });
    expect(evaluateIssue(w.ps, issue.number)).toBeNull();
    expect(await intake()).toEqual([]);
    expect(w.ps.epics).toHaveLength(0);
  });

  it('dedupes a Sentry issue against an open Epic with the same fingerprint', async () => {
    const first = fileIssue(w.ps, { title: 'TypeError in billing', body: SPEC, origin: 'sentry', author: 'sentry-bot', fingerprint: 'fp-1' });
    evaluateIssue(w.ps, first.number);
    const second = fileIssue(w.ps, { title: 'TypeError in billing (again)', body: SPEC.replace('Stripe webhook retry', 'Same crash, new issue'), origin: 'sentry', author: 'sentry-bot', fingerprint: 'fp-1' });
    evaluateIssue(w.ps, second.number);
    const [latest] = await intake();
    expect(latest).toMatchObject({ outcome: 'duplicate', canonicalEpicId: w.ps.epics[0]!.id });
    expect(w.ps.epics).toHaveLength(1);
    expect(w.ps.epics[0]!.source).toBe('sentry-via-github');
  });

  it('accepts at most 30 Epics an hour per project', async () => {
    for (let i = 0; i < 30; i++) addEpic(w.ps);
    const issue = fileIssue(w.ps, { title: 'One too many', body: SPEC, origin: 'github-ui', author: 'octocat' });
    evaluateIssue(w.ps, issue.number);
    expect((await intake())[0]).toMatchObject({ outcome: 'rejected', code: 'rate_limited' });
  });

  it('reports field errors before filing anything, and needs GitHub to be reachable', async () => {
    const bad = await dispatch(SPEC.replace('mode: feature', 'mode: chore'));
    expect(bad.status).toBe(422);
    expect(bad.body.errors?.map((e) => e.path)).toContain('mode');
    expect(w.ps.issues).toHaveLength(0);

    // The platform seed already has a GitHub integration; switch it off rather than adding a second one.
    w.ps.integrations.find((i) => i.id === 'github')!.enabled = false;
    const offline = await dispatch();
    expect(offline.status).toBe(503);
    expect(offline.body.type).toBe('github_unavailable');
    expect(w.ps.issues).toHaveLength(0);
  });

  it('lets a viewer edit and validate text but not dispatch it', async () => {
    const res = await dispatch(SPEC, 'viewer');
    expect(res.status).toBe(403);
    expect(res.body.requiredRole).toBe('engineer');
  });

  it('still forms the Epic at the hard cap but holds it at intake until the cap is raised', async () => {
    await dispatch();
    setSpend(w.ps, w.ps.budget.capUsdMicros);
    advance(w, 30_000);
    const [event] = await intake();
    expect(event!.outcome).toBe('accepted');
    const epicId = w.ps.epics[0]!.id;
    expect((await w.call<EpicDetail>('GET', `/epics/${epicId}`)).body.status).toBe('intake');
    expect(w.ps.workpacks).toHaveLength(0);

    await w.call('PUT', '/budget', { role: 'admin', body: { monthlyCapUsd: 20_000, softLimitPercent: 80 } });
    advance(w, 30_000);
    expect((await w.call<EpicDetail>('GET', `/epics/${epicId}`)).body.status).toBe('executing');
  });
});

describe('the Epic-scoped stepper (spec §5.2)', () => {
  const stages = async (epicId?: string) => (await w.call<PipelineStages>('GET', `/pipeline/stages${epicId ? `?epic=${epicId}` : ''}`)).body;
  const states = (s: PipelineStages) => s.stages.map((x) => x.state);

  it('has four pending stages and no Epic when nothing exists', async () => {
    const s = await stages();
    expect(s.epicId).toBeNull();
    expect(states(s)).toEqual(['pending', 'pending', 'pending', 'pending']);
    expect(s.stages.map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });

  it('shows stage 3 active with its in-progress workpacks and stage 4 active with its verifying ones', async () => {
    const epic = addEpic(w.ps);
    const coding = addWorkpack(w.ps, { epicId: epic.id, status: 'in-progress' });
    const checking = addWorkpack(w.ps, { epicId: epic.id, status: 'verification' });
    const s = await stages(epic.id);
    expect(states(s)).toEqual(['completed', 'completed', 'active', 'active']);
    expect(s.stages[2]!.workpackIds).toEqual([coding.id]);
    expect(s.stages[3]!.workpackIds).toEqual([checking.id]);
  });

  it('completes stage 3 once nothing is queued, planning or in progress', async () => {
    const epic = addEpic(w.ps);
    addWorkpack(w.ps, { epicId: epic.id, status: 'awaiting-review' });
    addWorkpack(w.ps, { epicId: epic.id, status: 'done' });
    expect(states(await stages(epic.id))).toEqual(['completed', 'completed', 'completed', 'completed']);
  });

  it('shows an Epic still in its early stages with the stages after it pending', async () => {
    const epic = addEpic(w.ps, { status: 'stage-1' });
    expect(states(await stages(epic.id))).toEqual(['active', 'pending', 'pending', 'pending']);
    epic.status = 'stage-2';
    expect(states(await stages(epic.id))).toEqual(['completed', 'active', 'pending', 'pending']);
  });

  it('marks stages blocked while the hard cap holds the pipeline back', async () => {
    const epic = addEpic(w.ps, { status: 'stage-1' });
    setSpend(w.ps, w.ps.budget.capUsdMicros);
    expect(states(await stages(epic.id))[0]).toBe('blocked');
  });

  it('picks the Epic with the most work in flight when none is requested', async () => {
    const quiet = addEpic(w.ps);
    addWorkpack(w.ps, { epicId: quiet.id, status: 'in-progress' });
    const busy = addEpic(w.ps);
    addWorkpack(w.ps, { epicId: busy.id, status: 'in-progress' });
    addWorkpack(w.ps, { epicId: busy.id, status: 'queued' });
    expect((await stages()).epicId).toBe(busy.id);
  });
});

describe('pipeline status (shell: pause pill, capacity, badges)', () => {
  const status = async () => (await w.call<PipelineStatus>('GET', '/pipeline/status')).body;

  it('counts running, queued, awaiting review and active workpacks against the capacity of 8', async () => {
    addWorkpack(w.ps, { status: 'in-progress' });
    addWorkpack(w.ps, { status: 'verification' });
    addWorkpack(w.ps, { status: 'queued', targetFiles: ['src/queued.ts'] });
    addWorkpack(w.ps, { status: 'awaiting-review' });
    addWorkpack(w.ps, { status: 'done' });
    expect(await status()).toMatchObject({ running: 2, queued: 1, awaitingReview: 1, active: 4, capacity: { used: 2, max: 8 }, paused: false, hardCapHit: false });
  });

  it('lists every project-wide reason that holds the pipeline, with who paused it', async () => {
    await w.call('POST', '/pipeline/pause', { role: 'maintainer', userId: 'u-m', name: 'Mira' });
    setSpend(w.ps, w.ps.budget.capUsdMicros);
    const s = await status();
    expect(s.paused).toBe(true);
    expect(s.pausedReasons).toEqual(['manual-global', 'budget-hard-cap']);
    expect(s.pausedBy).toBe('Mira');
    expect(s.pausedAt).not.toBeNull();
  });
});

describe('epics list', () => {
  it('filters by status and text, newest first', async () => {
    const a = addEpic(w.ps, { title: 'Billing hardening', status: 'executing' });
    const b = addEpic(w.ps, { title: 'Audit export', areas: ['audit'], status: 'completed' });
    b.createdAt = new Date(Date.parse(a.createdAt) + 1000).toISOString();
    const all = await w.call<Paged<{ id: string }>>('GET', '/epics');
    expect(all.body.items.map((e) => e.id)).toEqual([b.id, a.id]);
    expect((await w.call<Paged<{ id: string }>>('GET', '/epics?status=completed')).body.items.map((e) => e.id)).toEqual([b.id]);
    expect((await w.call<Paged<{ id: string }>>('GET', '/epics?q=billing')).body.items.map((e) => e.id)).toEqual([a.id]);
    expect((await w.call<Problem>('GET', '/epics/EPIC-0')).status).toBe(404);
  });
});
