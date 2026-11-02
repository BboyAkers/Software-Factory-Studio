import { describe, expect, it } from 'vitest';
import { applyFactoryEvent, type CacheOps } from './streamReducer';
import { keys } from './queryKeys';
import type { Envelope, FactoryEvent } from '../contracts';

const P = 'proj';

class MemoryCache implements CacheOps {
  private entries = new Map<string, unknown>();
  invalidated: (readonly unknown[])[] = [];

  set(key: readonly unknown[], value: unknown) {
    this.entries.set(JSON.stringify(key), value);
  }
  get<T>(key: readonly unknown[]): T {
    return this.entries.get(JSON.stringify(key)) as T;
  }
  update(prefix: readonly unknown[], updater: (old: unknown) => unknown) {
    const head = JSON.stringify(prefix).slice(0, -1);
    for (const [k, v] of this.entries) {
      if ((k.startsWith(`${head},`) || k === JSON.stringify(prefix)) && v !== undefined) this.entries.set(k, updater(v));
    }
  }
  invalidate(prefix: readonly unknown[]) {
    this.invalidated.push(prefix);
  }
  wasInvalidated(prefix: readonly unknown[]) {
    return this.invalidated.some((p) => JSON.stringify(p) === JSON.stringify(prefix));
  }
}

const env = (event: FactoryEvent, over: Partial<Envelope> = {}): Envelope => ({
  id: '1',
  ts: '2026-11-01T10:00:00.000Z',
  projectId: P,
  event,
  ...over,
});

const wp = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  status: 'in-progress',
  version: 3,
  completeness: 40,
  linesAdded: 10,
  linesRemoved: 2,
  attempt: 1,
  paused: false,
  pausedReasons: [] as string[],
  slaBreached: false,
  escalatedAt: null,
  humanLockedFiles: [] as string[],
  queuedReason: null,
  blockedBy: null,
  archived: false,
  ...over,
});

function seeded() {
  const cache = new MemoryCache();
  cache.set(keys.workpackList(P, { status: 'all' }), { items: [wp('WP-1'), wp('WP-2')], nextCursor: null });
  cache.set(keys.workpack(P, 'WP-1'), wp('WP-1'));
  return cache;
}

describe('applying stream events to the query cache (spec §10.3)', () => {
  it('patches status and version in the detail and the list, leaving other workpacks alone', () => {
    const cache = seeded();
    applyFactoryEvent(cache, P, env({ type: 'workpack.status_changed', workpackId: 'WP-1', from: 'in-progress', to: 'verification', version: 4 }));
    expect(cache.get<any>(keys.workpack(P, 'WP-1'))).toMatchObject({ status: 'verification', version: 4 });
    const list = cache.get<any>(keys.workpackList(P, { status: 'all' }));
    expect(list.items[0]).toMatchObject({ id: 'WP-1', status: 'verification', version: 4 });
    expect(list.items[1]).toMatchObject({ id: 'WP-2', status: 'in-progress', version: 3 });
  });

  it('refetches the lists and the pipeline after a status change because membership can change', () => {
    const cache = seeded();
    applyFactoryEvent(cache, P, env({ type: 'workpack.status_changed', workpackId: 'WP-1', from: 'queued', to: 'planning', version: 4 }));
    expect(cache.wasInvalidated(keys.workpackLists(P))).toBe(true);
    expect(cache.wasInvalidated(keys.pipeline(P))).toBe(true);
    expect(cache.wasInvalidated(keys.epics(P))).toBe(true);
  });

  it('patches progress in place without refetching', () => {
    const cache = seeded();
    applyFactoryEvent(cache, P, env({ type: 'workpack.progress', workpackId: 'WP-1', completeness: 88, linesAdded: 48, linesRemoved: 12, attempt: 2 }));
    expect(cache.get<any>(keys.workpack(P, 'WP-1'))).toMatchObject({ completeness: 88, linesAdded: 48, linesRemoved: 12, attempt: 2 });
    expect(cache.invalidated).toEqual([]);
  });

  it('derives paused from the reasons on pause and resume events', () => {
    const cache = seeded();
    applyFactoryEvent(cache, P, env({ type: 'workpack.paused', workpackId: 'WP-1', reasons: ['manual-workpack'], actor: 'ada', version: 4 }));
    expect(cache.get<any>(keys.workpack(P, 'WP-1'))).toMatchObject({ paused: true, pausedReasons: ['manual-workpack'], version: 4 });
    applyFactoryEvent(cache, P, env({ type: 'workpack.resumed', workpackId: 'WP-1', reasons: [], actor: 'ada', version: 5 }));
    expect(cache.get<any>(keys.workpack(P, 'WP-1'))).toMatchObject({ paused: false, pausedReasons: [], version: 5 });
    expect(cache.wasInvalidated(keys.pipelineStatus(P))).toBe(true);
  });

  it('marks an SLA breach with the event time as the escalation time', () => {
    const cache = seeded();
    applyFactoryEvent(cache, P, env({ type: 'workpack.sla_breached', workpackId: 'WP-1', priority: 'P0 Blocker', slaDueAt: '2026-11-01T09:00:00Z', pausedAtBreach: [] }));
    expect(cache.get<any>(keys.workpack(P, 'WP-1'))).toMatchObject({ slaBreached: true, escalatedAt: '2026-11-01T10:00:00.000Z' });
  });

  it('updates human locks and refetches that workpack’s diff and files', () => {
    const cache = seeded();
    applyFactoryEvent(cache, P, env({ type: 'workpack.locks_changed', workpackId: 'WP-1', humanLockedFiles: ['src/a.ts'] }));
    expect(cache.get<any>(keys.workpack(P, 'WP-1')).humanLockedFiles).toEqual(['src/a.ts']);
    expect(cache.wasInvalidated(keys.workpackDiffs(P, 'WP-1'))).toBe(true);
    expect(cache.wasInvalidated(keys.workpackFiles(P, 'WP-1'))).toBe(true);
  });

  it('refetches steering for the run on any steering event', () => {
    for (const event of [
      { type: 'steering.suggested', runId: 'R1', suggestionId: 's', author: 'a' },
      { type: 'steering.queued', runId: 'R1', hintId: 'h', kind: 'hint', queuedAt: 'x' },
      { type: 'steering.delivered', runId: 'R1', hintId: 'h', deliveredAt: 'x' },
      { type: 'steering.acknowledged', runId: 'R1', hintId: 'h' },
      { type: 'steering.expired', runId: 'R1', suggestionId: 's' },
    ] as FactoryEvent[]) {
      const cache = new MemoryCache();
      applyFactoryEvent(cache, P, env(event));
      expect(cache.wasInvalidated(keys.steering(P, 'R1')), event.type).toBe(true);
    }
  });

  it('refetches gates and release for gate and deploy events, and contracts on unlock', () => {
    const cache = new MemoryCache();
    applyFactoryEvent(cache, P, env({ type: 'gate.updated', workpackId: 'WP-1', gate: 'static.types_lint', severity: 'block', status: 'passed', metrics: [] }));
    applyFactoryEvent(cache, P, env({ type: 'deploy.status', workpackId: 'WP-1', environment: 'staging', status: 'succeeded' }));
    applyFactoryEvent(cache, P, env({ type: 'contract.unlocked', workpackId: 'WP-1', contractId: 'c1', by: 'ada', reason: 'needs a field' }));
    expect(cache.wasInvalidated(keys.gates(P, 'WP-1'))).toBe(true);
    expect(cache.wasInvalidated(keys.release(P, 'WP-1'))).toBe(true);
    expect(cache.wasInvalidated(keys.contracts(P, 'WP-1'))).toBe(true);
  });

  it('patches the budget in place and refetches it for the derived runway', () => {
    const cache = new MemoryCache();
    cache.set(keys.budget(P), { spendUsdMicros: 1, softLimitHit: false, hardCapHit: false, runway: { days: 3, hours: 1 } });
    applyFactoryEvent(cache, P, env({ type: 'budget.updated', spendUsdMicros: 500, softLimitHit: true, hardCapHit: false, runwayHours: 10 }));
    expect(cache.get<any>(keys.budget(P))).toMatchObject({ spendUsdMicros: 500, softLimitHit: true, hardCapHit: false });
    expect(cache.wasInvalidated(keys.budget(P))).toBe(true);
  });

  it('refetches everything on a resync', () => {
    const cache = new MemoryCache();
    applyFactoryEvent(cache, P, env({ type: 'stream.resync' }));
    expect(cache.wasInvalidated(keys.all(P))).toBe(true);
  });

  it('ignores events for another project and events it does not know', () => {
    const cache = seeded();
    applyFactoryEvent(cache, P, env({ type: 'workpack.status_changed', workpackId: 'WP-1', from: 'queued', to: 'planning', version: 9 }, { projectId: 'other' }));
    expect(cache.get<any>(keys.workpack(P, 'WP-1')).version).toBe(3);
    expect(() => applyFactoryEvent(cache, P, env({ type: 'something.new' } as unknown as FactoryEvent))).not.toThrow();
  });

  it('appends live run logs to an open log cache (capped) and does nothing when none is open', () => {
    const cache = new MemoryCache();
    applyFactoryEvent(cache, P, env({ type: 'run.log', runId: 'R1', level: 'info', tag: '[X]', message: 'ignored' }));
    expect(cache.get(keys.runLogs(P, 'R1', 'all'))).toBeUndefined();

    cache.set(keys.runLogs(P, 'R1', 'all'), { items: Array.from({ length: 1000 }, (_, i) => ({ id: `l${i}` })), nextCursor: null });
    applyFactoryEvent(cache, P, env({ type: 'run.log', runId: 'R1', level: 'warn', tag: '[X]', message: 'hello' }, { id: '77' }));
    const logs = cache.get<any>(keys.runLogs(P, 'R1', 'all'));
    expect(logs.items).toHaveLength(1000);
    expect(logs.items.at(-1)).toMatchObject({ runId: 'R1', level: 'warn', message: 'hello' });
    expect(logs.items[0].id).toBe('l1');
  });

  it('upserts reasoning steps by step number', () => {
    const cache = new MemoryCache();
    cache.set(keys.runReasoning(P, 'R1'), [{ step: 1, title: 'Plan', status: 'active', ts: 'x' }]);
    applyFactoryEvent(cache, P, env({ type: 'run.reasoning_step', runId: 'R1', step: 1, title: 'Plan', status: 'done' }));
    applyFactoryEvent(cache, P, env({ type: 'run.reasoning_step', runId: 'R1', step: 2, title: 'Synthesize', status: 'active' }));
    const steps = cache.get<any[]>(keys.runReasoning(P, 'R1'));
    expect(steps.map((s) => `${s.step}:${s.status}`)).toEqual(['1:done', '2:active']);
  });

  it('keeps epics, agents and intake fresh', () => {
    const cache = new MemoryCache();
    cache.set(keys.epic(P, 'E-1'), { id: 'E-1', status: 'stage-1', paused: false });
    cache.set(keys.agentList(P), [{ id: 'codecraft', status: 'idle' }]);
    applyFactoryEvent(cache, P, env({ type: 'epic.updated', epicId: 'E-1', status: 'executing', stage: 3, paused: true }));
    applyFactoryEvent(cache, P, env({ type: 'agent.status', agentId: 'codecraft', status: 'working' }));
    applyFactoryEvent(cache, P, env({ type: 'agent.eval.progress', agentId: 'codecraft', version: 4, ticketsDone: 10, ticketsTotal: 200 }));
    applyFactoryEvent(cache, P, env({ type: 'intake.processed', intakeId: 'i1', outcome: 'accepted', issueRef: 'u', epicId: 'E-2' }));
    expect(cache.get<any>(keys.epic(P, 'E-1'))).toMatchObject({ status: 'executing', paused: true });
    expect(cache.get<any[]>(keys.agentList(P))[0]).toMatchObject({ status: 'working' });
    expect(cache.wasInvalidated(keys.versions(P, 'codecraft'))).toBe(true);
    expect(cache.wasInvalidated(keys.intake(P))).toBe(true);
    expect(cache.wasInvalidated(keys.epics(P))).toBe(true);
  });
});
