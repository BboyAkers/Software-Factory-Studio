import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GatesResponse, LogEntry, Paged, Problem, Run, SteeringState, Workpack, WorkpackDetail } from '../../contracts';
import { recordGateResults } from '../backend/gates';
import { ARCHIVE_AFTER_MS } from '../backend/simulator';
import { advanceClock } from '../backend/runtime';
import { addEpic, addWorkpack, createWorld, eventTypes, fastForwardTuning, setSpend, simulate, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
  fastForwardTuning(w.store);
  w.store.sim.gateFailureRate = 0;
});
afterEach(() => {
  w.close();
});

const HOUR = 3_600_000;
const wp = async (id: string) => (await w.call<WorkpackDetail>('GET', `/workpacks/${id}`)).body;
const version = (id: string) => w.ps.workpacks.find((x) => x.id === id)!.version;

describe('admission: capacity, file locks, dependencies and priority (spec §5.1 rules 8–10)', () => {
  it('starts a queued workpack, hands it to planning and then to CodeCraft with a live run', async () => {
    const queued = addWorkpack(w.ps, { status: 'queued' });
    simulate(w, 100);
    expect(await wp(queued.id)).toMatchObject({ status: 'planning', assignedAgentId: 'architect-prime', queuedReason: null });

    simulate(w, 400);
    const running = await wp(queued.id);
    expect(running).toMatchObject({ status: 'in-progress', assignedAgentId: 'codecraft', attempt: 1 });
    expect(running.startedAt).not.toBeNull();
    expect(running.runs).toEqual([expect.objectContaining({ stage: 3, status: 'running', agentId: 'codecraft' })]);
    expect(running.activeRunId).toBe(running.runs[0]!.id);
  });

  it('runs at most eight workpacks at once and starts the ninth when a slot frees', async () => {
    for (let i = 0; i < 8; i++) addWorkpack(w.ps, { status: 'in-progress' });
    const ninth = addWorkpack(w.ps, { status: 'queued' });
    simulate(w, 300);
    expect(await wp(ninth.id)).toMatchObject({ status: 'queued', queuedReason: 'capacity' });

    const first = w.ps.workpacks[0]!;
    await w.call('PATCH', `/workpacks/${first.id}/status`, { role: 'engineer', body: { status: 'cancelled' }, headers: { 'if-match': String(first.version) } });
    simulate(w, 300);
    expect((await wp(ninth.id)).status).not.toBe('queued');
  });

  it('holds a workpack behind a running one that has its files, then starts it when they are free', async () => {
    const holder = addWorkpack(w.ps, { status: 'in-progress', targetFiles: ['src/billing/stripe.ts'] });
    const waiting = addWorkpack(w.ps, { status: 'queued', targetFiles: ['src/billing/**'] });
    simulate(w, 300);
    expect(await wp(waiting.id)).toMatchObject({ status: 'queued', queuedReason: 'file-lock', blockedBy: holder.id });

    await w.call('PATCH', `/workpacks/${holder.id}/status`, { role: 'engineer', body: { status: 'cancelled' }, headers: { 'if-match': String(version(holder.id)) } });
    simulate(w, 300);
    expect(await wp(waiting.id)).toMatchObject({ status: expect.stringMatching(/planning|in-progress/), blockedBy: null });
  });

  it('waits for dependencies to be merged, not just reviewed', async () => {
    const dep = addWorkpack(w.ps, { status: 'awaiting-review', targetFiles: ['src/dep.ts'] });
    const child = addWorkpack(w.ps, { status: 'queued', dependsOn: [dep.id], targetFiles: ['src/child.ts'] });
    simulate(w, 300);
    expect(await wp(child.id)).toMatchObject({ status: 'queued', queuedReason: 'deps' });

    dep.mergedAt = new Date().toISOString();
    w.ps.workpacks.find((x) => x.id === dep.id)!.status = 'done';
    simulate(w, 300);
    expect((await wp(child.id)).status).not.toBe('queued');
  });

  it('gives a free slot to the highest priority first', async () => {
    for (let i = 0; i < 7; i++) addWorkpack(w.ps, { status: 'in-progress' });
    const low = addWorkpack(w.ps, { status: 'queued', priority: 'P2 Normal' });
    const urgent = addWorkpack(w.ps, { status: 'queued', priority: 'P0 Blocker' });
    simulate(w, 100);
    expect((await wp(urgent.id)).status).toBe('planning');
    expect((await wp(low.id)).status).toBe('queued');
  });

  it('keeps everything queued while the pipeline is paused and starts it on resume', async () => {
    const queued = addWorkpack(w.ps, { status: 'queued' });
    await w.call('POST', '/pipeline/pause', { role: 'maintainer' });
    simulate(w, 400);
    expect(await wp(queued.id)).toMatchObject({ status: 'queued', queuedReason: 'paused' });
    await w.call('POST', '/pipeline/resume', { role: 'maintainer' });
    simulate(w, 300);
    expect((await wp(queued.id)).status).not.toBe('queued');
  });
});

describe('a synthesis run (spec §5.2 stage 3)', () => {
  const start = async () => {
    const queued = addWorkpack(w.ps, { status: 'queued', targetFiles: ['src/billing/stripe.ts', 'src/billing/stripe.test.ts'] });
    simulate(w, 600);
    return { id: queued.id, runId: (await wp(queued.id)).activeRunId! };
  };

  it('makes steady progress: turns, tokens, lines written, a commit and a PR', async () => {
    const { id } = await start();
    const samples: number[] = [];
    for (let i = 0; i < 6; i++) {
      simulate(w, 400);
      samples.push((await wp(id)).completeness);
    }
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
    expect(samples.at(-1)!).toBeGreaterThan(samples[0]!);

    const now = await wp(id);
    expect(now.tokensConsumed).toBeGreaterThan(0);
    expect(now.linesAdded).toBeGreaterThan(0);
    expect(now.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(now.prNumber).toBeGreaterThan(400);
    expect(now.runs[0]!.turn).toBeGreaterThan(0);
    expect(now.runs[0]!.costUsdMicros).toBeGreaterThan(0);
  });

  it('charges every turn to the budget, attributed to the Epic and the workpack', async () => {
    const { id } = await start();
    simulate(w, 2_000);
    const spend = w.ps.spend.filter((s) => s.workpackId === id);
    expect(spend.length).toBeGreaterThan(1);
    expect(spend.every((s) => s.source === 'workpack' && s.agentId === 'codecraft')).toBe(true);
    expect((await wp(id)).costUsdMicros).toBe(spend.reduce((sum, s) => sum + s.usdMicros, 0));
  });

  it('narrates itself: reasoning steps, log lines with levels, and tool calls on the run stream', async () => {
    const { runId } = await start();
    simulate(w, 2_000);
    const reasoning = (await w.call<{ step: number; status: string; title: string }[]>('GET', `/runs/${runId}/reasoning`)).body;
    expect(reasoning.length).toBeGreaterThan(1);
    expect(reasoning.filter((s) => s.status === 'active')).toHaveLength(1);
    expect(reasoning.slice(0, -1).every((s) => s.status === 'done')).toBe(true);
    expect(reasoning.some((s) => /stripe\.ts/.test(s.title))).toBe(true);

    const logs = (await w.call<Paged<LogEntry>>('GET', `/runs/${runId}/logs`)).body.items;
    expect(new Set(logs.map((l) => l.level)).size).toBeGreaterThan(1);
    const runStream = w.ps.runStreams.get(runId)!.ring.map((e) => e.event.type);
    expect(runStream).toEqual(expect.arrayContaining(['run.token_delta', 'run.tool_call', 'run.log', 'run.reasoning_step']));
    expect(eventTypes(w.ps)).not.toContain('run.token_delta');
  });

  it('writes the files as it goes, so the diff grows while the run is live', async () => {
    const { id } = await start();
    simulate(w, 1_200);
    const early = (await w.call<{ files: { path: string; additions: number }[] }>('GET', `/workpacks/${id}/diff`)).body.files.reduce((n, f) => n + f.additions, 0);
    simulate(w, 2_400);
    const later = (await w.call<{ files: { path: string; additions: number }[] }>('GET', `/workpacks/${id}/diff`)).body.files.reduce((n, f) => n + f.additions, 0);
    expect(later).toBeGreaterThan(early);
  });

  it('makes no progress while paused, and carries on after resume', async () => {
    const { id } = await start();
    simulate(w, 800);
    await w.call('POST', `/workpacks/${id}/pause`, { role: 'engineer', headers: { 'if-match': String(version(id)) } });
    const frozen = (await wp(id)).completeness;
    const turn = (await wp(id)).runs[0]!.turn;
    simulate(w, 3_000);
    expect((await wp(id)).completeness).toBe(frozen);
    expect((await wp(id)).runs[0]!.turn).toBe(turn);

    await w.call('POST', `/workpacks/${id}/resume`, { role: 'engineer', headers: { 'if-match': String(version(id)) } });
    simulate(w, 1_500);
    expect((await wp(id)).completeness).toBeGreaterThan(frozen);
  });
});

describe('steering reaches the live agent (spec §7.4)', () => {
  const live = async () => {
    const queued = addWorkpack(w.ps, { status: 'queued', targetFiles: ['src/a.ts'] });
    simulate(w, 600);
    return { id: queued.id, runId: (await wp(queued.id)).activeRunId! };
  };
  const steering = async (runId: string) => (await w.call<SteeringState>('GET', `/runs/${runId}/steering`)).body;

  it('delivers a hint at the next turn boundary and the agent acknowledges it', async () => {
    const { runId } = await live();
    await w.call('POST', `/runs/${runId}/steer`, { role: 'engineer', body: { text: 'Prefer the shared retry helper', kind: 'hint' } });
    expect((await steering(runId)).hints[0]).toMatchObject({ deliveredAt: null, acknowledgedAt: null });

    simulate(w, 1_000);
    expect((await steering(runId)).hints[0]!.deliveredAt).not.toBeNull();
    simulate(w, 8_000);
    const hint = (await steering(runId)).hints[0]!;
    expect(hint.acknowledgedAt).not.toBeNull();
    const logs = (await w.call<Paged<LogEntry>>('GET', `/runs/${runId}/logs?limit=500`)).body.items;
    expect(logs.some((l) => l.tag === '[STEERING]' && /Applying human steering \(hint\)/.test(l.message))).toBe(true);
  });

  it('keeps a hint queued while the run is paused and delivers it only after resume', async () => {
    const { id, runId } = await live();
    await w.call('POST', `/workpacks/${id}/pause`, { role: 'engineer', headers: { 'if-match': String(version(id)) } });
    await w.call('POST', `/runs/${runId}/steer`, { role: 'engineer', body: { text: 'Hold this until resume', kind: 'hint' } });
    simulate(w, 3_000);
    expect((await steering(runId)).hints[0]).toMatchObject({ queuedAt: expect.any(String), deliveredAt: null });

    await w.call('POST', `/workpacks/${id}/resume`, { role: 'engineer', headers: { 'if-match': String(version(id)) } });
    simulate(w, 1_000);
    expect((await steering(runId)).hints[0]!.deliveredAt).not.toBeNull();
  });

  it('rolls progress back when a veto is delivered, so that turn gains far less than a normal one', async () => {
    const { id, runId } = await live();
    simulate(w, 2_400);
    await w.call('POST', `/runs/${runId}/steer`, { role: 'maintainer', body: { text: 'Undo that last change', kind: 'veto' } });

    // Step in slices shorter than a turn, so exactly one turn (the one that delivers the veto) lands in the slice we compare.
    let before = (await wp(id)).completeness;
    let gain: number | null = null;
    for (let i = 0; i < 30 && gain === null; i++) {
      simulate(w, 100);
      const logs = (await w.call<Paged<LogEntry>>('GET', `/runs/${runId}/logs?limit=500`)).body.items;
      const after = (await wp(id)).completeness;
      if (logs.some((l) => /Veto received/.test(l.message))) gain = after - before;
      before = after;
    }
    expect(gain).not.toBeNull();
    // A normal turn adds 100 / turnsTotal (at least 7 points); a vetoed turn gives 8 of those back.
    expect(gain!).toBeLessThanOrEqual(4);
  });

  it('expires a pending suggestion after an hour', async () => {
    const { runId } = await live();
    await w.call('POST', '/steering/suggest', { role: 'viewer', body: { runId, text: 'Consider a lease lock' } });
    advanceClock(w.store, HOUR + 1_000);
    simulate(w, 100);
    expect((await steering(runId)).suggestions[0]!.status).toBe('expired');
  });
});

describe('human locks while the agent writes (spec §7.3)', () => {
  it('reports one policy violation, never overwrites the person’s file, and keeps working on the rest', async () => {
    const queued = addWorkpack(w.ps, { status: 'queued', targetFiles: ['src/billing/stripe.ts', 'src/billing/types.ts'] });
    simulate(w, 600);
    const { activeRunId: runId } = await wp(queued.id);
    const ada = { role: 'engineer' as const, userId: 'u-ada', name: 'Ada' };
    await w.call('POST', `/runs/${runId}/locks`, { ...ada, body: { path: 'src/billing/stripe.ts' } });
    await w.call('PUT', `/workpacks/${queued.id}/files`, { ...ada, body: { path: 'src/billing/stripe.ts', content: 'export const mine = true;' } });

    simulate(w, 6_000);
    const violations = w.ps.events.ring.map((e) => e.event).filter((e) => e.type === 'policy.violation');
    expect(violations).toEqual([expect.objectContaining({ runId, tool: 'fs.write', path: 'src/billing/stripe.ts', reason: expect.stringContaining('Ada') })]);
    const logs = (await w.call<Paged<LogEntry>>('GET', `/runs/${runId}/logs?limit=500`)).body.items;
    expect(logs.filter((l) => l.tag === '[POLICY]' && l.level === 'warn')).toHaveLength(1);
    const file = await w.call<{ content: string }>('GET', `/workpacks/${queued.id}/files?path=src/billing/stripe.ts`);
    expect(file.body.content).toBe('export const mine = true;');
    const other = (await w.call<{ files: { path: string; additions: number }[] }>('GET', `/workpacks/${queued.id}/diff`)).body.files.find((f) => f.path === 'src/billing/types.ts')!;
    expect(other.additions).toBeGreaterThan(0);
    expect((await wp(queued.id)).humanIntervened).toBe(true);
  });
});

describe('verification and what happens next (spec §5.1 rules 4 and 18)', () => {
  const runToEnd = async (id: string, ms = 30_000) => {
    simulate(w, ms);
    return wp(id);
  };

  it('runs the ten gates and stops at awaiting review, with a PR, when auto-merge is off', async () => {
    const queued = addWorkpack(w.ps, { status: 'queued', targetFiles: ['src/pages/matrix/Matrix.tsx'] });
    const done = await runToEnd(queued.id);
    expect(done.status).toBe('awaiting-review');
    expect(done).toMatchObject({ completeness: 100, proposal: false });
    expect(done.prNumber).toBeGreaterThan(400);
    expect(done.runs.map((r) => `${r.stage}:${r.status}`)).toEqual(['3:succeeded', '4:succeeded']);
    const gates = (await w.call<GatesResponse>('GET', `/workpacks/${queued.id}/gates`)).body;
    expect(gates.results).toHaveLength(10);
    expect(gates.results.every((g) => g.finishedAt !== null)).toBe(true);
    expect(done.gateSummary).toMatchObject({ total: 10, failed: 0, running: 0 });
    const shots = (await w.call<unknown[]>('GET', `/workpacks/${queued.id}/screenshots`)).body;
    expect(shots.length).toBeGreaterThan(0);
  });

  it('shows gates moving through queued, running and a result while it verifies', async () => {
    const queued = addWorkpack(w.ps, { status: 'queued' });
    simulate(w, 600);
    simulate(w, 12_000, 100);
    const statuses = w.ps.events.ring
      .map((e) => e.event)
      .filter((e) => e.type === 'gate.updated')
      .map((e) => (e as { status: string }).status);
    expect(new Set(statuses)).toEqual(expect.objectContaining(new Set(['queued', 'running', 'passed'])));
    expect((await wp(queued.id)).status).toBe('awaiting-review');
  });

  it('retries after a blocking gate fails, up to three attempts, then fails the workpack', async () => {
    w.store.sim.gateFailureRate = 1000;
    const queued = addWorkpack(w.ps, { status: 'queued' });
    const done = await runToEnd(queued.id, 90_000);
    expect(done.status).toBe('failed');
    expect(done.attempt).toBeLessThanOrEqual(3);
    expect(done.failureReason).toMatch(/after 3 attempts|SecOps-Vanguard veto/);
    expect(done.endedAt).not.toBeNull();
    const stage3 = done.runs.filter((r) => r.stage === 3);
    expect(stage3.length).toBe(done.attempt);
    expect(done.runs.every((r) => r.endedAt !== null)).toBe(true);
  });

  it('never exceeds three attempts, whatever the failure rate', async () => {
    w.store.sim.gateFailureRate = 1000;
    const ids = [1, 2, 3].map((n) => addWorkpack(w.ps, { status: 'queued', targetFiles: [`src/n${n}.ts`] }).id);
    simulate(w, 120_000);
    for (const id of ids) expect((await wp(id)).attempt).toBeLessThanOrEqual(3);
  });

  it('auto-merges only when every condition holds: policy on, autonomous agent, no sign-off, no override', async () => {
    w.ps.policies.autoMergeVerifiedPRs = true;
    const plain = addWorkpack(w.ps, { status: 'queued', priority: 'P2 Normal', targetFiles: ['src/plain.ts'] });
    const urgent = addWorkpack(w.ps, { status: 'queued', priority: 'P0 Blocker', targetFiles: ['src/urgent.ts'] });
    const held = addWorkpack(w.ps, { status: 'queued', priority: 'P2 Normal', targetFiles: ['src/held.ts'] });
    w.ps.workpacks.find((x) => x.id === held.id)!.autonomyOverride = 'require-review';
    simulate(w, 40_000);

    const agent = w.ps.agents.find((a) => a.id === 'codecraft');
    const autonomous = agent?.versions.find((v) => v.status === 'active')?.config.autonomyPolicy === 'fully-autonomous';
    expect((await wp(plain.id)).status).toBe(autonomous ? 'done' : 'awaiting-review');
    expect((await wp(urgent.id)).status).toBe('awaiting-review');
    expect((await wp(held.id)).status).toBe('awaiting-review');
  });

  it('does not auto-merge when the policy is off', async () => {
    const plain = addWorkpack(w.ps, { status: 'queued' });
    simulate(w, 40_000);
    expect((await wp(plain.id)).status).toBe('awaiting-review');
  });

  it('completes the Epic once every workpack is done', async () => {
    const epic = addEpic(w.ps);
    const a = addWorkpack(w.ps, { epicId: epic.id, status: 'awaiting-review', targetFiles: ['src/a.ts'] });
    const b = addWorkpack(w.ps, { epicId: epic.id, status: 'awaiting-review', targetFiles: ['src/b.ts'] });
    for (const x of [a, b]) {
      recordGateResults(w.ps, x, x.run!, {});
      const res = await w.call('POST', `/workpacks/${x.id}/promote`, { role: 'maintainer', headers: { 'if-match': String(version(x.id)) } });
      expect(res.status).toBe(200);
      if (x === a) expect((await w.call<{ status: string }>('GET', `/epics/${epic.id}`)).body.status).toBe('executing');
    }
    const detail = (await w.call<{ status: string; completedAt: string | null }>('GET', `/epics/${epic.id}`)).body;
    expect(detail.status).toBe('completed');
    expect(detail.completedAt).not.toBeNull();
  });
});

describe('SLA escalation (spec §5.1 rule 7)', () => {
  const pastDue = async (priority: 'P0 Blocker' | 'P1 High') => {
    const queued = addWorkpack(w.ps, { status: 'queued', priority, targetFiles: ['src/sla.ts'] });
    await w.call('POST', '/pipeline/pause', { role: 'maintainer' });
    advanceClock(w.store, (priority === 'P0 Blocker' ? 4 : 24) * HOUR + 60_000);
    simulate(w, 200);
    return queued.id;
  };

  it('flags a breach once, sets escalatedAt, announces it, and never changes the priority', async () => {
    const id = await pastDue('P0 Blocker');
    const breached = await wp(id);
    expect(breached).toMatchObject({ priority: 'P0 Blocker', slaBreached: true });
    expect(breached.escalatedAt).not.toBeNull();
    expect(eventTypes(w.ps).filter((t) => t === 'workpack.sla_breached')).toHaveLength(1);

    const stamp = breached.escalatedAt;
    simulate(w, 2_000);
    expect((await wp(id)).escalatedAt).toBe(stamp);
    expect(eventTypes(w.ps).filter((t) => t === 'workpack.sla_breached')).toHaveLength(1);
  });

  it('records the pause reasons in force at the moment of breach for triage', async () => {
    const id = await pastDue('P1 High');
    const event = w.ps.events.ring.map((e) => e.event).find((e) => e.type === 'workpack.sla_breached');
    expect(event).toMatchObject({ type: 'workpack.sla_breached', workpackId: id, priority: 'P1 High', pausedAtBreach: ['manual-global'] });
  });

  it('keeps the badge but skips the queue-band move and the page when the policy is off', async () => {
    w.ps.policies.slaEscalation = false;
    const id = await pastDue('P0 Blocker');
    expect(await wp(id)).toMatchObject({ slaBreached: true, escalatedAt: null });
  });

  it('never escalates a finished workpack and gives P2 no SLA at all', async () => {
    const done = addWorkpack(w.ps, { status: 'done', priority: 'P0 Blocker' });
    const normal = addWorkpack(w.ps, { status: 'queued', priority: 'P2 Normal', targetFiles: ['src/p2.ts'] });
    await w.call('POST', '/pipeline/pause', { role: 'maintainer' });
    advanceClock(w.store, 100 * HOUR);
    simulate(w, 200);
    expect((await wp(done.id)).slaBreached).toBe(false);
    expect(await wp(normal.id)).toMatchObject({ slaBreached: false, slaDueAt: null });
  });
});

describe('recently ended → archive (spec §5.1 rule 6)', () => {
  it('keeps a failed workpack on the board for five minutes and then archives it', async () => {
    const failed = addWorkpack(w.ps, { status: 'failed' });
    simulate(w, ARCHIVE_AFTER_MS - 5_000, 5_000);
    expect((await wp(failed.id)).archived).toBe(false);
    expect((await w.call<Paged<Workpack>>('GET', '/workpacks')).body.items.map((x) => x.id)).toContain(failed.id);

    simulate(w, 10_000, 5_000);
    expect(await wp(failed.id)).toMatchObject({ archived: true });
    expect((await w.call<Paged<Workpack>>('GET', '/workpacks')).body.items.map((x) => x.id)).not.toContain(failed.id);
    expect((await w.call<Paged<Workpack>>('GET', '/workpacks?archived=1')).body.items.map((x) => x.id)).toContain(failed.id);
    expect(eventTypes(w.ps)).toContain('workpack.archived');
  });

  it('lets an engineer archive early, and archived work is no longer archived twice', async () => {
    const cancelled = addWorkpack(w.ps, { status: 'cancelled' });
    await w.call('POST', `/workpacks/${cancelled.id}/archive`, { role: 'engineer', headers: { 'if-match': String(version(cancelled.id)) } });
    simulate(w, ARCHIVE_AFTER_MS + 1_000, 5_000);
    expect(eventTypes(w.ps).filter((t) => t === 'workpack.archived')).toHaveLength(1);
  });
});

describe('the hard cap during a live run (spec §11.2)', () => {
  it('pauses everything mid-run without failing it, then carries on when the cap is raised', async () => {
    const queued = addWorkpack(w.ps, { status: 'queued', targetFiles: ['src/cap.ts'] });
    simulate(w, 600);
    setSpend(w.ps, w.ps.budget.capUsdMicros - 100_000);
    simulate(w, 2_000);

    const capped = await wp(queued.id);
    expect(capped.status).toBe('in-progress');
    expect(capped.pausedReasons).toContain('budget-hard-cap');
    const frozen = capped.completeness;
    simulate(w, 2_000);
    expect((await wp(queued.id)).completeness).toBe(frozen);
    expect((await w.call<{ hardCapHit: boolean }>('GET', '/budget')).body.hardCapHit).toBe(true);

    const res = await w.call<{ resumedRuns: number }>('PUT', '/budget', { role: 'admin', body: { monthlyCapUsd: 50_000, softLimitPercent: 80 } });
    expect(res.body.resumedRuns).toBe(1);
    simulate(w, 2_000);
    expect((await wp(queued.id)).completeness).toBeGreaterThan(frozen);
  });

  it('keeps new workpacks queued for the budget while capped', async () => {
    setSpend(w.ps, w.ps.budget.capUsdMicros);
    const queued = addWorkpack(w.ps, { status: 'queued' });
    simulate(w, 600);
    expect(await wp(queued.id)).toMatchObject({ status: 'queued', queuedReason: 'budget' });
  });

  it('rolls over to a fresh month and resumes by itself', async () => {
    const queued = addWorkpack(w.ps, { status: 'queued' });
    setSpend(w.ps, w.ps.budget.capUsdMicros);
    simulate(w, 200);
    expect((await wp(queued.id)).queuedReason).toBe('budget');

    w.store.clock.fixedMs = Date.parse('2026-12-01T00:00:10.000Z');
    simulate(w, 600);
    expect((await w.call<{ spendUsdMicros: number }>('GET', '/budget')).body.spendUsdMicros).toBeLessThan(5_000_000);
    expect((await wp(queued.id)).status).not.toBe('queued');
  });
});

describe('intake while someone is watching', () => {
  it('files a new issue every few minutes once the simulator is running, and not before', async () => {
    w.store.tuning.intakeEveryMs = 60_000;
    simulate(w, 120_000, 1_000);
    expect(w.ps.issues).toHaveLength(0);

    w.store.sim.running = true;
    simulate(w, 70_000, 1_000);
    expect(w.ps.issues.length).toBeGreaterThanOrEqual(1);
    expect(w.ps.issues[0]).toMatchObject({ origin: 'github-ui', labels: expect.arrayContaining(['factory']) });
  });

  it('files nothing in the quiet scenario', async () => {
    w.store.tuning.intakeEveryMs = 10_000;
    w.store.sim.running = true;
    w.store.sim.scenario = 'quiet';
    simulate(w, 60_000, 1_000);
    expect(w.ps.issues).toHaveLength(0);
  });

  it('evaluates issues that arrived while GitHub was off once it is back', async () => {
    const { fileIssue } = await import('../backend/epics');
    const github = w.ps.integrations.find((i) => i.id === 'github')!;
    github.enabled = false;
    const issue = fileIssue(w.ps, { title: 'Filed while off', body: '---\ntitle: "Filed while off"\nmode: bug\npriority: P2\nareas: [api]\nacceptance:\n  - "Fixed"\n---\n', origin: 'github-ui', author: 'octocat' });
    simulate(w, 30_000, 1_000);
    expect(issue.processed).toBe(false);

    github.enabled = true;
    simulate(w, 12_000, 1_000);
    expect(issue.processed).toBe(true);
    expect(w.ps.epics.map((e) => e.sourceRef)).toContain(issue.url);
  });
});

describe('what a viewer is told when an action no longer applies', () => {
  it('answers 409 when promoting a workpack the simulator already moved on', async () => {
    const queued = addWorkpack(w.ps, { status: 'queued' });
    simulate(w, 600);
    const res = await w.call<Problem>('POST', `/workpacks/${queued.id}/promote`, { role: 'maintainer', headers: { 'if-match': String(version(queued.id)) } });
    expect(res.status).toBe(409);
  });

  it('exposes the run list in order for a retried workpack', async () => {
    w.store.sim.gateFailureRate = 1000;
    const queued = addWorkpack(w.ps, { status: 'queued' });
    simulate(w, 40_000);
    const runs = (await w.call<Run[]>('GET', `/workpacks/${queued.id}/runs`)).body;
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs[0]).toMatchObject({ stage: 3, attempt: 1 });
  });
});
