import { describe, expect, it } from 'vitest';
import { MAX_AGE_MS, enqueue, isQueueable, replayQueue, type QueuedAction } from './offlineQueue';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const action = (n: number, over: Partial<QueuedAction> = {}): QueuedAction => ({
  id: `q${n}`,
  kind: 'workpack.cancel',
  label: `Cancel WP-${n}`,
  request: { method: 'PATCH', path: `/workpacks/WP-${n}/status`, body: { status: 'cancelled' }, ifMatch: '3' },
  idempotencyKey: `key-${n}`,
  queuedAt: new Date(NOW.getTime() - 60_000).toISOString(),
  ...over,
});

/** A scripted server: status codes (or a network error) returned in call order. */
function server(script: (number | 'network-error')[]) {
  const calls: string[] = [];
  const send = async (a: QueuedAction) => {
    calls.push(a.id);
    return script.shift() ?? 200;
  };
  return { send, calls };
}

describe('what can be queued while offline (spec §16.2)', () => {
  it('queues steering and Kanban moves', () => {
    for (const kind of ['steering.suggest', 'steering.inject', 'steering.approve', 'steering.reject', 'workpack.cancel', 'workpack.requestChanges']) {
      expect(isQueueable(kind)).toBe(true);
    }
  });

  it('blocks everything that spends, merges, or changes configuration', () => {
    for (const kind of ['budget.update', 'workpack.promote', 'workpack.rollback', 'epic.dispatch', 'editor.write', 'workpack.pause', 'agent.tune', 'pipeline.pause', 'benchmark.run']) {
      expect(isQueueable(kind)).toBe(false);
    }
  });

  it('keeps first-in-first-out order and ignores a repeated idempotency key', () => {
    let q: QueuedAction[] = [];
    q = enqueue(q, action(1));
    q = enqueue(q, action(2));
    q = enqueue(q, action(1));
    expect(q.map((a) => a.id)).toEqual(['q1', 'q2']);
  });
});

describe('replaying after reconnect', () => {
  it('sends in order and clears everything that succeeded', async () => {
    const s = server([200, 204, 202]);
    const r = await replayQueue([action(1), action(2), action(3)], s.send, NOW);
    expect(s.calls).toEqual(['q1', 'q2', 'q3']);
    expect(r.remaining).toEqual([]);
    expect(r.results.map((x) => x.outcome)).toEqual(['sent', 'sent', 'sent']);
  });

  it('drops an action whose version is stale (409) but keeps replaying the rest', async () => {
    const s = server([409, 200]);
    const r = await replayQueue([action(1), action(2)], s.send, NOW);
    expect(r.results.map((x) => x.outcome)).toEqual(['dropped-conflict', 'sent']);
    expect(r.remaining).toEqual([]);
  });

  it.each([
    [403, 'dropped-forbidden'],
    [404, 'dropped-missing'],
    [422, 'dropped-invalid'],
    [400, 'dropped-invalid'],
  ] as const)('drops an action answered with %i as %s', async (status, outcome) => {
    const r = await replayQueue([action(1)], server([status]).send, NOW);
    expect(r.results[0]).toMatchObject({ id: 'q1', outcome });
    expect(r.remaining).toEqual([]);
  });

  it('stops at a network error and keeps the failing action and everything after it, in order', async () => {
    const s = server([200, 'network-error']);
    const r = await replayQueue([action(1), action(2), action(3)], s.send, NOW);
    expect(s.calls).toEqual(['q1', 'q2']);
    expect(r.remaining.map((a) => a.id)).toEqual(['q2', 'q3']);
    expect(r.results.map((x) => `${x.id}:${x.outcome}`)).toEqual(['q1:sent', 'q2:deferred', 'q3:deferred']);
  });

  it('treats a server error like a network error: retry later rather than lose the action', async () => {
    const r = await replayQueue([action(1), action(2)], server([503]).send, NOW);
    expect(r.remaining.map((a) => a.id)).toEqual(['q1', 'q2']);
  });

  it('discards actions older than 15 minutes without sending them', async () => {
    const stale = action(1, { queuedAt: new Date(NOW.getTime() - MAX_AGE_MS - 1).toISOString() });
    const fresh = action(2, { queuedAt: new Date(NOW.getTime() - MAX_AGE_MS).toISOString() });
    const s = server([200]);
    const r = await replayQueue([stale, fresh], s.send, NOW);
    expect(s.calls).toEqual(['q2']);
    expect(r.results.map((x) => `${x.id}:${x.outcome}`)).toEqual(['q1:expired', 'q2:sent']);
    expect(MAX_AGE_MS).toBe(15 * 60 * 1000);
  });
});
