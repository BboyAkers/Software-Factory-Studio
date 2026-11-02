import { describe, expect, it } from 'vitest';
import {
  CAPACITY,
  admit,
  compareQueue,
  escalate,
  globsOverlap,
  needsEscalation,
  slaDueAt,
  slaState,
  type AdmissionContext,
  type QueueItem,
} from './queue';

const T0 = '2026-11-01T00:00:00.000Z';
const at = (hours: number) => new Date(Date.parse(T0) + hours * 3_600_000);

const item = (id: string, over: Partial<QueueItem> = {}): QueueItem => ({
  id,
  priority: 'P2 Normal',
  createdAt: T0,
  escalatedAt: null,
  targetFiles: [`src/${id}.ts`],
  dependsOn: [],
  pausedReasons: [],
  ...over,
});

const ctx = (over: Partial<AdmissionContext> = {}): AdmissionContext => ({
  queued: [],
  active: [],
  doneIds: new Set(),
  hardCapHit: false,
  integrationEnabled: true,
  projectPaused: false,
  ...over,
});

const activeN = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `ACT-${i}`, targetFiles: [`other/${i}.ts`] }));

describe('SLA (spec §5.1 rule 7)', () => {
  it('sets P0 due at +4h, P1 at +24h and gives P2 no due date', () => {
    expect(slaDueAt('P0 Blocker', T0)).toBe('2026-11-01T04:00:00.000Z');
    expect(slaDueAt('P1 High', T0)).toBe('2026-11-02T00:00:00.000Z');
    expect(slaDueAt('P2 Normal', T0)).toBeNull();
  });

  it('reports ok, due-soon (last quarter of the window) and breached', () => {
    const base = { priority: 'P0 Blocker' as const, slaDueAt: slaDueAt('P0 Blocker', T0), slaBreached: false, status: 'in-progress' as const };
    expect(slaState(base, at(1))).toMatchObject({ state: 'ok', remainingMs: 3 * 3_600_000 });
    expect(slaState(base, at(3.5)).state).toBe('due-soon');
    expect(slaState(base, at(4.5))).toMatchObject({ state: 'breached' });
    expect(slaState({ ...base, priority: 'P2 Normal', slaDueAt: null }, at(100))).toMatchObject({ state: 'none', remainingMs: null });
  });

  it('keeps showing breached once flagged, even after the workpack ends', () => {
    const s = slaState({ priority: 'P1 High', slaDueAt: slaDueAt('P1 High', T0), slaBreached: true, status: 'done' }, at(1));
    expect(s.state).toBe('breached');
  });

  it('escalates exactly once, only for open workpacks past due', () => {
    const open = { priority: 'P0 Blocker' as const, slaDueAt: slaDueAt('P0 Blocker', T0), slaBreached: false, status: 'queued' as const };
    expect(needsEscalation(open, at(3))).toBe(false);
    expect(needsEscalation(open, at(5))).toBe(true);
    expect(needsEscalation({ ...open, slaBreached: true }, at(5))).toBe(false);
    expect(needsEscalation({ ...open, status: 'done' }, at(5))).toBe(false);
  });

  it('never mutates priority when escalating', () => {
    const patch = escalate(at(5));
    expect(patch).toEqual({ slaBreached: true, escalatedAt: at(5).toISOString() });
    expect(patch).not.toHaveProperty('priority');
  });
});

describe('queue order (spec §5.1 rule 9)', () => {
  it('orders P0 before P1 before P2, FIFO inside a band', () => {
    const list = [
      item('c', { priority: 'P2 Normal', createdAt: '2026-11-01T00:00:03Z' }),
      item('b2', { priority: 'P1 High', createdAt: '2026-11-01T00:00:02Z' }),
      item('b1', { priority: 'P1 High', createdAt: '2026-11-01T00:00:01Z' }),
      item('a', { priority: 'P0 Blocker', createdAt: '2026-11-01T00:00:09Z' }),
    ];
    expect([...list].sort(compareQueue).map((i) => i.id)).toEqual(['a', 'b1', 'b2', 'c']);
  });

  it('moves an escalated P2 into the P0 band, ordered by when it escalated', () => {
    const list = [
      item('p0-late', { priority: 'P0 Blocker', createdAt: '2026-11-01T05:00:00Z' }),
      item('p2-escalated', { priority: 'P2 Normal', createdAt: '2026-10-31T00:00:00Z', escalatedAt: '2026-11-01T01:00:00Z' }),
      item('p1', { priority: 'P1 High', createdAt: '2026-10-31T00:00:00Z' }),
    ];
    expect([...list].sort(compareQueue).map((i) => i.id)).toEqual(['p2-escalated', 'p0-late', 'p1']);
  });
});

describe('admission (capacity, locks, deps, budget, pause)', () => {
  it('runs at most 8 workpacks at once', () => {
    expect(CAPACITY).toBe(8);
    const r = admit(ctx({ queued: [item('a'), item('b'), item('c')], active: activeN(6) }));
    expect(r.admitted).toEqual(['a', 'b']);
    expect(r.reasons.c).toEqual(['capacity']);
  });

  it('admits the highest priority first when slots are scarce', () => {
    const r = admit(
      ctx({
        queued: [item('low', { priority: 'P2 Normal' }), item('urgent', { priority: 'P0 Blocker', createdAt: '2026-11-01T09:00:00Z' })],
        active: activeN(7),
      }),
    );
    expect(r.admitted).toEqual(['urgent']);
  });

  it('queues behind a running workpack that holds an overlapping file, and says which one', () => {
    const r = admit(ctx({ queued: [item('b', { targetFiles: ['src/billing/stripe.ts'] })], active: [{ id: 'ACT-1', targetFiles: ['src/billing/**'] }] }));
    expect(r.admitted).toEqual([]);
    expect(r.reasons.b).toEqual(['file-lock']);
    expect(r.blockedBy.b).toBe('ACT-1');
  });

  it('lets the earlier of two overlapping queued workpacks start and blocks the other behind it', () => {
    const r = admit(
      ctx({
        queued: [
          item('first', { priority: 'P1 High', targetFiles: ['src/a.ts'] }),
          item('second', { priority: 'P2 Normal', targetFiles: ['src/a.ts'] }),
        ],
      }),
    );
    expect(r.admitted).toEqual(['first']);
    expect(r.blockedBy.second).toBe('first');
  });

  it('waits for dependencies to be done', () => {
    const waiting = admit(ctx({ queued: [item('b', { dependsOn: ['A'] })] }));
    expect(waiting.reasons.b).toEqual(['deps']);
    const ready = admit(ctx({ queued: [item('b', { dependsOn: ['A'] })], doneIds: new Set(['A']) }));
    expect(ready.admitted).toEqual(['b']);
  });

  it('lists every reason in precedence order: integration-off, budget, paused, deps, file-lock, capacity', () => {
    const r = admit(
      ctx({
        queued: [item('x', { dependsOn: ['A'], pausedReasons: ['manual-workpack'], targetFiles: ['src/s.ts'] })],
        active: [...activeN(8), { id: 'LOCK', targetFiles: ['src/s.ts'] }],
        hardCapHit: true,
        integrationEnabled: false,
      }),
    );
    expect(r.reasons.x).toEqual(['integration-off', 'budget', 'paused', 'deps', 'file-lock', 'capacity']);
    expect(r.admitted).toEqual([]);
  });

  it('holds everything while the project is paused globally or the hard cap is hit', () => {
    expect(admit(ctx({ queued: [item('a')], projectPaused: true })).reasons.a).toEqual(['paused']);
    expect(admit(ctx({ queued: [item('a')], hardCapHit: true })).reasons.a).toEqual(['budget']);
  });
});

describe('glob-aware file overlap', () => {
  it('treats equal paths and containing globs as overlapping', () => {
    expect(globsOverlap(['src/a.ts'], ['src/a.ts'])).toBe(true);
    expect(globsOverlap(['src/billing/**'], ['src/billing/stripe.ts'])).toBe(true);
    expect(globsOverlap(['src/billing/stripe.ts'], ['src/billing/**'])).toBe(true);
    expect(globsOverlap(['src/*.ts'], ['src/a.ts'])).toBe(true);
  });

  it('treats disjoint paths and sibling directories as separate', () => {
    expect(globsOverlap(['src/a.ts'], ['src/b.ts'])).toBe(false);
    expect(globsOverlap(['src/billing/**'], ['src/auth/**'])).toBe(false);
    expect(globsOverlap(['src/billing/**'], ['src/billing-v2/x.ts'])).toBe(false);
    expect(globsOverlap(['src/*.ts'], ['src/deep/a.ts'])).toBe(false);
  });

  it('overlaps two wildcard patterns that share a directory prefix', () => {
    expect(globsOverlap(['src/billing/**'], ['src/billing/api/**'])).toBe(true);
  });
});
