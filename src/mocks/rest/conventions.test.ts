import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Paged, Problem, Role, Workpack } from '../../contracts';
import { TEST_NOW_MS, addEpic, addWorkpack, createWorld, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

describe('REST conventions (spec §10.1)', () => {
  it('answers 401 as problem+json when the bearer token is missing or malformed', async () => {
    for (const authorization of [undefined, 'Bearer nonsense', 'Bearer mock:wizard:u1:Ada']) {
      const res = await fetch('http://localhost/api/v1/pipeline/status', {
        headers: { 'x-project': 'proj', ...(authorization ? { authorization } : {}) },
      });
      expect(res.status).toBe(401);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
      expect(((await res.json()) as Problem).type).toBe('unauthorized');
    }
  });

  it('requires a known project for project-scoped routes, and none for /me and /projects', async () => {
    const missing = await w.call<Problem>('GET', '/pipeline/status', { project: null });
    expect(missing.status).toBe(400);
    expect(missing.body.type).toBe('project_required');

    const unknown = await w.call<Problem>('GET', '/pipeline/status', { project: 'nope' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.type).toBe('project_not_found');

    const me = await w.call<{ name: string; role: Role; projects: { id: string }[] }>('GET', '/me', {
      project: null,
      role: 'engineer',
      name: 'Ada Lovelace',
    });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ name: 'Ada Lovelace', role: 'engineer' });
    expect(me.body.projects.map((p) => p.id)).toEqual(['proj']);

    const projects = await w.call<{ id: string; repo: string }[]>('GET', '/projects', { project: null });
    expect(projects.body).toEqual([expect.objectContaining({ id: 'proj', repo: 'acme/app' })]);
  });

  it('stamps every response with the server clock and a request id', async () => {
    const res = await w.call('GET', '/pipeline/status');
    expect(res.headers.get('x-server-time')).toBe(new Date(TEST_NOW_MS).toISOString());
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('reports errors as problem+json with a type slug, title and status', async () => {
    const res = await w.call<Problem>('GET', '/workpacks/WP-0000');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(res.body).toMatchObject({ type: 'not_found', status: 404 });
    expect(res.body.title).toMatch(/WP-0000/);
  });

  it('returns 422 validation_failed with a field path for a malformed body', async () => {
    const res = await w.call<Problem>('POST', '/workpacks', { role: 'engineer', body: { epicId: '', title: 'x' } });
    expect(res.status).toBe(422);
    expect(res.body.type).toBe('validation_failed');
    expect(res.body.errors?.map((e) => e.path)).toEqual(expect.arrayContaining(['epicId', 'title']));
  });
});

describe('role checks (spec Appendix G)', () => {
  const order: Role[] = ['viewer', 'engineer', 'maintainer', 'admin'];
  const cases: [method: string, path: string, min: Role][] = [
    ['POST', '/workpacks', 'engineer'],
    ['POST', '/epics', 'engineer'],
    ['POST', '/epics/preview', 'engineer'],
    ['POST', '/pipeline/pause', 'maintainer'],
    ['POST', '/pipeline/resume', 'maintainer'],
    ['PUT', '/budget', 'admin'],
  ];

  it.each(cases)('%s %s needs %s: lower roles get 403 with requiredRole, the minimum role gets through', async (method, path, min) => {
    for (const role of order.slice(0, order.indexOf(min))) {
      const denied = await w.call<Problem>(method, path, { role, body: {} });
      expect(denied.status, `${role} on ${path}`).toBe(403);
      expect(denied.body).toMatchObject({ type: 'forbidden', requiredRole: min });
    }
    const allowed = await w.call(method, path, { role: min, body: {} });
    expect(allowed.status, `${min} on ${path}`).not.toBe(403);
  });

  it('lets a viewer read everything the matrix leaves read-only', async () => {
    for (const path of ['/pipeline/status', '/workpacks', '/epics', '/budget', '/intake']) {
      expect((await w.call('GET', path, { role: 'viewer' })).status, path).toBe(200);
    }
  });
});

describe('Idempotency-Key', () => {
  const create = (epicId: string, over: Record<string, unknown> = {}) => ({
    epicId,
    title: 'Add retry with backoff',
    priority: 'P2 Normal',
    category: 'Backend',
    ...over,
  });

  it('replays the first response for a repeated key and does not repeat the side effect', async () => {
    const epic = addEpic(w.ps);
    const headers = { 'idempotency-key': 'k-1' };
    const first = await w.call<Workpack>('POST', '/workpacks', { role: 'engineer', body: create(epic.id), headers });
    const second = await w.call<Workpack>('POST', '/workpacks', { role: 'engineer', body: create(epic.id), headers });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    const list = await w.call<Paged<Workpack>>('GET', '/workpacks');
    expect(list.body.items).toHaveLength(1);
  });

  it('rejects the same key with a different body as 422 idempotency_conflict', async () => {
    const epic = addEpic(w.ps);
    const headers = { 'idempotency-key': 'k-2' };
    await w.call('POST', '/workpacks', { role: 'engineer', body: create(epic.id), headers });
    const clash = await w.call<Problem>('POST', '/workpacks', { role: 'engineer', body: create(epic.id, { title: 'A different title' }), headers });
    expect(clash.status).toBe(422);
    expect(clash.body.type).toBe('idempotency_conflict');
  });

  it('scopes keys to the caller, so two people can use the same key independently', async () => {
    const epic = addEpic(w.ps);
    const headers = { 'idempotency-key': 'shared' };
    await w.call('POST', '/workpacks', { role: 'engineer', userId: 'u-1', body: create(epic.id), headers });
    const other = await w.call<Workpack>('POST', '/workpacks', { role: 'engineer', userId: 'u-2', body: create(epic.id, { title: 'Second person' }), headers });
    expect(other.status).toBe(201);
    expect(w.ps.workpacks).toHaveLength(2);
  });
});

describe('optimistic concurrency (If-Match)', () => {
  const cancel = { status: 'cancelled' };

  it('requires If-Match on a versioned write (428)', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    const res = await w.call<Problem>('PATCH', `/workpacks/${wp.id}/status`, { role: 'engineer', body: cancel });
    expect(res.status).toBe(428);
    expect(res.body.type).toBe('precondition_required');
  });

  it('rejects a stale version with 409 stale_version and changes nothing', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    const stale = wp.version - 1;
    const res = await w.call<Problem>('PATCH', `/workpacks/${wp.id}/status`, { role: 'engineer', body: cancel, headers: { 'if-match': String(stale) } });
    expect(res.status).toBe(409);
    expect(res.body.type).toBe('stale_version');
    const after = await w.call<Workpack>('GET', `/workpacks/${wp.id}`);
    expect(after.body.status).toBe('in-progress');
  });

  it('accepts the current version, bumps it, and then refuses the old one', async () => {
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    const version = wp.version;
    const ok = await w.call<Workpack>('PATCH', `/workpacks/${wp.id}/status`, { role: 'engineer', body: cancel, headers: { 'if-match': `"${version}"` } });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('cancelled');
    expect(ok.body.version).toBeGreaterThan(version);

    const replay = await w.call<Problem>('PATCH', `/workpacks/${wp.id}/status`, { role: 'engineer', body: cancel, headers: { 'if-match': String(version) } });
    expect(replay.status).toBe(409);
    expect(replay.body.type).toBe('stale_version');
  });
});
