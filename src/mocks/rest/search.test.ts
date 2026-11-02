import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SearchResponseSchema, type Problem, type Role, type SearchResponse } from '../../contracts';
import { emitLog } from '../backend/runtime';
import { addEpic, addWorkpack, advance, createWorld, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

type Failure = Omit<Problem, 'status'>;

const search = (q: string, scope?: string, role: Role = 'viewer') =>
  w.call<SearchResponse & Failure>('GET', `/search?q=${encodeURIComponent(q)}${scope === undefined ? '' : `&scope=${encodeURIComponent(scope)}`}`, { role });
const items = async (q: string, scope?: string) => (await search(q, scope)).body.items;
const scopesOf = async (q: string, scope?: string) => (await items(q, scope)).map((i) => i.scope);

/** Two epics; a running, a queued and a merged workpack; two log lines on the running one. */
function arrange() {
  const billing = addEpic(w.ps, { title: 'Stripe billing retries', areas: ['billing', 'webhooks'], priority: 'P1 High' });
  const index = addEpic(w.ps, { title: 'Search index rebuild', areas: ['search'] });
  const retry = addWorkpack(w.ps, {
    epicId: billing.id,
    status: 'in-progress',
    title: 'Add retry with backoff',
    priority: 'P1 High',
    targetFiles: ['src/billing/stripe.ts', 'src/billing/**'],
  });
  const queued = addWorkpack(w.ps, { epicId: index.id, status: 'queued', title: 'Rebuild the index', targetFiles: ['src/search/indexer.ts'] });
  const merged = addWorkpack(w.ps, { epicId: billing.id, status: 'done', title: 'Ledger types', targetFiles: ['src/billing/ledger.ts'] });
  return { billing, index, retry, queued, merged };
}

describe('searching', () => {
  it('finds nothing for an empty or blank query, and says what it searched for', async () => {
    arrange();
    for (const q of ['', '   ']) {
      const res = await search(q);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ query: '', items: [] });
    }
  });

  it('finds nothing, without an error, when nothing matches', async () => {
    arrange();
    expect((await search('zzz-no-such-thing')).body).toEqual({ query: 'zzz-no-such-thing', items: [] });
  });

  it('matches without regard to case', async () => {
    arrange();
    const upper = await items('STRIPE');
    expect(upper.length).toBeGreaterThan(0);
    expect(upper).toEqual(await items('stripe'));
  });

  it('is readable by a viewer', async () => {
    arrange();
    expect((await search('stripe', undefined, 'viewer')).status).toBe(200);
  });

  describe('epics', () => {
    it('matches an Epic by title, area or id, and links to Mission Control', async () => {
      const { billing } = arrange();
      const expected = { scope: 'epics', id: billing.id, title: 'Stripe billing retries', subtitle: 'executing · P1 High', to: `mission?epic=${billing.id}` };
      expect((await items('stripe', 'epics'))[0]).toEqual(expected);
      expect((await items('webhooks', 'epics'))[0]).toEqual(expected);
      expect((await items(billing.id.toLowerCase(), 'epics'))[0]).toEqual(expected);
    });

    it('leaves out an Epic that does not match', async () => {
      arrange();
      expect((await items('billing', 'epics')).map((i) => i.title)).toEqual(['Stripe billing retries']);
    });
  });

  describe('workpacks', () => {
    it('matches a workpack by id, title, branch or category, and links to its drawer', async () => {
      const { retry, billing } = arrange();
      const expected = { scope: 'workpacks', id: retry.id, title: 'Add retry with backoff', subtitle: `in-progress · ${billing.id}`, to: `matrix/${retry.id}` };
      expect((await items(retry.id, 'workpacks'))[0]).toEqual(expected);
      expect((await items('with backoff', 'workpacks'))[0]).toEqual(expected);
      expect((await items('add-retry-with', 'workpacks'))[0]).toEqual(expected);
      expect((await items('backend', 'workpacks')).map((i) => i.id)).toContain(retry.id);
    });

    it('puts an exact id match first, ahead of a workpack that merely mentions it', async () => {
      const { retry, billing } = arrange();
      addWorkpack(w.ps, { epicId: billing.id, status: 'queued', title: `Follow-up to ${retry.id}`, targetFiles: ['src/follow-up.ts'] });
      const found = await items(retry.id.toLowerCase(), 'workpacks');
      expect(found).toHaveLength(2);
      expect(found[0]!.id).toBe(retry.id);
    });
  });

  describe('files', () => {
    it('matches a path a workpack touches and links to the workspace on that file, at the active run', async () => {
      const { retry } = arrange();
      expect((await items('stripe.ts', 'files'))[0]).toEqual({
        scope: 'files',
        id: `${retry.id}:src/billing/stripe.ts`,
        title: 'src/billing/stripe.ts',
        subtitle: retry.id,
        to: `workspace/${retry.id}/${retry.run!.id}?file=src/billing/stripe.ts`,
      });
    });

    it('links a finished workpack’s file to its latest run, and a workpack that never ran to its drawer', async () => {
      const { merged, queued } = arrange();
      const [ledger] = await items('ledger.ts', 'files');
      expect(ledger).toMatchObject({ subtitle: merged.id, to: `workspace/${merged.id}/${merged.run!.id}?file=src/billing/ledger.ts` });
      const [indexer] = await items('indexer.ts', 'files');
      expect(indexer).toMatchObject({ subtitle: queued.id, to: `matrix/${queued.id}` });
    });

    it('escapes what a link cannot carry, and keeps the slashes', async () => {
      const { billing } = arrange();
      const wp = addWorkpack(w.ps, { epicId: billing.id, status: 'queued', title: 'Notes', targetFiles: ['docs/my notes & more.md'] });
      const [found] = await items('my notes', 'files');
      expect(found).toMatchObject({ title: 'docs/my notes & more.md', to: `matrix/${wp.id}` });

      const running = addWorkpack(w.ps, { epicId: billing.id, status: 'in-progress', title: 'Running notes', targetFiles: ['docs/run notes.md'] });
      const [live] = await items('run notes', 'files');
      expect(live!.to).toBe(`workspace/${running.id}/${running.run!.id}?file=docs/run%20notes.md`);
    });

    it('leaves out the glob a workpack reserves, which is not a file', async () => {
      arrange();
      expect((await items('billing', 'files')).map((i) => i.title).sort()).toEqual(['src/billing/ledger.ts', 'src/billing/stripe.ts']);
    });

    it('includes files the workpack has opened that are not among its target files, once each', async () => {
      const { retry } = arrange();
      const state = (path: string) => ({ path, original: '', modified: '', final: '', lockedBy: null, writing: false });
      w.ps.files.set(retry.id, [state('src/billing/stripe.ts'), state('src/billing/generated.ts')]);
      expect((await items('billing', 'files')).map((i) => i.title).sort()).toEqual(['src/billing/generated.ts', 'src/billing/ledger.ts', 'src/billing/stripe.ts']);
    });

    it('keeps a path that two workpacks touch as two results, one per workpack', async () => {
      const { retry, billing } = arrange();
      const other = addWorkpack(w.ps, { epicId: billing.id, status: 'queued', title: 'Another change', targetFiles: ['src/billing/stripe.ts'] });
      const found = await items('stripe.ts', 'files');
      expect(found.map((i) => i.subtitle).sort()).toEqual([retry.id, other.id].sort());
      expect(new Set(found.map((i) => i.id)).size).toBe(2);
    });
  });

  describe('logs', () => {
    it('matches a log line, newest first, and links to the run in Mission Control', async () => {
      const { retry } = arrange();
      const runId = retry.run!.id;
      emitLog(w.ps, runId, 'info', 'sandbox', 'Retrying webhook delivery after 429 from Stripe');
      advance(w, 1000);
      emitLog(w.ps, runId, 'warn', 'gate', 'Coverage dipped below 80% on stripe.ts');

      const found = await items('stripe', 'logs');
      expect(found.map((i) => i.title)).toEqual(['Coverage dipped below 80% on stripe.ts', 'Retrying webhook delivery after 429 from Stripe']);
      expect(found[0]).toMatchObject({ scope: 'logs', subtitle: `gate · ${runId}`, to: `mission/${retry.id}/${runId}` });
      expect(found[1]!.subtitle).toBe(`sandbox · ${runId}`);
      expect(new Set(found.map((i) => i.id)).size).toBe(2);
    });

    it('shortens a long line to 80 characters', async () => {
      const { retry } = arrange();
      const message = `Stripe replied with a long error body: ${'x'.repeat(120)}`;
      emitLog(w.ps, retry.run!.id, 'error', 'sandbox', message);
      const [found] = await items('stripe replied', 'logs');
      expect(found!.title.length).toBeLessThanOrEqual(80);
      expect(found!.title.endsWith('…')).toBe(true);
      expect(message.startsWith(found!.title.slice(0, -1))).toBe(true);
    });

    it('orders lines from different runs by when they were written', async () => {
      const { retry, merged } = arrange();
      emitLog(w.ps, merged.run!.id, 'info', 'docs', 'Wrote the stripe changelog entry');
      advance(w, 5000);
      emitLog(w.ps, retry.run!.id, 'info', 'sandbox', 'Stripe sandbox ready');
      expect((await items('stripe', 'logs')).map((i) => i.subtitle)).toEqual([`sandbox · ${retry.run!.id}`, `docs · ${merged.run!.id}`]);
    });
  });

  describe('prefixes', () => {
    it.each([
      ['epic:', 'billing', 'epics'],
      ['wp:', 'retry', 'workpacks'],
      ['file:', 'billing', 'files'],
      ['log:', 'retry', 'logs'],
    ] as const)('%s narrows the search to %s and is stripped from the query', async (prefix, term, scope) => {
      const { retry } = arrange();
      emitLog(w.ps, retry.run!.id, 'info', 'sandbox', 'Retrying webhook delivery');
      const res = (await search(`${prefix}${term}`)).body;
      expect(res.query).toBe(term);
      expect(res.items.length).toBeGreaterThan(0);
      expect(res.items.every((i) => i.scope === scope)).toBe(true);
      expect((await scopesOf(term)).length).toBeGreaterThan(res.items.length);
    });

    it('ignores case and spaces after the prefix, and finds nothing for a prefix alone', async () => {
      arrange();
      expect((await search('EPIC:  stripe')).body).toMatchObject({ query: 'stripe' });
      expect(await scopesOf('EPIC:  stripe')).toEqual(['epics']);
      expect((await search('epic:')).body).toEqual({ query: '', items: [] });
    });

    it('treats an unknown prefix as part of the text', async () => {
      arrange();
      expect((await search('foo:billing')).body).toEqual({ query: 'foo:billing', items: [] });
    });
  });

  describe('scope', () => {
    it('limits the search to the scopes named, in the order epics, workpacks, files, logs', async () => {
      const { retry, billing } = arrange();
      addWorkpack(w.ps, { epicId: billing.id, status: 'queued', title: 'Billing export', targetFiles: ['src/export/csv.ts'] });
      emitLog(w.ps, retry.run!.id, 'info', 'sandbox', 'Billing retry started');
      expect(await scopesOf('billing')).toEqual(['epics', 'workpacks', 'files', 'files', 'logs']);
      expect(await scopesOf('billing', 'logs,epics')).toEqual(['epics', 'logs']);
      expect(await scopesOf('billing', 'files')).toEqual(['files', 'files']);
    });

    it('tolerates spaces, repeats and an empty value', async () => {
      arrange();
      expect(await scopesOf('billing', 'epics, epics')).toEqual(['epics']);
      expect((await scopesOf('billing', '')).length).toBeGreaterThan(1);
    });

    it('narrows further by a prefix, and finds nothing when the two disagree', async () => {
      arrange();
      expect(await scopesOf('file:billing', 'files,epics')).toEqual(['files', 'files']);
      expect(await scopesOf('file:billing', 'epics')).toEqual([]);
    });

    it('rejects a scope that does not exist, naming the field', async () => {
      const res = await search('billing', 'epics,tickets');
      expect(res.status).toBe(422);
      expect(res.body.type).toBe('validation_failed');
      expect(res.body.errors?.[0]).toMatchObject({ path: 'scope' });
      expect(res.body.errors![0]!.message).toContain('tickets');
    });
  });

  describe('limits', () => {
    function crowd() {
      const epics = Array.from({ length: 8 }, (_, i) => addEpic(w.ps, { title: `Zeta epic ${i}` }));
      const workpacks = epics.map((e, i) => addWorkpack(w.ps, { epicId: e.id, status: 'in-progress', title: `Zeta change ${i}`, targetFiles: [`src/zeta/file-${i}.ts`] }));
      for (let i = 0; i < 8; i++) emitLog(w.ps, workpacks[0]!.run!.id, 'info', 'agent', `Zeta log line ${i}`);
      return { epics, workpacks };
    }

    it('returns at most six per scope and twenty in all, so the last scope gives way first', async () => {
      crowd();
      const scopes = await scopesOf('zeta');
      expect(scopes).toHaveLength(20);
      const count = (scope: string) => scopes.filter((s) => s === scope).length;
      expect([count('epics'), count('workpacks'), count('files'), count('logs')]).toEqual([6, 6, 6, 2]);
      expect(scopes).toEqual([...Array(6).fill('epics'), ...Array(6).fill('workpacks'), ...Array(6).fill('files'), ...Array(2).fill('logs')]);
    });

    it('gives a scope its six when it is the only one asked for', async () => {
      crowd();
      expect(await scopesOf('zeta', 'logs')).toHaveLength(6);
      expect(await scopesOf('zeta', 'files')).toHaveLength(6);
    });

    it('keeps the newest Epics and logs when it has to cut', async () => {
      const { epics } = crowd();
      const found = await items('zeta', 'epics');
      expect(found.map((i) => i.id)).toEqual(epics.slice(2).reverse().map((e) => e.id));
      const logs = await items('zeta log', 'logs');
      expect(logs[0]!.title).toBe('Zeta log line 7');
    });
  });

  describe('the project', () => {
    it('searches the project named in X-Project only', async () => {
      arrange();
      expect((await w.call<SearchResponse>('GET', '/search?q=stripe', { project: 'proj' })).body.items.length).toBeGreaterThan(0);

      const connected = await w.call('POST', '/projects/connect', {
        project: null,
        body: { repo: 'acme/new-app', token: `github_pat_${'x'.repeat(30)}`, monthlyCapUsd: 500 },
      });
      expect(connected.status).toBe(201);
      expect((await w.call<SearchResponse>('GET', '/search?q=stripe', { project: 'acme-new-app' })).body.items).toEqual([]);
      expect((await w.call<Problem>('GET', '/search?q=stripe', { project: 'nope' })).status).toBe(404);
    });

    it('answers a search for every scope with the contract shape', async () => {
      const { retry, billing } = arrange();
      addWorkpack(w.ps, { epicId: billing.id, status: 'queued', title: 'Billing export', targetFiles: ['src/export/csv.ts'] });
      emitLog(w.ps, retry.run!.id, 'info', 'sandbox', 'Billing retry started');
      const parsed = SearchResponseSchema.parse((await search('billing')).body);
      expect(new Set(parsed.items.map((i) => i.scope))).toEqual(new Set(['epics', 'workpacks', 'files', 'logs']));
    });
  });
});
