import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Paged, Problem, Run, Workpack, WorkpackDetail, WorkpackDiff } from '../../contracts';
import { TEST_NOW_MS, addEpic, addWorkpack, createWorld, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

const DAY = 86_400_000;
const withVersion = (wp: Workpack) => ({ 'if-match': String(wp.version) });
const get = async (id: string) => (await w.call<WorkpackDetail>('GET', `/workpacks/${id}`)).body;

describe('creating a workpack', () => {
  it('needs an Epic, computes the branch, fixes the language and leaves the owner to the pipeline', async () => {
    const epic = addEpic(w.ps);
    const res = await w.call<Workpack>('POST', '/workpacks', {
      role: 'engineer',
      body: { epicId: epic.id, title: 'Add retry with backoff', priority: 'P1 High', category: 'Backend', targetFiles: ['src/billing/**'] },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      epicId: epic.id,
      status: 'queued',
      language: 'typescript',
      assignedAgentId: null,
      autonomyOverride: null,
      attempt: 1,
      maxAttempts: 3,
    });
    expect(res.body.branch).toBe(`factory/${res.body.id}-add-retry-with-backoff`);
    expect(res.body.slaDueAt).toBe(new Date(Date.parse(res.body.createdAt) + DAY).toISOString());
  });

  it('reports a field error for each bad value: unknown epic, escaping path, unknown or foreign dependency', async () => {
    const epicA = addEpic(w.ps);
    const epicB = addEpic(w.ps);
    const foreign = addWorkpack(w.ps, { epicId: epicB.id });
    const res = await w.call<Problem>('POST', '/workpacks', {
      role: 'engineer',
      body: { epicId: epicA.id, title: 'Valid title', priority: 'P2 Normal', category: 'Backend', targetFiles: ['src/ok.ts', '../secrets.ts'], dependsOn: ['WP-0000', foreign.id] },
    });
    expect(res.status).toBe(422);
    expect(res.body.errors?.map((e) => `${e.path}:${e.code}`)).toEqual(['targetFiles.1:invalid_path', 'dependsOn.0:not_found', 'dependsOn.1:different_epic']);

    const missing = await w.call<Problem>('POST', '/workpacks', {
      role: 'engineer',
      body: { epicId: 'EPIC-9999', title: 'Valid title', priority: 'P2 Normal', category: 'Backend' },
    });
    expect(missing.body.errors?.[0]).toMatchObject({ path: 'epicId', code: 'not_found' });
  });

  it('refuses a workpack in an Epic that has ended', async () => {
    const epic = addEpic(w.ps, { status: 'completed' });
    const res = await w.call<Problem>('POST', '/workpacks', {
      role: 'engineer',
      body: { epicId: epic.id, title: 'Too late', priority: 'P2 Normal', category: 'Backend' },
    });
    expect(res.body.errors?.[0]).toMatchObject({ path: 'epicId', code: 'epic_closed' });
  });

  it('lets only a maintainer hold a workpack for review at creation', async () => {
    const epic = addEpic(w.ps);
    const body = { epicId: epic.id, title: 'Needs a human', priority: 'P2 Normal', category: 'Backend', holdForReview: true };
    const engineer = await w.call<Problem>('POST', '/workpacks', { role: 'engineer', body });
    expect(engineer.status).toBe(403);
    expect(engineer.body.requiredRole).toBe('maintainer');

    const maintainer = await w.call<Workpack>('POST', '/workpacks', { role: 'maintainer', body });
    expect(maintainer.status).toBe(201);
    expect(maintainer.body.autonomyOverride).toBe('require-review');
  });

  it('queues a workpack behind one that holds an overlapping file and names the blocker', async () => {
    const epic = addEpic(w.ps);
    const holder = addWorkpack(w.ps, { epicId: epic.id, status: 'in-progress', targetFiles: ['src/billing/stripe.ts'] });
    const res = await w.call<Workpack>('POST', '/workpacks', {
      role: 'engineer',
      body: { epicId: epic.id, title: 'Touches billing', priority: 'P2 Normal', category: 'Backend', targetFiles: ['src/billing/**'] },
    });
    expect(res.body).toMatchObject({ status: 'queued', queuedReason: 'file-lock', blockedBy: holder.id });
  });
});

describe('listing workpacks', () => {
  it('hides archived workpacks by default and lists only them with archived=1', async () => {
    const live = addWorkpack(w.ps, { status: 'in-progress' });
    const gone = addWorkpack(w.ps, { status: 'failed' });
    await w.call('POST', `/workpacks/${gone.id}/archive`, { role: 'engineer', headers: withVersion(gone) });

    const active = await w.call<Paged<Workpack>>('GET', '/workpacks');
    expect(active.body.items.map((x) => x.id)).toEqual([live.id]);
    const archived = await w.call<Paged<Workpack>>('GET', '/workpacks?archived=1');
    expect(archived.body.items.map((x) => x.id)).toEqual([gone.id]);
  });

  it('applies doneSince to finished work only, so other columns are never hidden', async () => {
    const recent = addWorkpack(w.ps, { status: 'done' });
    const old = addWorkpack(w.ps, { status: 'done' });
    old.completedAt = new Date(TEST_NOW_MS - 3 * DAY).toISOString();
    const waiting = addWorkpack(w.ps, { status: 'queued' });
    waiting.createdAt = new Date(TEST_NOW_MS - 9 * DAY).toISOString();

    const day = await w.call<Paged<Workpack>>('GET', '/workpacks?doneSince=24h');
    expect(day.body.items.map((x) => x.id).sort()).toEqual([recent.id, waiting.id].sort());
    const everything = await w.call<Paged<Workpack>>('GET', '/workpacks?status=done');
    expect(everything.body.items.map((x) => x.id).sort()).toEqual([recent.id, old.id].sort());
  });

  it('filters by status list, priority code, epic and free text', async () => {
    const epicA = addEpic(w.ps);
    const epicB = addEpic(w.ps);
    const a = addWorkpack(w.ps, { epicId: epicA.id, status: 'in-progress', priority: 'P0 Blocker', title: 'Stripe retry' });
    const b = addWorkpack(w.ps, { epicId: epicB.id, status: 'verification', priority: 'P1 High', title: 'Audit export' });
    addWorkpack(w.ps, { epicId: epicB.id, status: 'queued', title: 'Docs cleanup' });

    const ids = async (query: string) => (await w.call<Paged<Workpack>>('GET', `/workpacks?${query}`)).body.items.map((x) => x.id).sort();
    expect(await ids('status=in-progress,verification')).toEqual([a.id, b.id].sort());
    expect(await ids('priority=P0')).toEqual([a.id]);
    expect(await ids(`epic=${epicB.id}&status=verification`)).toEqual([b.id]);
    expect(await ids('q=audit')).toEqual([b.id]);
  });

  it('pages with a cursor', async () => {
    for (let i = 0; i < 5; i++) addWorkpack(w.ps);
    const first = await w.call<Paged<Workpack>>('GET', '/workpacks?limit=2');
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBe('2');
    const last = await w.call<Paged<Workpack>>('GET', `/workpacks?limit=2&cursor=4`);
    expect(last.body.items).toHaveLength(1);
    expect(last.body.nextCursor).toBeNull();
  });

  it('returns detail with attempts, the Epic title and attached contract ids', async () => {
    const epic = addEpic(w.ps, { title: 'Billing hardening' });
    const wp = addWorkpack(w.ps, { epicId: epic.id, status: 'in-progress' });
    const detail = await get(wp.id);
    expect(detail.epicTitle).toBe('Billing hardening');
    expect(detail.runs).toEqual([expect.objectContaining({ workpackId: wp.id, status: 'running' })]);
    expect(detail.contractIds).toEqual([]);
  });
});

describe('manual transitions (spec §5.1)', () => {
  // A success is a Workpack and a failure is a Problem; both share a `status` key, so read the problem fields without it.
  const patch = (wp: Workpack, body: unknown, role: 'viewer' | 'engineer' | 'maintainer' = 'engineer') =>
    w.call<Workpack & Omit<Problem, 'status'>>('PATCH', `/workpacks/${wp.id}/status`, { role, body, headers: withVersion(wp) });

  it('cancels a running workpack, ends its run, and keeps the branch and PR', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    const res = await patch(wp, { status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelled', archived: false, branch: wp.branch });
    expect(res.body.endedAt).not.toBeNull();
    const runs = await w.call<Run[]>('GET', `/workpacks/${wp.id}/runs`);
    expect(runs.body[0]).toMatchObject({ status: 'cancelled' });
    expect(runs.body[0]!.endedAt).not.toBeNull();
  });

  it('forbids a viewer from cancelling and names the role needed', async () => {
    const wp = addWorkpack(w.ps, { status: 'queued' });
    const res = await patch(wp, { status: 'cancelled' }, 'viewer');
    expect(res.status).toBe(403);
    expect(res.body.requiredRole).toBe('engineer');
  });

  it('answers an illegal move with 409 illegal_transition and the targets that are allowed', async () => {
    const wp = addWorkpack(w.ps, { status: 'queued' });
    const res = await patch(wp, { status: 'in-progress' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ type: 'illegal_transition', allowed: ['cancelled'] });

    const ended = addWorkpack(w.ps, { status: 'done' });
    expect((await patch(ended, { status: 'cancelled' })).body.type).toBe('illegal_transition');
  });

  it('never moves a workpack into planning, verification or failed by hand', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    for (const status of ['planning', 'verification', 'failed']) {
      expect((await patch(wp, { status })).status, status).toBe(409);
    }
  });

  it('turns awaiting-review → in-progress into a request for changes that needs its text', async () => {
    const wp = addWorkpack(w.ps, { status: 'awaiting-review' });
    const noText = await patch(wp, { status: 'in-progress' });
    expect(noText.status).toBe(422);
    expect(noText.body.errors?.[0]?.path).toBe('text');

    const ok = await patch(wp, { status: 'in-progress', text: 'Keep the public API unchanged' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'in-progress', attempt: 1 });
    expect(ok.body.invariants).toContain('Keep the public API unchanged');
  });

  it('forbids an engineer from promoting through a status change', async () => {
    const wp = addWorkpack(w.ps, { status: 'awaiting-review' });
    const res = await patch(wp, { status: 'done' }, 'engineer');
    expect(res.status).toBe(403);
    expect(res.body.requiredRole).toBe('maintainer');
  });
});

describe('request changes', () => {
  it('moves awaiting-review back to in-progress, resets the attempt count and starts a new run', async () => {
    const wp = addWorkpack(w.ps, { status: 'awaiting-review' });
    wp.attempt = 3;
    const res = await w.call<Workpack>('POST', `/workpacks/${wp.id}/request-changes`, {
      role: 'engineer',
      body: { text: 'Rename the helper' },
      headers: withVersion(wp),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'in-progress', attempt: 1 });
    expect(res.body.invariants).toContain('Rename the helper');
    expect((await w.call<Run[]>('GET', `/workpacks/${wp.id}/runs`)).body).toHaveLength(2);
  });

  it('refuses from any other status and refuses empty text', async () => {
    const running = addWorkpack(w.ps, { status: 'in-progress' });
    const wrong = await w.call<Problem>('POST', `/workpacks/${running.id}/request-changes`, { role: 'engineer', body: { text: 'Please change' }, headers: withVersion(running) });
    expect(wrong.status).toBe(409);

    const review = addWorkpack(w.ps, { status: 'awaiting-review' });
    const empty = await w.call<Problem>('POST', `/workpacks/${review.id}/request-changes`, { role: 'engineer', body: { text: '' }, headers: withVersion(review) });
    expect(empty.status).toBe(422);
  });
});

describe('pause and resume (a flag with reasons, not a status)', () => {
  it('pauses one workpack by hand and resumes it, leaving its status alone', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    const paused = await w.call<Workpack>('POST', `/workpacks/${wp.id}/pause`, { role: 'engineer', headers: withVersion(wp) });
    expect(paused.body).toMatchObject({ status: 'in-progress', paused: true, pausedReasons: ['manual-workpack'] });
    expect((await w.call<Run[]>('GET', `/workpacks/${wp.id}/runs`)).body[0]!.status).toBe('paused');

    const resumed = await w.call<Workpack>('POST', `/workpacks/${wp.id}/resume`, { role: 'engineer', headers: withVersion(paused.body) });
    expect(resumed.body).toMatchObject({ paused: false, pausedReasons: [] });
    expect((await w.call<Run[]>('GET', `/workpacks/${wp.id}/runs`)).body[0]!.status).toBe('running');
  });

  it('keeps a global pause in force when one workpack is resumed by hand', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    await w.call('POST', `/workpacks/${wp.id}/pause`, { role: 'engineer', headers: withVersion(wp) });
    const global = await w.call<{ affected: number; status: { pausedReasons: string[] } }>('POST', '/pipeline/pause', { role: 'maintainer' });
    expect(global.body.affected).toBe(1);
    expect(global.body.status.pausedReasons).toContain('manual-global');
    expect((await get(wp.id)).pausedReasons).toEqual(['manual-workpack', 'manual-global']);

    await w.call('POST', `/workpacks/${wp.id}/resume`, { role: 'engineer', headers: withVersion(await get(wp.id)) });
    expect((await get(wp.id)).pausedReasons).toEqual(['manual-global']);

    await w.call('POST', '/pipeline/resume', { role: 'maintainer' });
    expect(await get(wp.id)).toMatchObject({ paused: false, pausedReasons: [] });
  });

  it('refuses to resume a workpack that is not paused by hand and says what holds it', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    const res = await w.call<Problem>('POST', `/workpacks/${wp.id}/resume`, { role: 'engineer', headers: withVersion(wp) });
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/not paused/i);
  });

  it('pauses and resumes every workpack of an Epic together', async () => {
    const epic = addEpic(w.ps);
    const a = addWorkpack(w.ps, { epicId: epic.id, status: 'in-progress' });
    const b = addWorkpack(w.ps, { epicId: epic.id, status: 'queued' });
    const other = addWorkpack(w.ps, { epicId: addEpic(w.ps).id, status: 'in-progress' });

    const paused = await w.call<{ paused: boolean }>('POST', `/epics/${epic.id}/pause`, { role: 'engineer' });
    expect(paused.body.paused).toBe(true);
    expect((await get(a.id)).paused).toBe(true);
    expect((await get(b.id)).paused).toBe(true);
    expect((await get(other.id)).paused).toBe(false);

    await w.call('POST', `/epics/${epic.id}/resume`, { role: 'engineer' });
    expect((await get(a.id)).paused).toBe(false);
  });
});

describe('archive, fork and rollback', () => {
  it('archives only failed or cancelled workpacks', async () => {
    const running = addWorkpack(w.ps, { status: 'in-progress' });
    const refused = await w.call<Problem>('POST', `/workpacks/${running.id}/archive`, { role: 'engineer', headers: withVersion(running) });
    expect(refused.status).toBe(409);

    const cancelled = addWorkpack(w.ps, { status: 'cancelled' });
    const ok = await w.call<Workpack>('POST', `/workpacks/${cancelled.id}/archive`, { role: 'engineer', headers: withVersion(cancelled) });
    expect(ok.body).toMatchObject({ archived: true });
    expect(ok.body.archivedAt).not.toBeNull();
  });

  it('forks a failed workpack into the same Epic on a -fork-N branch, carrying its constraints', async () => {
    const wp = addWorkpack(w.ps, { status: 'failed' });
    wp.invariants.push('Never log tokens');
    const denied = await w.call<Problem>('POST', `/workpacks/${wp.id}/fork`, { role: 'engineer', headers: withVersion(wp) });
    expect(denied.status).toBe(403);

    const res = await w.call<Workpack>('POST', `/workpacks/${wp.id}/fork`, { role: 'maintainer', headers: withVersion(wp) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ forkOf: wp.id, epicId: wp.epicId, status: 'queued', invariants: ['Never log tokens'] });
    expect(res.body.branch).toBe(`${wp.branch}-fork-1`);
    expect(res.body.commitSha).toBe(wp.commitSha);
  });

  it('rolls a merged workpack back by opening a revert workpack and leaves the original done', async () => {
    const wp = addWorkpack(w.ps, { status: 'done' });
    const res = await w.call<Workpack>('POST', `/workpacks/${wp.id}/rollback`, { role: 'maintainer', headers: withVersion(wp) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ revertOf: wp.id, status: 'queued', epicId: wp.epicId });
    expect(res.body.branch).toMatch(new RegExp(`^factory/${res.body.id}-revert-`));
    expect((await get(wp.id)).status).toBe('done');
  });

  it('cannot roll back a workpack that was never merged', async () => {
    const wp = addWorkpack(w.ps, { status: 'awaiting-review' });
    const res = await w.call<Problem>('POST', `/workpacks/${wp.id}/rollback`, { role: 'maintainer', headers: withVersion(wp) });
    expect(res.status).toBe(409);
  });

  it('lets a maintainer hold a workpack for review and release it again', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    const held = await w.call<Workpack>('PATCH', `/workpacks/${wp.id}`, { role: 'maintainer', body: { holdForReview: true }, headers: withVersion(wp) });
    expect(held.body.autonomyOverride).toBe('require-review');
    const denied = await w.call<Problem>('PATCH', `/workpacks/${wp.id}`, { role: 'engineer', body: { holdForReview: false }, headers: withVersion(held.body) });
    expect(denied.status).toBe(403);
    const released = await w.call<Workpack>('PATCH', `/workpacks/${wp.id}`, { role: 'maintainer', body: { holdForReview: false }, headers: withVersion(held.body) });
    expect(released.body.autonomyOverride).toBeNull();
  });
});

describe('editing a file while the agent works (spec §7.3, §16.7)', () => {
  const setup = () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress', targetFiles: ['src/billing/stripe.ts', 'src/billing/types.ts'] });
    return { wp, runId: wp.run!.id };
  };

  it('locks a file for one person, and a second person is refused', async () => {
    const { wp, runId } = setup();
    const ada = { role: 'engineer' as const, userId: 'u-ada', name: 'Ada' };
    const first = await w.call<{ humanLockedFiles: string[] }>('POST', `/runs/${runId}/locks`, { ...ada, body: { path: 'src/billing/stripe.ts' } });
    expect(first.body.humanLockedFiles).toEqual(['src/billing/stripe.ts']);

    const bob = await w.call<Problem>('POST', `/runs/${runId}/locks`, { role: 'engineer', userId: 'u-bob', name: 'Bob', body: { path: 'src/billing/stripe.ts' } });
    expect(bob.status).toBe(409);
    expect(bob.body.type).toBe('locked_by_other');

    const diff = await w.call<WorkpackDiff>('GET', `/workpacks/${wp.id}/diff`);
    expect(diff.body.files.find((f) => f.path === 'src/billing/stripe.ts')).toMatchObject({ locked: true, lockedBy: 'Ada' });
  });

  it('saves only under the lock, marks the workpack human-intervened, and shows the saved content', async () => {
    const { wp, runId } = setup();
    const ada = { role: 'engineer' as const, userId: 'u-ada', name: 'Ada' };
    const path = 'src/billing/stripe.ts';

    const unlocked = await w.call<Problem>('PUT', `/workpacks/${wp.id}/files`, { ...ada, body: { path, content: 'x' } });
    expect(unlocked.status).toBe(409);

    await w.call('POST', `/runs/${runId}/locks`, { ...ada, body: { path } });
    const saved = await w.call<{ content: string; locked: boolean }>('PUT', `/workpacks/${wp.id}/files`, { ...ada, body: { path, content: 'export const retries = 5;' } });
    expect(saved.body).toMatchObject({ content: 'export const retries = 5;', locked: true });
    expect((await get(wp.id)).humanIntervened).toBe(true);

    const other = await w.call<Problem>('PUT', `/workpacks/${wp.id}/files`, { role: 'engineer', userId: 'u-bob', name: 'Bob', body: { path, content: 'nope' } });
    expect(other.status).toBe(409);
  });

  it('releases a lock on request and frees the file for someone else', async () => {
    const { wp, runId } = setup();
    const path = 'src/billing/types.ts';
    await w.call('POST', `/runs/${runId}/locks`, { role: 'engineer', userId: 'u-ada', name: 'Ada', body: { path } });
    const released = await w.call<{ humanLockedFiles: string[] }>('DELETE', `/runs/${runId}/locks?path=${encodeURIComponent(path)}`, { role: 'engineer', userId: 'u-ada', name: 'Ada' });
    expect(released.body.humanLockedFiles).toEqual([]);
    const bob = await w.call('POST', `/runs/${runId}/locks`, { role: 'engineer', userId: 'u-bob', name: 'Bob', body: { path } });
    expect(bob.status).toBe(200);
    expect((await get(wp.id)).humanLockedFiles).toEqual([path]);
  });

  it('forbids a viewer from locking or saving but lets them read the diff and file', async () => {
    const { wp, runId } = setup();
    const lock = await w.call<Problem>('POST', `/runs/${runId}/locks`, { role: 'viewer', body: { path: 'src/billing/stripe.ts' } });
    expect(lock.status).toBe(403);
    const save = await w.call<Problem>('PUT', `/workpacks/${wp.id}/files`, { role: 'viewer', body: { path: 'src/billing/stripe.ts', content: 'x' } });
    expect(save.status).toBe(403);
    expect((await w.call('GET', `/workpacks/${wp.id}/diff?file=src/billing/stripe.ts`, { role: 'viewer' })).status).toBe(200);
    expect((await w.call('GET', `/workpacks/${wp.id}/files?path=src/billing/stripe.ts`, { role: 'viewer' })).status).toBe(200);
  });

  it('releases every human lock when the run ends', async () => {
    const { wp, runId } = setup();
    await w.call('POST', `/runs/${runId}/locks`, { role: 'engineer', userId: 'u-ada', name: 'Ada', body: { path: 'src/billing/stripe.ts' } });
    await w.call('PATCH', `/workpacks/${wp.id}/status`, { role: 'engineer', body: { status: 'cancelled' }, headers: withVersion(await get(wp.id)) });
    expect((await get(wp.id)).humanLockedFiles).toEqual([]);
    const late = await w.call<Problem>('POST', `/runs/${runId}/locks`, { role: 'engineer', userId: 'u-ada', name: 'Ada', body: { path: 'src/billing/types.ts' } });
    expect(late.body.type).toBe('run_not_active');
  });
});
