import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Attribution, Budget, Paged, PipelineStatus, Problem, UpdateBudgetResponse, Workpack } from '../../contracts';
import { rolloverIfNeeded } from '../backend/budget';
import { flushAudit, recordSpendEntry } from '../backend/runtime';
import { addEpic, addWorkpack, createWorld, setSpend, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

const USD = 1_000_000;
const budget = async () => (await w.call<Budget>('GET', '/budget')).body;
const setCap = (monthlyCapUsd: number, softLimitPercent = 80) =>
  w.call<UpdateBudgetResponse & Problem>('PUT', '/budget', { role: 'admin', body: { monthlyCapUsd, softLimitPercent } });
const workpacks = async () => (await w.call<Paged<Workpack>>('GET', '/workpacks?limit=500')).body.items;

describe('reading the budget (spec §11.2)', () => {
  it('starts within budget with no burn, so the runway is unbounded', async () => {
    const b = await budget();
    expect(b).toMatchObject({ spendUsdMicros: 0, softLimitHit: false, hardCapHit: false, hardCapPercent: 100, percentUsed: 0, pausedRuns: 0, runway: null });
    expect(b.monthlyCapUsdMicros).toBe(5_000 * USD);
    expect(b.periodStart).toBe('2026-11-01T00:00:00.000Z');
    expect(b.periodEnd).toBe('2026-12-01T00:00:00.000Z');
  });

  it('raises the soft limit flag at 80% and the hard cap flag at 100%', async () => {
    setSpend(w.ps, 3_999 * USD);
    expect(await budget()).toMatchObject({ softLimitHit: false, hardCapHit: false });
    setSpend(w.ps, 4_000 * USD);
    expect(await budget()).toMatchObject({ softLimitHit: true, hardCapHit: false, percentUsed: 80 });
    setSpend(w.ps, 5_000 * USD);
    expect(await budget()).toMatchObject({ softLimitHit: true, hardCapHit: true, percentUsed: 100 });
  });

  it('derives runway and projection from the trailing six-hour burn', async () => {
    setSpend(w.ps, 1_000 * USD);
    recordSpendEntry(w.ps, { usdMicros: 24 * USD, source: 'workpack', epicId: null, workpackId: null, agentId: null, at: new Date(Date.parse('2026-11-15T12:00:00Z') - 3_600_000).toISOString() });
    const b = await budget();
    expect(b.burnUsdMicrosPerHour).toBe(4 * USD);
    // ($5,000 − $1,000) / $4 per hour = 1,000 hours = 41 days 16 hours
    expect(b.runway).toEqual({ days: 41, hours: 16 });
    expect(b.projectedSpendUsdMicros).toBeGreaterThan(b.spendUsdMicros);
  });
});

describe('changing the cap', () => {
  it('lets only an Admin change it, and validates the numbers', async () => {
    const denied = await w.call<Problem>('PUT', '/budget', { role: 'maintainer', body: { monthlyCapUsd: 100, softLimitPercent: 80 } });
    expect(denied.status).toBe(403);
    expect(denied.body.requiredRole).toBe('admin');

    for (const body of [{ monthlyCapUsd: 0, softLimitPercent: 80 }, { monthlyCapUsd: 100, softLimitPercent: 99 }, { monthlyCapUsd: 100, softLimitPercent: 49 }, { monthlyCapUsd: -5, softLimitPercent: 80 }]) {
      expect((await w.call<Problem>('PUT', '/budget', { role: 'admin', body })).status, JSON.stringify(body)).toBe(422);
    }
  });

  it('stores the cap and soft limit and audits who changed what', async () => {
    const res = await setCap(1_200, 70);
    expect(res.status).toBe(200);
    expect(res.body.budget).toMatchObject({ monthlyCapUsdMicros: 1_200 * USD, softLimitPercent: 70, hardCapHit: false });
    expect(res.body.resumedRuns).toBe(0);
    expect((await budget()).softLimitPercent).toBe(70);

    await flushAudit(w.ps);
    const entry = w.ps.audit.find((e) => e.action === 'budget.updated');
    expect(entry).toMatchObject({ actorName: 'Test admin', actorType: 'user', target: { previousCapUsd: 5000, monthlyCapUsd: 1200, softLimitPercent: 70, resumedRuns: 0 } });
  });
});

describe('the hard cap pauses work and never fails it (spec §5.1 rule 5, §11.2)', () => {
  const setup = () => {
    const epic = addEpic(w.ps);
    const p2 = addWorkpack(w.ps, { epicId: epic.id, status: 'queued', priority: 'P2 Normal' });
    const p0 = addWorkpack(w.ps, { epicId: epic.id, status: 'in-progress', priority: 'P0 Blocker' });
    const p1 = addWorkpack(w.ps, { epicId: epic.id, status: 'verification', priority: 'P1 High' });
    return { p2, p0, p1 };
  };

  it('pauses every open workpack with budget-hard-cap when the cap drops below spend, and changes no status', async () => {
    const { p0, p1, p2 } = setup();
    setSpend(w.ps, 50 * USD);
    const res = await setCap(40);

    expect(res.body.budget).toMatchObject({ hardCapHit: true, pausedRuns: 3 });
    const list = await workpacks();
    for (const wp of list) expect(wp.pausedReasons, wp.id).toContain('budget-hard-cap');
    expect(Object.fromEntries(list.map((x) => [x.id, x.status]))).toEqual({ [p0.id]: 'in-progress', [p1.id]: 'verification', [p2.id]: 'queued' });
    expect(list.find((x) => x.id === p2.id)!.queuedReason).toBe('budget');

    const status = (await w.call<PipelineStatus>('GET', '/pipeline/status')).body;
    expect(status).toMatchObject({ paused: true, hardCapHit: true });
    expect(status.pausedReasons).toContain('budget-hard-cap');
    expect(w.ps.runs.find((r) => r.workpackId === p0.id)!.status).toBe('paused');
  });

  it('resumes everything, P0 first then P1 then P2, when an Admin raises the cap above spend', async () => {
    const { p0, p1, p2 } = setup();
    setSpend(w.ps, 50 * USD);
    await setCap(40);

    const stillCapped = await setCap(45);
    expect(stillCapped.body.resumedRuns).toBe(0);
    expect(stillCapped.body.budget.hardCapHit).toBe(true);

    const raised = await setCap(500);
    expect(raised.body.resumedRuns).toBe(3);
    expect(raised.body.budget).toMatchObject({ hardCapHit: false, pausedRuns: 0 });
    for (const wp of await workpacks()) expect(wp.paused, wp.id).toBe(false);
    expect(w.ps.runs.find((r) => r.workpackId === p0.id)!.status).toBe('running');

    const resumed = w.ps.events.ring.filter((e) => e.event.type === 'workpack.resumed').map((e) => (e.event as { workpackId: string }).workpackId);
    expect(resumed).toEqual([p0.id, p1.id, p2.id]);
    const announcement = w.ps.events.ring.map((e) => e.event).find((e) => e.type === 'budget.resumed');
    expect(announcement).toMatchObject({ type: 'budget.resumed', resumedRuns: 3, reason: 'cap-raised', actor: 'Test admin' });
  });

  it('keeps a manual pause in force when the budget pause clears', async () => {
    const { p0 } = setup();
    await w.call('POST', `/workpacks/${p0.id}/pause`, { role: 'engineer', headers: { 'if-match': String(p0.version) } });
    setSpend(w.ps, 50 * USD);
    await setCap(40);
    expect((await workpacks()).find((x) => x.id === p0.id)!.pausedReasons).toEqual(['manual-workpack', 'budget-hard-cap']);

    await setCap(500);
    expect((await workpacks()).find((x) => x.id === p0.id)).toMatchObject({ paused: true, pausedReasons: ['manual-workpack'] });
  });

  it('resumes by itself when the UTC month rolls over, and spend starts again from zero', async () => {
    const { p0 } = setup();
    setSpend(w.ps, 50 * USD);
    await setCap(40);
    expect((await budget()).hardCapHit).toBe(true);

    w.store.clock.fixedMs = Date.parse('2026-12-01T00:00:05.000Z');
    expect(rolloverIfNeeded(w.ps)).toBe(true);

    const b = await budget();
    expect(b).toMatchObject({ spendUsdMicros: 0, hardCapHit: false, pausedRuns: 0, periodStart: '2026-12-01T00:00:00.000Z' });
    expect((await workpacks()).find((x) => x.id === p0.id)!.paused).toBe(false);
    const event = w.ps.events.ring.map((e) => e.event).find((e) => e.type === 'budget.resumed');
    expect(event).toMatchObject({ reason: 'period-rollover' });
    expect(rolloverIfNeeded(w.ps)).toBe(false);
  });

  it('refuses spend-causing actions with budget_blocked while capped', async () => {
    setSpend(w.ps, 5_000 * USD);
    const spec = '---\ntitle: "Anything at all"\nmode: bug\npriority: P2\nareas: [api]\nacceptance:\n  - "Done"\n---\n';
    const preview = await w.call<Problem>('POST', '/epics/preview', { role: 'engineer', body: { specMarkdown: spec } });
    expect(preview.status).toBe(409);
    expect(preview.body.type).toBe('budget_blocked');
  });
});

describe('spend attribution (spec §11.1: tracked, never enforced)', () => {
  const entry = (usdMicros: number, over: Partial<Parameters<typeof recordSpendEntry>[1]> = {}) =>
    recordSpendEntry(w.ps, { usdMicros, source: 'workpack', epicId: null, workpackId: null, agentId: null, ...over });

  it('groups by Epic, with the unattributed remainder last and totals that add up', async () => {
    const a = addEpic(w.ps, { title: 'Billing hardening' });
    const b = addEpic(w.ps, { title: 'Audit export' });
    entry(3 * USD, { epicId: a.id });
    entry(1 * USD, { epicId: b.id });
    entry(0.5 * USD, { source: 'preview' });
    const res = await w.call<Attribution>('GET', '/budget/attribution?by=epic');
    expect(res.body.by).toBe('epic');
    expect(res.body.items.map((i) => [i.key, i.usdMicros])).toEqual([[a.id, 3 * USD], [b.id, 1 * USD], ['none', 0.5 * USD]]);
    expect(res.body.items[0]!.label).toBe(`${a.id} · Billing hardening`);
    expect(res.body.totalUsdMicros).toBe(4.5 * USD);
  });

  it('groups by source and by agent, sorted by amount', async () => {
    entry(2 * USD, { source: 'workpack', agentId: 'codecraft' });
    entry(1 * USD, { source: 'eval', agentId: 'codecraft' });
    entry(4 * USD, { source: 'benchmark' });
    const bySource = await w.call<Attribution>('GET', '/budget/attribution?by=source');
    expect(bySource.body.items.map((i) => i.key)).toEqual(['benchmark', 'workpack', 'eval']);
    const byAgent = await w.call<Attribution>('GET', '/budget/attribution?by=agent');
    expect(byAgent.body.items.map((i) => [i.key, i.usdMicros])).toEqual([['none', 4 * USD], ['codecraft', 3 * USD]]);
  });

  it('counts only the current budget period and rejects an unknown grouping', async () => {
    entry(2 * USD, { source: 'eval', at: '2026-10-20T00:00:00.000Z' });
    entry(1 * USD, { source: 'eval' });
    expect((await w.call<Attribution>('GET', '/budget/attribution?by=source')).body.totalUsdMicros).toBe(1 * USD);
    expect((await w.call<Problem>('GET', '/budget/attribution?by=nonsense')).status).toBe(422);
  });
});
