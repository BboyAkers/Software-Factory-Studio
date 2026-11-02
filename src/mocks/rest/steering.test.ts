import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Problem, SteeringHint, SteeringState, SteeringSuggestion, Workpack } from '../../contracts';
import { hintState } from '../../domain/steering';
import { deliverAtTurnBoundary } from '../backend/steering';
import { endRun } from '../backend/workpacks';
import { advance, addWorkpack, createWorld, eventTypes, type Result, type World } from '../testing';

let w: World;
let runId: string;
let workpackId: string;

beforeEach(() => {
  w = createWorld();
  const wp = addWorkpack(w.ps, { status: 'in-progress' });
  runId = wp.run!.id;
  workpackId = wp.id;
});
afterEach(() => {
  w.close();
});

const state = async () => (await w.call<SteeringState>('GET', `/runs/${runId}/steering`)).body;
const suggest = (text = 'Prefer a lease lock over a mutex', role: 'viewer' | 'engineer' = 'viewer', name = 'Vera') =>
  w.call<Result<SteeringSuggestion>>('POST', '/steering/suggest', { role, userId: `u-${name}`, name, body: { runId, text } });
const inject = (body: { text: string; kind?: string }, role: 'viewer' | 'engineer' | 'maintainer' = 'engineer') =>
  w.call<Result<SteeringHint>>('POST', `/runs/${runId}/steer`, { role, body });
const approve = (id: string, body: object = {}, role: 'viewer' | 'engineer' | 'maintainer' = 'engineer') =>
  w.call<Result<{ suggestion: SteeringSuggestion; hint: SteeringHint }>>('POST', `/steering/${id}/approve`, { role, body });

describe('suggestions from viewers', () => {
  it('lets a viewer file a suggestion, which waits pending until an engineer decides', async () => {
    const res = await suggest();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ runId, workpackId, authorName: 'Vera', status: 'pending', kind: 'hint', approverId: null });

    const seen = await state();
    expect(seen.suggestions).toHaveLength(1);
    expect(seen.hints).toEqual([]);
    expect(eventTypes(w.ps)).toContain('steering.suggested');
  });

  it('validates the text length', async () => {
    expect((await suggest('hi')).status).toBe(422);
    expect((await suggest('x'.repeat(1001))).status).toBe(422);
  });

  it('refuses a suggestion for a run that has ended', async () => {
    endRun(w.ps, w.ps.runs[0]!, 'succeeded');
    const res = await suggest();
    expect(res.status).toBe(409);
    expect(res.body.type).toBe('run_not_active');
  });
});

describe('approving and rejecting', () => {
  it('turns an approved suggestion into a queued hint in the steering inbox within the G4 budget', async () => {
    const { body: s } = await suggest();
    const res = await approve(s.id);
    expect(res.status).toBe(200);
    expect(res.body.suggestion).toMatchObject({ status: 'approved', approverName: 'Test engineer' });
    const hint = res.body.hint;
    expect(hint).toMatchObject({ runId, kind: 'hint', suggestionId: s.id, authorName: 'Vera', deliveredAt: null, acknowledgedAt: null });
    expect(Date.parse(hint.queuedAt!) - Date.parse(hint.approvedAt)).toBeLessThanOrEqual(2000);
    expect(hintState(hint)).toBe('queued');
    expect(eventTypes(w.ps)).toEqual(expect.arrayContaining(['steering.approved', 'steering.queued']));
  });

  it('lets the approver change the kind, and persists a constraint on the workpack for later runs', async () => {
    const { body: s } = await suggest('Never log full card numbers');
    const res = await approve(s.id, { kind: 'constraint' });
    expect(res.body.hint.kind).toBe('constraint');
    expect(res.body.suggestion.kind).toBe('constraint');
    const wp = (await w.call<Workpack>('GET', `/workpacks/${workpackId}`)).body;
    expect(wp.invariants).toContain('Never log full card numbers');
  });

  it('does not persist a plain hint beyond the next turn', async () => {
    const { body: s } = await suggest();
    await approve(s.id);
    expect((await w.call<Workpack>('GET', `/workpacks/${workpackId}`)).body.invariants).toEqual([]);
  });

  it('needs a maintainer to approve a veto', async () => {
    const { body: s } = await suggest('Undo the last change');
    const denied = await approve(s.id, { kind: 'veto' }, 'engineer');
    expect(denied.status).toBe(403);
    expect(denied.body.requiredRole).toBe('maintainer');
    expect((await state()).suggestions[0]!.status).toBe('pending');
    expect((await approve(s.id, { kind: 'veto' }, 'maintainer')).status).toBe(200);
  });

  it('keeps a viewer from approving or rejecting', async () => {
    const { body: s } = await suggest();
    expect((await approve(s.id, {}, 'viewer')).status).toBe(403);
    const reject = await w.call<Problem>('POST', `/steering/${s.id}/reject`, { role: 'viewer', body: {} });
    expect(reject.status).toBe(403);
  });

  it('records a rejection with its reason, and a decided suggestion cannot be decided again', async () => {
    const { body: s } = await suggest();
    const res = await w.call<SteeringSuggestion>('POST', `/steering/${s.id}/reject`, { role: 'engineer', body: { reason: 'Out of scope for this workpack' } });
    expect(res.body).toMatchObject({ status: 'rejected', rejectReason: 'Out of scope for this workpack' });
    expect((await state()).hints).toEqual([]);
    expect((await approve(s.id)).status).toBe(409);
    expect((await w.call('POST', `/steering/${s.id}/reject`, { role: 'engineer', body: {} })).status).toBe(409);
  });

  it('answers 404 for a suggestion that does not exist', async () => {
    expect((await approve('sug-999')).status).toBe(404);
  });
});

describe('posting a hint directly', () => {
  it('lets an engineer post a hint or constraint, approved at submission', async () => {
    const res = await inject({ text: 'Use the existing retry helper', kind: 'hint' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'hint', suggestionId: null, authorName: 'Test engineer' });
    expect(res.body.queuedAt).toBe(res.body.approvedAt);
    expect(hintState(res.body)).toBe('queued');
  });

  it('defaults the kind to hint', async () => {
    expect((await inject({ text: 'Keep the diff small' })).body.kind).toBe('hint');
  });

  it('forbids a viewer, and forbids an engineer from posting a veto', async () => {
    const viewer = await inject({ text: 'Do it differently', kind: 'hint' }, 'viewer');
    expect(viewer.status).toBe(403);
    expect(viewer.body.requiredRole).toBe('engineer');

    const veto = await inject({ text: 'Roll that back', kind: 'veto' }, 'engineer');
    expect(veto.status).toBe(403);
    expect(veto.body.requiredRole).toBe('maintainer');
    expect((await inject({ text: 'Roll that back', kind: 'veto' }, 'maintainer')).status).toBe(201);
  });

  it('validates text and kind, and refuses a finished run', async () => {
    expect((await inject({ text: 'ok' })).status).toBe(422);
    expect((await inject({ text: 'Long enough', kind: 'order' })).status).toBe(422);
    endRun(w.ps, w.ps.runs[0]!, 'failed');
    expect((await inject({ text: 'Too late now' })).body.type).toBe('run_not_active');
  });
});

describe('delivery at a turn boundary (spec §7.4)', () => {
  it('delivers queued hints at the next turn boundary and acknowledges them one turn later', async () => {
    const { body: hint } = await inject({ text: 'Use the retry helper' });
    deliverAtTurnBoundary(w.ps, runId, () => false);

    let seen = (await state()).hints[0]!;
    expect(hintState(seen)).toBe('delivered');
    expect(seen.deliveredAt).not.toBeNull();
    expect(seen.turnsSinceDelivery).toBe(0);

    deliverAtTurnBoundary(w.ps, runId, (h) => h.id === hint.id);
    seen = (await state()).hints[0]!;
    expect(hintState(seen)).toBe('acknowledged');
    expect(eventTypes(w.ps)).toEqual(expect.arrayContaining(['steering.queued', 'steering.delivered', 'steering.acknowledged']));
  });

  it('counts the turns an unacknowledged hint has waited', async () => {
    await inject({ text: 'Please acknowledge me' });
    deliverAtTurnBoundary(w.ps, runId, () => false);
    deliverAtTurnBoundary(w.ps, runId, () => false);
    deliverAtTurnBoundary(w.ps, runId, () => false);
    const seen = (await state()).hints[0]!;
    expect(seen.turnsSinceDelivery).toBe(2);
    expect(seen.acknowledgedAt).toBeNull();
  });

  it('writes the delivery and acknowledgement into the run log', async () => {
    await inject({ text: 'Mention it in the log' });
    deliverAtTurnBoundary(w.ps, runId, () => false);
    deliverAtTurnBoundary(w.ps, runId, () => true);
    const logs = (await w.call<{ items: { tag: string; message: string }[] }>('GET', `/runs/${runId}/logs`)).body.items;
    expect(logs.filter((l) => l.tag === '[STEERING]').map((l) => l.message)).toEqual([
      expect.stringMatching(/Applying human steering \(hint\).*Mention it in the log/),
      expect.stringMatching(/Acknowledged human steering/),
    ]);
  });
});

describe('when the run ends (spec §7.4)', () => {
  it('expires pending suggestions and flags queued hints as undelivered', async () => {
    await suggest();
    await inject({ text: 'Never delivered' });
    endRun(w.ps, w.ps.runs[0]!, 'succeeded');

    const seen = await state();
    expect(seen.suggestions[0]).toMatchObject({ status: 'expired' });
    expect(seen.hints[0]).toMatchObject({ undelivered: true, deliveredAt: null });
    expect(hintState(seen.hints[0]!)).toBe('undelivered');
    expect(eventTypes(w.ps)).toContain('steering.expired');
  });

  it('leaves delivered hints as they were', async () => {
    await inject({ text: 'Delivered in time' });
    deliverAtTurnBoundary(w.ps, runId, () => false);
    endRun(w.ps, w.ps.runs[0]!, 'succeeded');
    expect(hintState((await state()).hints[0]!)).toBe('delivered');
  });
});

describe('the run reads (logs and reasoning)', () => {
  it('pages the log newest first: a page holds the entries before the cursor, oldest first', async () => {
    const { emitLog } = await import('../backend/runtime');
    for (let i = 1; i <= 7; i++) emitLog(w.ps, runId, 'info', '[X]', `line ${i}`);
    advance(w, 1000);

    const newest = await w.call<{ items: { message: string }[]; nextCursor: string | null }>('GET', `/runs/${runId}/logs?limit=3`);
    expect(newest.body.items.map((l) => l.message)).toEqual(['line 5', 'line 6', 'line 7']);
    const older = await w.call<{ items: { message: string }[]; nextCursor: string | null }>('GET', `/runs/${runId}/logs?limit=3&cursor=${newest.body.nextCursor}`);
    expect(older.body.items.map((l) => l.message)).toEqual(['line 2', 'line 3', 'line 4']);
    const oldest = await w.call<{ items: { message: string }[]; nextCursor: string | null }>('GET', `/runs/${runId}/logs?limit=3&cursor=${older.body.nextCursor}`);
    expect(oldest.body.items.map((l) => l.message)).toEqual(['line 1']);
    expect(oldest.body.nextCursor).toBeNull();
  });

  it('filters the log by level and rejects an unknown level', async () => {
    const { emitLog } = await import('../backend/runtime');
    emitLog(w.ps, runId, 'info', '[X]', 'fine');
    emitLog(w.ps, runId, 'warn', '[X]', 'careful');
    const warn = await w.call<{ items: { level: string }[] }>('GET', `/runs/${runId}/logs?level=warn`);
    expect(warn.body.items.map((l) => l.level)).toEqual(['warn']);
    expect((await w.call<Problem>('GET', `/runs/${runId}/logs?level=loud`)).status).toBe(422);
  });

  it('returns reasoning steps as titles and statuses only', async () => {
    const { emitReasoning } = await import('../backend/runtime');
    emitReasoning(w.ps, runId, 1, 'Read the contracts', 'done');
    emitReasoning(w.ps, runId, 2, 'Write the retry helper', 'active');
    const steps = await w.call<Record<string, unknown>[]>('GET', `/runs/${runId}/reasoning`);
    expect(steps.body.map((s) => `${s.step}:${s.status}:${s.title}`)).toEqual(['1:done:Read the contracts', '2:active:Write the retry helper']);
    expect(Object.keys(steps.body[0]!).sort()).toEqual(['status', 'step', 'title', 'ts']);
  });
});
