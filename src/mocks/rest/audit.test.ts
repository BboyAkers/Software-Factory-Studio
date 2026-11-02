import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditEntrySchema, VerifyResultSchema, type AuditEntry, type Paged, type Problem, type Role, type VerifyResult } from '../../contracts';
import { verifyChain } from '../../domain/auditChain';
import { corruptAuditEntry } from '../backend/audit';
import { flushAudit, nowIso, recordAudit } from '../backend/runtime';
import { SYSTEM_ACTOR, type Actor } from '../backend/store';
import { TEST_NOW_MS, createWorld, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

const MIN = 60_000;
const at = (minutesAgo: number) => new Date(TEST_NOW_MS - minutesAgo * MIN).toISOString();

const ada: Actor = { id: 'u-ada', name: 'Ada Lovelace', role: 'engineer', type: 'user' };
const bob: Actor = { id: 'u-bob', name: 'Bob Barker', role: 'maintainer', type: 'user' };
const codecraft: Actor = { id: 'codecraft', name: 'CodeCraft', role: 'admin', type: 'agent' };

/** Eight entries, oldest first, ten minutes apart. `workpacks.imported` shares a word with `workpack.*` on purpose. */
async function arrange(): Promise<void> {
  recordAudit(w.ps, ada, 'workpack.created', { workpackId: 'WP-2801', epicId: 'EPIC-1001' }, at(80));
  recordAudit(w.ps, codecraft, 'workpack.in-progress', { workpackId: 'WP-2801' }, at(70));
  recordAudit(w.ps, SYSTEM_ACTOR, 'intake.accepted', { issueNumber: 101 }, at(60));
  recordAudit(w.ps, bob, 'workpack.forked', { workpackId: 'WP-2801', forkId: 'WP-2802' }, at(50));
  recordAudit(w.ps, bob, 'workpack.rolled_back', { workpackId: 'WP-2803', revertId: 'WP-2804' }, at(40));
  recordAudit(w.ps, ada, 'budget.updated', { monthlyCapUsd: 6000 }, at(30));
  recordAudit(w.ps, ada, 'policy.updated', { fields: ['sastStrictness'] }, at(20));
  recordAudit(w.ps, bob, 'workpacks.imported', {}, at(10));
  await flushAudit(w.ps);
}

const list = async (query = '', role: Role = 'viewer') => (await w.call<Paged<AuditEntry>>('GET', `/audit${query}`, { role })).body;
const actions = async (query = '') => (await list(query)).items.map((e) => e.action);

describe('listing the audit log', () => {
  it('returns entries newest first in the contract shape', async () => {
    await arrange();
    const res = await w.call<Paged<AuditEntry>>('GET', '/audit');
    expect(res.status).toBe(200);
    const items = res.body.items.map((e) => AuditEntrySchema.parse(e));
    expect(items).toHaveLength(8);
    expect(items[0]!.action).toBe('workpacks.imported');
    expect(items.at(-1)!.action).toBe('workpack.created');
    expect(items.every((e) => e.projectId === 'proj')).toBe(true);
    expect(res.body.nextCursor).toBeNull();
    expect(items[7]).toMatchObject({ actor: 'u-ada', actorType: 'user', actorName: 'Ada Lovelace', target: { workpackId: 'WP-2801', epicId: 'EPIC-1001' } });
  });

  it('waits for appends that are still being written', async () => {
    recordAudit(w.ps, ada, 'epic.paused', { epicId: 'EPIC-1001' });
    expect(w.ps.audit).toHaveLength(0);
    expect(await actions()).toEqual(['epic.paused']);
  });

  it('pages with a cursor and a limit, newest first, without losing or repeating entries', async () => {
    await arrange();
    const first = await list('?limit=3');
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toBe('3');
    const second = await list(`?limit=3&cursor=${first.nextCursor}`);
    expect(second.nextCursor).toBe('6');
    const last = await list(`?limit=3&cursor=${second.nextCursor}`);
    expect(last.items).toHaveLength(2);
    expect(last.nextCursor).toBeNull();
    const all = [...first.items, ...second.items, ...last.items].map((e) => e.action);
    expect(all).toEqual(await actions());
  });

  it('caps the page size at 200 and falls back to 50 for a limit that makes no sense', async () => {
    await arrange();
    for (let i = 0; i < 60; i++) recordAudit(w.ps, ada, 'epic.paused', { epicId: `EPIC-${1000 + i}` }, at(5));
    await flushAudit(w.ps);
    expect((await list('?limit=1000')).items).toHaveLength(68);
    for (const limit of ['0', '-3', 'many']) {
      const page = await list(`?limit=${limit}`);
      expect(page.items, limit).toHaveLength(50);
      expect(page.nextCursor, limit).toBe('50');
    }
  });

  it('is empty, not an error, for a project with no entries', async () => {
    expect(await list()).toEqual({ items: [], nextCursor: null });
  });

  it('lets a viewer read it', async () => {
    await arrange();
    expect((await w.call('GET', '/audit', { role: 'viewer' })).status).toBe(200);
  });
});

describe('filtering', () => {
  beforeEach(arrange);

  it('finds a workpack by its id, as the fork it became, or as the revert opened for it', async () => {
    expect(await actions('?workpack=WP-2801')).toEqual(['workpack.forked', 'workpack.in-progress', 'workpack.created']);
    expect(await actions('?workpack=WP-2802')).toEqual(['workpack.forked']);
    expect(await actions('?workpack=WP-2803')).toEqual(['workpack.rolled_back']);
    expect(await actions('?workpack=WP-2804')).toEqual(['workpack.rolled_back']);
    expect(await actions('?workpack=WP-9999')).toEqual([]);
  });

  it('matches an actor by id or by name, ignoring case', async () => {
    expect(await actions('?actor=u-ada')).toHaveLength(3);
    expect(await actions(`?actor=${encodeURIComponent('BOB BARKER')}`)).toHaveLength(3);
    expect(await actions('?actor=codecraft')).toEqual(['workpack.in-progress']);
    expect(await actions('?actor=system')).toEqual(['intake.accepted']);
    expect(await actions('?actor=Factory')).toEqual(['intake.accepted']);
    expect(await actions('?actor=nobody')).toEqual([]);
  });

  it('matches an action exactly or as a dotted prefix, never as a loose word', async () => {
    expect(await actions('?action=budget.updated')).toEqual(['budget.updated']);
    expect(await actions('?action=workpack')).toEqual(['workpack.rolled_back', 'workpack.forked', 'workpack.in-progress', 'workpack.created']);
    expect(await actions('?action=workpack.created')).toEqual(['workpack.created']);
    expect(await actions('?action=work')).toEqual([]);
  });

  it('keeps entries from since to until, both ends included', async () => {
    expect(await actions(`?since=${encodeURIComponent(at(50))}&until=${encodeURIComponent(at(30))}`)).toEqual(['budget.updated', 'workpack.rolled_back', 'workpack.forked']);
    expect(await actions(`?since=${encodeURIComponent(at(20))}`)).toEqual(['workpacks.imported', 'policy.updated']);
    expect(await actions(`?until=${encodeURIComponent(at(70))}`)).toEqual(['workpack.in-progress', 'workpack.created']);
  });

  it('combines filters', async () => {
    expect(await actions('?actor=u-bob&action=workpack')).toEqual(['workpack.rolled_back', 'workpack.forked']);
    expect(await actions('?actor=u-ada&workpack=WP-2801')).toEqual(['workpack.created']);
  });

  it('rejects a since or until that is not a timestamp, naming the field', async () => {
    const res = await w.call<Problem>('GET', '/audit?since=yesterday&until=later');
    expect(res.status).toBe(422);
    expect(res.body.type).toBe('validation_failed');
    expect(res.body.errors?.map((e) => e.path).sort()).toEqual(['since', 'until']);
  });
});

describe('verifying the hash chain', () => {
  beforeEach(arrange);
  const verify = async (query = '', role: Role = 'viewer') => w.call<VerifyResult>('GET', `/audit/verify${query}`, { role });

  it('verifies every entry of an untouched chain', async () => {
    const res = await verify();
    expect(res.status).toBe(200);
    expect(VerifyResultSchema.parse(res.body)).toEqual({ ok: true, checked: 8, brokenAtId: null, reason: null });
  });

  it('verifies a range by starting from the hash of the entry just before it', async () => {
    const res = await verify(`?since=${encodeURIComponent(at(60))}&until=${encodeURIComponent(at(30))}`);
    expect(res.body).toEqual({ ok: true, checked: 4, brokenAtId: null, reason: null });
  });

  it('checks nothing, and passes, when no entry falls in the range', async () => {
    const res = await verify(`?since=${encodeURIComponent(new Date(TEST_NOW_MS + MIN).toISOString())}`);
    expect(res.body).toEqual({ ok: true, checked: 0, brokenAtId: null, reason: null });
  });

  it('rejects a range that is not a timestamp', async () => {
    expect((await verify('?since=soon')).status).toBe(422);
  });

  it('names the altered entry, from the middle of the chain, and says why', async () => {
    const id = corruptAuditEntry(w.ps)!;
    expect(id).toEqual(expect.any(String));
    expect([w.ps.audit[0]!.id, w.ps.audit.at(-1)!.id]).not.toContain(id);

    const res = await verify();
    expect(res.body).toMatchObject({ ok: false, brokenAtId: id, checked: w.ps.audit.findIndex((e) => e.id === id) });
    expect(res.body.reason).toMatch(/hash mismatch/);
    const listed = (await list('?limit=50')).items.find((e) => e.id === id)!;
    expect(listed.action).toMatch(/tampered/);
  });

  it('still verifies a range that ends before the altered entry, or starts after it', async () => {
    const id = corruptAuditEntry(w.ps)!;
    const index = w.ps.audit.findIndex((e) => e.id === id);
    const before = w.ps.audit[index - 1]!.createdAt;
    const after = w.ps.audit[index + 1]!.createdAt;
    expect((await verify(`?until=${encodeURIComponent(before)}`)).body.ok).toBe(true);
    expect((await verify(`?since=${encodeURIComponent(after)}`)).body.ok).toBe(true);
    expect((await verify(`?since=${encodeURIComponent(before)}&until=${encodeURIComponent(after)}`)).body.ok).toBe(false);
  });

  it('has nothing to corrupt in an empty chain', () => {
    const empty = createWorld({ platform: false });
    try {
      expect(corruptAuditEntry(empty.ps)).toBeNull();
    } finally {
      empty.close();
    }
  });
});

/** Minimal RFC 4180 reader, so the export is checked as a spreadsheet would read it. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) rows.push([...row, field]);
  return rows;
}

describe('exporting for a SIEM', () => {
  beforeEach(arrange);
  const exportAs = (format: string, role: Role = 'maintainer', extra = '') => w.call<string>('GET', `/audit/export?format=${format}${extra}`, { role });

  it('is for a maintainer: lower roles get 403 naming the role, maintainers and admins get the file', async () => {
    for (const role of ['viewer', 'engineer'] as const) {
      const denied = await w.call<Problem>('GET', '/audit/export?format=ndjson', { role });
      expect(denied.status, role).toBe(403);
      expect(denied.body).toMatchObject({ type: 'forbidden', requiredRole: 'maintainer' });
    }
    for (const role of ['maintainer', 'admin'] as const) expect((await exportAs('ndjson', role)).status, role).toBe(200);
  });

  it('writes NDJSON, one entry per line, oldest first, that still verifies as a chain', async () => {
    const res = await exportAs('ndjson');
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="audit-proj-2026-11-15.ndjson"');
    expect(res.headers.get('x-server-time')).toBe(nowIso(w.store));
    expect(res.headers.get('x-request-id')).toBeTruthy();

    const lines = res.body.trim().split('\n');
    expect(lines).toHaveLength(8);
    const entries = lines.map((line) => AuditEntrySchema.parse(JSON.parse(line)));
    expect(entries[0]!.action).toBe('workpack.created');
    expect(entries.at(-1)!.action).toBe('workpacks.imported');
    expect(await verifyChain(entries)).toMatchObject({ ok: true, checked: 8 });
  });

  it('writes CSV with the fixed header and RFC 4180 quoting, the target as JSON', async () => {
    recordAudit(w.ps, ada, 'note,with "quotes"\nand a line break', { text: 'He said "hi", twice' }, at(5));
    await flushAudit(w.ps);

    const res = await exportAs('csv');
    expect(res.headers.get('content-type')).toBe('text/csv');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="audit-proj-2026-11-15.csv"');

    const rows = parseCsv(res.body);
    expect(rows[0]).toEqual(['id', 'createdAt', 'actorType', 'actor', 'action', 'target', 'prevHash', 'hash']);
    expect(rows).toHaveLength(10);
    const first = rows[1]!;
    expect(first.slice(2, 5)).toEqual(['user', 'u-ada', 'workpack.created']);
    expect(JSON.parse(first[5]!)).toEqual({ workpackId: 'WP-2801', epicId: 'EPIC-1001' });
    const odd = rows.find((r) => r[4]?.startsWith('note,'))!;
    expect(odd[4]).toBe('note,with "quotes"\nand a line break');
    expect(JSON.parse(odd[5]!)).toEqual({ text: 'He said "hi", twice' });
    expect(odd[7]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('exports only the requested range', async () => {
    const range = `&since=${encodeURIComponent(at(50))}&until=${encodeURIComponent(at(30))}`;
    const lines = (await exportAs('ndjson', 'maintainer', range)).body.trim().split('\n');
    expect(lines.map((l) => (JSON.parse(l) as AuditEntry).action)).toEqual(['workpack.forked', 'workpack.rolled_back', 'budget.updated']);
  });

  it('exports an empty file for an empty range', async () => {
    const res = await exportAs('ndjson', 'maintainer', `&since=${encodeURIComponent(new Date(TEST_NOW_MS + MIN).toISOString())}`);
    expect(res.status).toBe(200);
    expect(res.body ?? '').toBe('');
  });

  it('exports just the header row of a CSV for an empty range', async () => {
    const res = await exportAs('csv', 'maintainer', `&since=${encodeURIComponent(new Date(TEST_NOW_MS + MIN).toISOString())}`);
    expect(res.body).toBe('id,createdAt,actorType,actor,action,target,prevHash,hash\n');
  });

  it('defaults to NDJSON and rejects a format it does not know', async () => {
    expect((await w.call('GET', '/audit/export', { role: 'maintainer' })).headers.get('content-type')).toBe('application/x-ndjson');
    const res = await w.call<Problem>('GET', '/audit/export?format=xml', { role: 'maintainer' });
    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.path).toBe('format');
  });
});
