import { afterEach, describe, expect, it } from 'vitest';
import type { Envelope, IntakeEvent, Paged, Workpack } from '../contracts';
import { verifyChain } from '../domain/auditChain';
import { flushAudit } from './backend/runtime';
import type { StreamClient } from './backend/store';
import { createControl } from './control';
import { createSeededWorld, type World } from './testing';

let w: World | undefined;
afterEach(() => {
  w?.close();
  w = undefined;
});

async function dev(scenario?: Parameters<typeof createSeededWorld>[0]) {
  w = await createSeededWorld(scenario);
  return { world: w, control: createControl(w.store) };
}

const workpacks = async (world: World, query = '') => (await world.call<Paged<Workpack>>('GET', `/workpacks?limit=500${query}`)).body.items;

describe('dev panel: going offline and coming back', () => {
  it('makes every request fail like a dead network, then restores them', async () => {
    const { world, control } = await dev();
    expect((await world.call('GET', '/pipeline/status')).status).toBe(200);

    control.setOffline(true);
    await expect(world.call('GET', '/pipeline/status')).rejects.toThrow();
    expect(control.state().offline).toBe(true);

    control.setOffline(false);
    expect((await world.call('GET', '/pipeline/status')).status).toBe(200);
  });

  it('drops open streams when the network goes away, so clients have to reconnect', async () => {
    const { world, control } = await dev();
    const closed: string[] = [];
    const client = (id: string): StreamClient => ({ projectId: world.ps.project.id, runId: null, send: () => undefined, close: () => closed.push(id) });
    world.store.streams.add(client('a'));
    world.store.streams.add(client('b'));
    control.setOffline(true);
    expect(closed).toEqual(['a', 'b']);
  });

  it('drops streams on demand without going offline', async () => {
    const { world, control } = await dev();
    const closed: number[] = [];
    world.store.streams.add({ projectId: world.ps.project.id, runId: null, send: () => undefined, close: () => closed.push(1) });
    control.dropStreams();
    expect(closed).toEqual([1]);
    expect(control.state().offline).toBe(false);
    expect((await world.call('GET', '/pipeline/status')).status).toBe(200);
  });
});

describe('dev panel: the virtual clock', () => {
  it('breaches a P0 SLA when the clock moves five hours, and says so on the stream', async () => {
    const { world, control } = await dev();
    const p0 = (await workpacks(world)).filter((x) => x.priority === 'P0 Blocker' && x.status !== 'done');
    expect(p0.length).toBeGreaterThan(0);
    expect(p0.every((x) => !x.slaBreached)).toBe(true);

    control.advanceClock(5 * 3_600_000);
    const after = (await workpacks(world)).filter((x) => x.priority === 'P0 Blocker' && x.status !== 'done');
    expect(after.every((x) => x.slaBreached && x.escalatedAt !== null && x.priority === 'P0 Blocker')).toBe(true);
    expect(control.state().clockOffsetMs).toBe(0);
    expect(world.store.clock.fixedMs).toBeGreaterThan(Date.parse('2026-11-15T12:00:00Z'));
  });

  it('moves ended work out of the Recently ended tray and into the archive', async () => {
    const { world, control } = await dev();
    const tray = (await workpacks(world)).filter((x) => x.status === 'failed' || x.status === 'cancelled');
    expect(tray).toHaveLength(2);
    control.advanceClock(10 * 60_000);
    expect((await workpacks(world)).filter((x) => x.status === 'failed' || x.status === 'cancelled')).toHaveLength(0);
    expect((await workpacks(world, '&archived=1')).length).toBe(4);
  });

  it('escalates one open P0 or P1 on demand, immediately', async () => {
    const { world, control } = await dev();
    const id = control.triggerSla();
    expect(id).not.toBeNull();
    const wp = (await world.call<Workpack>('GET', `/workpacks/${id}`)).body;
    expect(wp).toMatchObject({ slaBreached: true });
    expect(wp.priority).toMatch(/^P[01]/);
    expect((await workpacks(world)).filter((x) => x.slaBreached)).toHaveLength(1);
  });

  it('scales simulated delays with the speed setting', async () => {
    const { world, control } = await dev();
    expect(control.state().speed).toBe(1);
    control.setSpeed(16);
    expect(control.state().speed).toBe(16);
    expect(world.store.sim.speed).toBe(16);
  });
});

describe('dev panel: simulated GitHub issues', () => {
  const outcomeOf = async (world: World, issue: number) => (await world.call<Paged<IntakeEvent>>('GET', '/intake?limit=100')).body.items.find((e) => e.issueNumber === issue)!;

  it.each([
    ['accepted', 'accepted', null],
    ['rejected', 'rejected', 'validation_failed'],
    ['unsupported-language', 'rejected', 'unsupported_language'],
  ] as const)('files a %s issue that intake turns into a %s outcome', async (kind, outcome, code) => {
    const { world, control } = await dev();
    const before = world.ps.epics.length;
    const issue = control.simulateIssue(kind)!;
    expect(issue).toBeGreaterThan(55);
    control.advanceClock(2_000);
    const event = await outcomeOf(world, issue);
    expect(event).toMatchObject({ outcome, code, origin: 'github-ui' });
    expect(world.ps.epics.length).toBe(outcome === 'accepted' ? before + 1 : before);
  });

  it('re-delivers the newest Epic’s issue as a duplicate and creates nothing new', async () => {
    const { world, control } = await dev();
    const before = world.ps.epics.length;
    const issue = control.simulateIssue('duplicate')!;
    const event = await outcomeOf(world, issue);
    expect(event).toMatchObject({ outcome: 'duplicate', canonicalEpicId: world.ps.epics.at(-1)!.id });
    expect(world.ps.epics.length).toBe(before);
  });
});

describe('dev panel: breaking the audit chain on purpose', () => {
  it('alters one entry so verification names it', async () => {
    const { world, control } = await dev();
    await flushAudit(world.ps);
    expect(await verifyChain(world.ps.audit)).toMatchObject({ ok: true });
    const id = control.corruptAudit();
    expect(id).not.toBeNull();
    const result = await verifyChain(world.ps.audit);
    expect(result.ok).toBe(false);
    expect([id, world.ps.audit[world.ps.audit.findIndex((e) => e.id === id) + 1]?.id]).toContain(result.brokenAtId);
  });
});

describe('dev panel: scenarios and reset', () => {
  it('rebuilds the world for a scenario and tells every open stream to refetch', async () => {
    const { world, control } = await dev();
    const sent: Envelope[] = [];
    const ended: string[] = [];
    world.store.streams.add({ projectId: world.ps.project.id, runId: null, send: (e) => sent.push(e), close: () => ended.push('project') });
    world.store.streams.add({ projectId: world.ps.project.id, runId: 'run-132', send: () => undefined, close: () => ended.push('run') });

    await control.setScenario('hard-cap');
    expect(world.store.sim.scenario).toBe('hard-cap');
    expect(control.state().scenario).toBe('hard-cap');
    expect(sent.map((e) => e.event.type)).toEqual(['stream.resync']);
    expect(ended).toEqual(['run']);
    const budget = (await world.call<{ hardCapHit: boolean }>('GET', '/budget', { project: 'software-factory-studio' })).body;
    expect(budget.hardCapHit).toBe(true);
  });

  it('reset starts the same scenario again from a clean slate, and announces changes to the panel', async () => {
    const { world, control } = await dev('soft-limit');
    const events: number[] = [];
    const stop = control.subscribe(() => events.push(1));
    const epics = (await world.call<Paged<{ id: string }>>('GET', '/epics', { project: 'software-factory-studio' })).body.items.length;
    control.simulateIssue('accepted');
    control.advanceClock(2_000);
    await control.reset();
    expect(control.state().scenario).toBe('soft-limit');
    expect((await world.call<Paged<{ id: string }>>('GET', '/epics', { project: 'software-factory-studio' })).body.items.length).toBe(epics);
    expect(events.length).toBeGreaterThan(0);
    stop();
  });
});
