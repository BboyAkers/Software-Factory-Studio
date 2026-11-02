import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AgentConfigVersionSchema,
  AgentSchema,
  FleetStatsSchema,
  ModelCatalogEntrySchema,
  type Agent,
  type AgentConfig,
  type AgentConfigVersion,
  type AuditEntry,
  type Attribution,
  type Budget,
  type Epic,
  type FleetStats,
  type IntakeEvent,
  type ModelCatalogEntry,
  type Paged,
  type Problem,
  type ProjectToken,
  type Role,
  type VaultKey,
} from '../../contracts';
import { manualCycleActive } from '../backend/agents';
import { tickPlatform } from '../backend/platform';
import { fileIssue, scheduleIntake } from '../backend/epics';
import { advanceClock, chargeSpend, recordSpendEntry, setAgentStatus } from '../backend/runtime';
import { seedPlatform } from '../seeds/platform';
import { TEST_NOW_MS, advance, createWorld, eventTypes, setSpend, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

/** The dogfood project: a version history, live stats, and a GateKeeper eval already running. */
const populate = () => {
  w.close();
  w = createWorld({ platform: false });
  seedPlatform(w.ps, { populated: true });
};

const AGENT_IDS = ['architect-prime', 'codecraft', 'gatekeeper', 'secops-vanguard', 'docuforge', 'sentrywatch'];
const ROLE_ORDER: Role[] = ['viewer', 'engineer', 'maintainer', 'admin'];

const getAgent = async (id: string) => (await w.call<Agent>('GET', `/agents/${id}`, { role: 'viewer' })).body;
const getVersions = async (id: string) => (await w.call<Paged<AgentConfigVersion>>('GET', `/agents/${id}/versions`, { role: 'viewer' })).body.items;
const getVersion = async (id: string, v: number) => (await w.call<AgentConfigVersion>('GET', `/agents/${id}/versions/${v}`, { role: 'viewer' })).body;
const auditOf = async (action: string) => (await w.call<Paged<AuditEntry>>('GET', `/audit?action=${action}`, { role: 'viewer' })).body.items;
const budget = async () => (await w.call<Budget>('GET', '/budget', { role: 'viewer' })).body;

type Saved = AgentConfigVersion & Omit<Problem, 'status'>;
const save = (id: string, config: AgentConfig, role: Role = 'maintainer', note?: string) =>
  w.call<Saved>('POST', `/agents/${id}/versions`, { role, body: { config, note } });
const promote = (id: string, version: number, role: Role = 'maintainer') =>
  w.call<Agent & Omit<Problem, 'status'>>('PUT', `/agents/${id}/active-version`, { role, body: { version } });
const run = (id: string, role: Role = 'maintainer') => w.call<{ agentId: string; processed: number; filed: number } & Omit<Problem, 'status'>>('POST', `/agents/${id}/run`, { role });

const withModel = (c: AgentConfig, patch: Partial<AgentConfig['model']>): AgentConfig => ({ ...c, model: { ...c.model, ...patch } });
const withLimits = (c: AgentConfig, patch: Partial<AgentConfig['limits']>): AgentConfig => ({ ...c, limits: { ...c.limits, ...patch } });
const configOf = async (id: string) => (await getAgent(id)).config;

/** A change that never regresses: one more turn allowed. */
const harmless = async (id = 'codecraft') => withLimits(await configOf(id), { maxTurns: (await configOf(id)).limits.maxTurns + 4 });

describe('the fleet', () => {
  it('lists the six specialists in pipeline order, each parsing against the contract', async () => {
    const res = await w.call<Agent[]>('GET', '/agents', { role: 'viewer' });
    expect(res.status).toBe(200);
    const agents = res.body.map((a) => AgentSchema.parse(a));
    expect(agents.map((a) => a.id)).toEqual(AGENT_IDS);
    expect(agents.map((a) => a.name)).toEqual(['Architect-Prime', 'CodeCraft', 'GateKeeper', 'SecOps-Vanguard', 'DocuForge', 'SentryWatch']);
    expect(agents.map((a) => a.initials)).toEqual(['AP', 'CC', 'GK', 'SV', 'DF', 'SW']);
    expect(agents.map((a) => a.color)).toEqual(['purple', 'blue', 'green', 'red', 'amber', 'sky']);
    expect(agents.map((a) => a.stage)).toEqual([1, 3, 4, 4, null, null]);
    expect(agents[0]).toMatchObject({ role: 'Lead architect: spec, contracts, decomposition', stageLabel: 'Stage 1–2 · Spec & decomposition' });
    expect(agents[1]!.role).toBe('Full-stack code synthesis');
    expect(agents.every((a) => a.stageLabel.length > 0)).toBe(true);
  });

  it('lets only Architect-Prime and SentryWatch run an intake cycle by hand', async () => {
    const agents = (await w.call<Agent[]>('GET', '/agents')).body;
    expect(agents.filter((a) => a.canRunNow).map((a) => a.id)).toEqual(['architect-prime', 'sentrywatch']);
  });

  it('gives each specialist three or four responsibilities', async () => {
    const agents = (await w.call<Agent[]>('GET', '/agents')).body;
    for (const a of agents) {
      expect(a.responsibilities.length, a.id).toBeGreaterThanOrEqual(3);
      expect(a.responsibilities.length, a.id).toBeLessThanOrEqual(4);
    }
  });

  it('ships the fixed v1 model map as each specialist’s default', async () => {
    const agents = (await w.call<Agent[]>('GET', '/agents')).body;
    const map = Object.fromEntries(agents.map((a) => [a.id, [a.config.model.primary, a.config.model.fallbacks]]));
    expect(map).toEqual({
      'architect-prime': ['anthropic/claude-opus', ['anthropic/claude-sonnet', 'openai/gpt-4o']],
      codecraft: ['anthropic/claude-sonnet', ['deepseek/deepseek-v3', 'openai/gpt-4o']],
      gatekeeper: ['anthropic/claude-sonnet', ['anthropic/claude-haiku', 'deepseek/deepseek-v3']],
      'secops-vanguard': ['anthropic/claude-sonnet', ['openai/gpt-4o', 'deepseek/deepseek-v3']],
      docuforge: ['anthropic/claude-haiku', ['anthropic/claude-sonnet', 'openai/gpt-4o']],
      sentrywatch: ['anthropic/claude-sonnet', ['anthropic/claude-haiku', 'openai/gpt-4o']],
    });
  });

  it('limits each specialist to the tools of its contract (spec §7.3)', async () => {
    const tools = Object.fromEntries((await w.call<Agent[]>('GET', '/agents')).body.map((a) => [a.id, a.config.tools]));
    expect(tools['architect-prime']).toEqual(expect.arrayContaining(['repo.read', 'contracts.write', 'dag.write']));
    expect(tools['architect-prime']).not.toContain('git.commit');
    expect(tools.codecraft).toEqual(expect.arrayContaining(['repo.read', 'fs.write', 'git.commit', 'sandbox.exec']));
    expect(tools.gatekeeper).toEqual(expect.arrayContaining(['sandbox.exec', 'tests.write', 'browser.playwright']));
    expect(tools['secops-vanguard']).toEqual(expect.arrayContaining(['sast.semgrep', 'sbom.scan', 'secrets.scan']));
    expect(tools['secops-vanguard']).not.toContain('fs.write');
    expect(tools.docuforge).toEqual(expect.arrayContaining(['fs.write', 'openapi.diff']));
    expect(tools.sentrywatch).toEqual(expect.arrayContaining(['telemetry.query', 'github.issue.create']));
    expect(tools.sentrywatch).not.toContain('fs.write');
  });

  it('writes each system prompt in the specialist’s voice: 8 to 14 lines on contracts, locks, steering and secrets', async () => {
    const agents = (await w.call<Agent[]>('GET', '/agents')).body;
    for (const a of agents) {
      const lines = a.config.systemPrompt.split('\n');
      expect(lines.length, a.id).toBeGreaterThanOrEqual(8);
      expect(lines.length, a.id).toBeLessThanOrEqual(14);
      expect(a.config.systemPrompt, a.id).toContain(a.name);
      expect(a.config.systemPrompt, a.id).toMatch(/contract/i);
      expect(a.config.systemPrompt, a.id).toMatch(/steering/i);
      expect(a.config.systemPrompt, a.id).toMatch(/secret/i);
    }
  });

  it('offers a catalog of shared skills, each a prompt plus a subset of the agent’s own tools', async () => {
    const agents = (await w.call<Agent[]>('GET', '/agents')).body;
    const names = new Set(agents.flatMap((a) => a.availableSkills.map((s) => s.name)));
    expect(names.size).toBeGreaterThanOrEqual(5);
    for (const name of ['playwright-e2e-matrix', 'migration-safety', 'a11y-audit', 'idempotency-patterns', 'changelog-style', 'fingerprint-dedupe']) {
      expect(names.has(name), name).toBe(true);
    }
    for (const a of agents) {
      expect(a.availableSkills.length, a.id).toBeGreaterThan(0);
      for (const skill of a.availableSkills) {
        expect(skill.promptMarkdown.length, skill.name).toBeGreaterThan(20);
        expect(skill.description.length, skill.name).toBeGreaterThan(0);
        expect(skill.tools.every((t) => a.config.tools.includes(t)), `${a.id}/${skill.name}`).toBe(true);
      }
      expect(a.config.skills.every((s) => a.availableSkills.some((k) => k.name === s)), a.id).toBe(true);
    }
    expect(agents.every((a) => a.config.skills.length >= 2)).toBe(true);
  });

  it('starts a bare project with every specialist idle on version 1 and no activity', async () => {
    const agents = (await w.call<Agent[]>('GET', '/agents')).body;
    for (const a of agents) {
      expect(a).toMatchObject({ status: 'idle', activeVersion: 1, evaluatingVersion: null, tokens24h: 0, cost24hUsdMicros: 0, cacheHitRatio: 0, failovers24h: 0 });
    }
  });

  it('shows a populated project with millions of tokens a day, healthy cache ratios and a few failovers', async () => {
    populate();
    const agents = (await w.call<Agent[]>('GET', '/agents')).body.map((a) => AgentSchema.parse(a));
    for (const a of agents) {
      expect(a.tokens24h, a.id).toBeGreaterThan(1_000_000);
      expect(a.cost24hUsdMicros, a.id).toBeGreaterThan(1_000_000);
      expect(a.cacheHitRatio, a.id).toBeGreaterThanOrEqual(0.82);
      expect(a.cacheHitRatio, a.id).toBeLessThanOrEqual(0.91);
      expect(a.failovers24h, a.id).toBeGreaterThanOrEqual(0);
      expect(a.failovers24h, a.id).toBeLessThanOrEqual(6);
    }
  });

  it('counts only the last 24 hours of spend, however much older history was recorded on top of the seed', async () => {
    populate();
    const before = await getAgent('codecraft');
    recordSpendEntry(w.ps, { usdMicros: 90_000_000, source: 'workpack', epicId: null, workpackId: null, agentId: 'codecraft', at: new Date(TEST_NOW_MS - 20 * 86_400_000).toISOString() });
    recordSpendEntry(w.ps, { usdMicros: 5_000_000, source: 'workpack', epicId: null, workpackId: null, agentId: 'codecraft', at: new Date(TEST_NOW_MS - 3 * 3_600_000).toISOString() });
    const after = await getAgent('codecraft');
    expect(after.cost24hUsdMicros - before.cost24hUsdMicros).toBe(5_000_000);
    expect(after.tokens24h).toBeGreaterThan(before.tokens24h);
    expect(after.tokens24h - before.tokens24h).toBeLessThan(5_000_000);
  });

  it('returns one specialist, and 404 for one that does not exist', async () => {
    expect(AgentSchema.parse(await getAgent('gatekeeper'))).toMatchObject({ id: 'gatekeeper', name: 'GateKeeper' });
    const missing = await w.call<Problem>('GET', '/agents/nobody');
    expect(missing.status).toBe(404);
    expect(missing.body.type).toBe('not_found');
  });

  it('is readable by a viewer', async () => {
    for (const path of ['/agents', '/agents/codecraft', '/agents/codecraft/versions', '/agents/codecraft/versions/1', '/fleet/stats', '/models']) {
      expect((await w.call('GET', path, { role: 'viewer' })).status, path).toBe(200);
    }
  });
});

describe('the model catalog', () => {
  it('has exactly the five v1 models with their per-million-token prices in micros', async () => {
    const res = await w.call<ModelCatalogEntry[]>('GET', '/models', { role: 'viewer' });
    expect(res.status).toBe(200);
    const models = res.body.map((m) => ModelCatalogEntrySchema.parse(m));
    expect(models.map((m) => [m.id, m.provider, m.inputPerMTokUsdMicros, m.cachedInputPerMTokUsdMicros, m.outputPerMTokUsdMicros, m.contextWindow])).toEqual([
      ['anthropic/claude-opus', 'anthropic', 15_000_000, 1_500_000, 75_000_000, 200_000],
      ['anthropic/claude-sonnet', 'anthropic', 3_000_000, 300_000, 15_000_000, 200_000],
      ['anthropic/claude-haiku', 'anthropic', 800_000, 80_000, 4_000_000, 200_000],
      ['deepseek/deepseek-v3', 'deepseek', 270_000, 70_000, 1_100_000, 128_000],
      ['openai/gpt-4o', 'openai', 2_500_000, 1_250_000, 10_000_000, 128_000],
    ]);
  });

  it('pins each model to a dated provider release and names it for people', async () => {
    const models = (await w.call<ModelCatalogEntry[]>('GET', '/models')).body;
    for (const m of models) {
      expect(m.pinnedModel, m.id).toMatch(/\d{4}/);
      expect(m.displayName.length, m.id).toBeGreaterThan(0);
    }
    expect(models[0]!.pinnedModel).toBe('claude-opus-4-1-20250805');
  });
});

describe('fleet stats', () => {
  const stats = async () => (await w.call<FleetStats>('GET', '/fleet/stats', { role: 'viewer' })).body;

  it('reports three providers online with latency and error rate, and the 85% cache target', async () => {
    const s = FleetStatsSchema.parse(await stats());
    expect(s.providers.map((p) => [p.id, p.status])).toEqual([
      ['anthropic', 'online'],
      ['openai', 'online'],
      ['deepseek', 'online'],
    ]);
    for (const p of s.providers) {
      expect(p.p50LatencyMs, p.id).toBeGreaterThan(100);
      expect(p.p95LatencyMs, p.id).toBeGreaterThan(p.p50LatencyMs);
      expect(p.errorRate, p.id).toBeGreaterThanOrEqual(0);
      expect(p.errorRate, p.id).toBeLessThan(0.05);
    }
    expect(s.cacheHitTarget).toBe(0.85);
  });

  it('holds latency steady within a ten-minute bucket and moves it only a little between buckets', async () => {
    const first = (await stats()).providers;
    advance(w, 120_000, 60_000);
    expect((await stats()).providers).toEqual(first);

    advance(w, 600_000, 60_000);
    const later = (await stats()).providers;
    later.forEach((p, i) => {
      const before = first[i]!;
      expect(Math.abs(p.p50LatencyMs - before.p50LatencyMs) / before.p50LatencyMs, p.id).toBeLessThan(0.2);
      expect(p.p95LatencyMs).toBeGreaterThan(p.p50LatencyMs);
    });
  });

  it('counts spend and tokens for this UTC month only', async () => {
    expect(await stats()).toMatchObject({ tokensMonth: 0, spendMonthUsdMicros: 0 });
    chargeSpend(w.ps, { usdMicros: 4_000_000, source: 'workpack', epicId: null, workpackId: null, agentId: 'codecraft' });
    recordSpendEntry(w.ps, { usdMicros: 9_000_000, source: 'workpack', epicId: null, workpackId: null, agentId: 'codecraft', at: '2026-10-31T23:00:00.000Z' });
    const s = await stats();
    expect(s.spendMonthUsdMicros).toBe(4_000_000);
    expect(s.tokensMonth).toBeGreaterThan(1_000_000);
    expect(s.tokensMonth).toBeLessThan(3_000_000);
  });

  it('lists one routing row per specialist from the model map, priced from the catalog', async () => {
    const { routing } = await stats();
    const agents = (await w.call<Agent[]>('GET', '/agents')).body;
    expect(routing.map((r) => r.agentId)).toEqual(AGENT_IDS);
    routing.forEach((row, i) => {
      const agent = agents[i]!;
      expect(row).toMatchObject({ agentName: agent.name, primary: agent.config.model.primary, fallbacks: agent.config.model.fallbacks, failovers24h: agent.failovers24h });
      expect(row.p50LatencyMs).toBeGreaterThan(100);
      expect(row.costPerMTokUsdMicros).toBeGreaterThan(0);
    });
    const cost = (id: string) => routing.find((r) => r.agentId === id)!.costPerMTokUsdMicros;
    expect(cost('architect-prime')).toBeGreaterThan(cost('codecraft'));
    expect(cost('codecraft')).toBeGreaterThan(cost('docuforge'));
  });

  it('reports the cache hit ratio near the target, and failovers summed from the specialists, for a populated project', async () => {
    populate();
    const s = await stats();
    expect(s.cacheHitRatio).toBeGreaterThan(0.86);
    expect(s.cacheHitRatio).toBeLessThan(0.89);
    const agents = (await w.call<Agent[]>('GET', '/agents')).body;
    expect(s.failovers24h).toBe(agents.reduce((sum, a) => sum + a.failovers24h, 0));
    expect(s.failoverRate24h).toBeGreaterThan(0);
    expect(s.failoverRate24h).toBeLessThan(0.05);
  });

  it('reports no cache traffic and no failovers for a bare project', async () => {
    expect(await stats()).toMatchObject({ cacheHitRatio: 0, failovers24h: 0, failoverRate24h: 0 });
  });
});

describe('version history', () => {
  beforeEach(populate);

  it('lists versions newest first with their status, and each finished eval', async () => {
    const versions = await getVersions('codecraft');
    expect(versions.map((v) => [v.version, v.status])).toEqual([
      [4, 'active'],
      [3, 'failed'],
      [2, 'superseded'],
      [1, 'superseded'],
    ]);
    for (const v of versions) AgentConfigVersionSchema.parse(v);
    expect(versions[0]!.activatedAt).not.toBeNull();
    expect(versions[3]).toMatchObject({ gated: true, evalRun: null, note: expect.any(String) });
  });

  it('keeps a failed version’s regression: down 3.4 points, with the reason', async () => {
    const failed = await getVersion('codecraft', 3);
    expect(failed.status).toBe('failed');
    expect(failed.evalRun).toMatchObject({ status: 'failed', ticketsDone: 200, ticketsTotal: 200, deltaFirstPassPts: -3.4, trigger: 'on-change' });
    expect(failed.evalRun!.reasons.join(' ')).toMatch(/fell 3\.4 pts/);
    expect(failed.activatedAt).toBeNull();
  });

  it('builds the other specialists’ histories', async () => {
    expect((await getVersions('architect-prime')).map((v) => [v.version, v.status])).toEqual([
      [2, 'active'],
      [1, 'superseded'],
    ]);
    expect((await getVersions('secops-vanguard')).map((v) => [v.version, v.status])).toEqual([
      [2, 'active'],
      [1, 'superseded'],
    ]);
    expect((await getVersions('docuforge')).map((v) => [v.version, v.status])).toEqual([[1, 'active']]);
    expect((await getVersions('sentrywatch')).map((v) => [v.version, v.status])).toEqual([[1, 'active']]);
  });

  it('matches the dogfood audit trail: CodeCraft v4 went live two days ago, saved by the maintainer', async () => {
    const v4 = await getVersion('codecraft', 4);
    expect(v4.createdBy).toBe('Mira Okafor');
    expect(TEST_NOW_MS - Date.parse(v4.activatedAt!)).toBe(2 * 86_400_000);
  });

  it('puts the active version’s config on the agent', async () => {
    const agent = await getAgent('codecraft');
    expect(agent.activeVersion).toBe(4);
    expect((await getVersion('codecraft', 4)).config).toEqual(agent.config);
    expect((await getVersion('codecraft', 1)).config).not.toEqual(agent.config);
  });

  it('pages and finds one version, or reports 404', async () => {
    const first = (await w.call<Paged<AgentConfigVersion>>('GET', '/agents/codecraft/versions?limit=3')).body;
    expect(first.items.map((v) => v.version)).toEqual([4, 3, 2]);
    expect(first.nextCursor).toBe('3');
    const rest = (await w.call<Paged<AgentConfigVersion>>('GET', `/agents/codecraft/versions?limit=3&cursor=${first.nextCursor}`)).body;
    expect(rest.items.map((v) => v.version)).toEqual([1]);
    expect(rest.nextCursor).toBeNull();

    const third = first.items[1]!;
    expect((await w.call<AgentConfigVersion>('GET', `/agents/codecraft/versions/${third.id}`)).body).toMatchObject({ id: third.id, version: 3 });

    expect((await w.call<Problem>('GET', '/agents/codecraft/versions/9')).status).toBe(404);
    expect((await w.call<Problem>('GET', '/agents/nobody/versions')).status).toBe(404);
  });

  it('shows GateKeeper’s second version mid-evaluation, so the badge is there on load', async () => {
    const agent = await getAgent('gatekeeper');
    expect(agent).toMatchObject({ activeVersion: 1, evaluatingVersion: 2 });
    const v2 = await getVersion('gatekeeper', 2);
    expect(v2).toMatchObject({ status: 'evaluating', gated: true });
    expect(v2.evalRun).toMatchObject({ status: 'running', ticketsTotal: 200, firstPassRate: null });
    expect(v2.evalRun!.ticketsDone).toBeGreaterThanOrEqual(105);
    expect(v2.evalRun!.ticketsDone).toBeLessThanOrEqual(115);
  });

  it('finishes that evaluation with the passage of time', async () => {
    advance(w, 25_000);
    const v2 = await getVersion('gatekeeper', 2);
    expect(v2.status).toBe('passed');
    expect(v2.evalRun).toMatchObject({ status: 'passed', ticketsDone: 200 });
    expect((await getAgent('gatekeeper')).evaluatingVersion).toBeNull();
  });
});

describe('saving a version', () => {
  it('is for a maintainer: viewers and engineers get 403 naming the role', async () => {
    const config = await harmless();
    for (const role of ['viewer', 'engineer'] as const) {
      const denied = await save('codecraft', config, role);
      expect(denied.status, role).toBe(403);
      expect(denied.body).toMatchObject({ type: 'forbidden', requiredRole: 'maintainer' });
    }
    expect((await save('codecraft', config, 'maintainer')).status).toBe(201);
  });

  it('stores the version as evaluating and starts a 200-ticket eval against the seeded baseline', async () => {
    const config = withModel(await configOf('codecraft'), { temperature: 0.3 });
    const res = await save('codecraft', config, 'maintainer', 'A little warmer');
    expect(res.status).toBe(201);
    const version = AgentConfigVersionSchema.parse(res.body);
    expect(version).toMatchObject({ agentId: 'codecraft', version: 2, status: 'evaluating', gated: true, note: 'A little warmer', createdBy: 'Test maintainer', activatedAt: null });
    expect(version.config).toEqual(config);
    expect(version.evalRun).toMatchObject({
      trigger: 'on-change',
      status: 'running',
      ticketsTotal: 200,
      ticketsDone: 0,
      baselineFirstPassRate: 0.86,
      baselineCostPerPrUsdMicros: 2_100_000,
      firstPassRate: null,
      costPerPrUsdMicros: null,
      deltaFirstPassPts: null,
      deltaCostPct: null,
      reasons: [],
      finishedAt: null,
    });
  });

  it('never changes what runs: the active version stays put until a promotion', async () => {
    await save('codecraft', withModel(await configOf('codecraft'), { temperature: 0.3 }));
    const agent = await getAgent('codecraft');
    expect(agent).toMatchObject({ activeVersion: 1, evaluatingVersion: 2 });
    expect(agent.config.model.temperature).toBe(0.2);
  });

  it('takes the baseline from the active version’s own eval when it has one', async () => {
    populate();
    const active = (await getVersion('codecraft', 4)).evalRun!;
    const res = await save('codecraft', await harmless());
    expect(res.body.version).toBe(5);
    expect(res.body.evalRun).toMatchObject({ baselineFirstPassRate: active.firstPassRate, baselineCostPerPrUsdMicros: active.costPerPrUsdMicros });
  });

  it('numbers versions and evals with ids that never collide', async () => {
    populate();
    const idsBefore = (await Promise.all(AGENT_IDS.map((id) => getVersions(id)))).flat();
    const res = await save('codecraft', await harmless());
    const ids = [...idsBefore.map((v) => v.id), res.body.id];
    expect(new Set(ids).size).toBe(ids.length);
    const evals = [...idsBefore.map((v) => v.evalRun?.id), res.body.evalRun!.id].filter(Boolean);
    expect(new Set(evals).size).toBe(evals.length);
  });

  it('records the save in the audit log', async () => {
    await save('codecraft', await harmless(), 'maintainer', 'More turns');
    const [entry] = await auditOf('agent.version_created');
    expect(entry).toMatchObject({ actor: 'u-maintainer', actorName: 'Test maintainer', target: { agentId: 'codecraft', version: 2, gated: true } });
  });

  it.each<[string, (c: AgentConfig) => AgentConfig, string]>([
    ['a config that belongs to another specialist', (c) => ({ ...c, id: 'gatekeeper' }), 'config.id'],
    ['a fallback equal to the primary', (c) => withModel(c, { fallbacks: [c.model.primary] }), 'config.model.fallbacks'],
    ['the same fallback twice', (c) => withModel(c, { fallbacks: ['openai/gpt-4o', 'openai/gpt-4o'] }), 'config.model.fallbacks'],
    ['a skill this specialist does not offer', (c) => ({ ...c, skills: ['playwright-e2e-matrix'] }), 'config.skills'],
    ['a skill that does not exist', (c) => ({ ...c, skills: ['telepathy'] }), 'config.skills'],
    ['a blank system prompt', (c) => ({ ...c, systemPrompt: '   \n ' }), 'config.systemPrompt'],
  ])('refuses %s with a 422 naming the field', async (_label, change, path) => {
    const res = await save('codecraft', change(await configOf('codecraft')));
    expect(res.status).toBe(422);
    expect(res.body.type).toBe('validation_failed');
    expect(res.body.errors?.map((e) => e.path)).toContain(path);
  });

  it('refuses a model outside the catalog', async () => {
    const config = withModel(await configOf('codecraft'), { primary: 'openai/gpt-5' as never });
    const res = await save('codecraft', config);
    expect(res.status).toBe(422);
    expect(res.body.errors?.map((e) => e.path)).toContain('config.model.primary');
  });

  it('reports every problem at once', async () => {
    const config = { ...withModel(await configOf('codecraft'), { fallbacks: ['openai/gpt-4o', 'openai/gpt-4o'] }), id: 'docuforge', skills: ['telepathy'] };
    const res = await save('codecraft', config);
    expect(res.body.errors?.map((e) => e.path).sort()).toEqual(['config.id', 'config.model.fallbacks', 'config.skills']);
  });

  it('refuses a save that changes nothing, even when tools or skills are only reordered', async () => {
    const config = await configOf('codecraft');
    const same = await save('codecraft', config);
    expect(same.status).toBe(422);
    expect(same.body.title).toBe('Nothing changed');

    const reordered = await save('codecraft', { ...config, tools: [...config.tools].reverse(), skills: [...config.skills].reverse() });
    expect(reordered.status).toBe(422);
    expect(reordered.body.title).toBe('Nothing changed');
    expect(await getVersions('codecraft')).toHaveLength(1);
  });

  it('activates a change to the autonomy policy alone at once, with no eval, and audits who may now merge', async () => {
    const config = await configOf('codecraft');
    const res = await save('codecraft', { ...config, autonomyPolicy: 'propose-only' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ version: 2, status: 'active', gated: false, evalRun: null });
    expect(res.body.activatedAt).not.toBeNull();

    expect((await getVersions('codecraft')).map((v) => [v.version, v.status])).toEqual([
      [2, 'active'],
      [1, 'superseded'],
    ]);
    expect(await getAgent('codecraft')).toMatchObject({ activeVersion: 2, evaluatingVersion: null, config: { autonomyPolicy: 'propose-only' } });
    expect(eventTypes(w.ps)).toContain('agent.version.activated');
    const [entry] = await auditOf('agent.autonomy_changed');
    expect(entry).toMatchObject({ target: { agentId: 'codecraft', version: 2, from: config.autonomyPolicy, to: 'propose-only' } });
  });

  it('lets an autonomy change through while another version is under evaluation or the cap is hit', async () => {
    await save('codecraft', await harmless());
    const config = await configOf('codecraft');
    expect((await save('codecraft', { ...config, autonomyPolicy: 'draft-and-queue' })).status).toBe(201);

    setSpend(w.ps, w.ps.budget.capUsdMicros);
    expect((await save('gatekeeper', { ...(await configOf('gatekeeper')), autonomyPolicy: 'propose-only' })).status).toBe(201);
  });

  it('allows one evaluation per specialist at a time, with 409 eval_in_progress', async () => {
    const first = await save('codecraft', await harmless());
    expect(first.status).toBe(201);
    const second = await save('codecraft', withModel(await configOf('codecraft'), { temperature: 0.1 }));
    expect(second.status).toBe(409);
    expect(second.body.type).toBe('eval_in_progress');

    expect((await save('gatekeeper', await harmless('gatekeeper'))).status).toBe(201);
    advance(w, 45_000);
    expect((await save('codecraft', withModel(await configOf('codecraft'), { temperature: 0.1 }))).status).toBe(201);
  });

  it('refuses to start an eval at the budget hard cap, with 409 budget_blocked', async () => {
    setSpend(w.ps, w.ps.budget.capUsdMicros);
    const res = await save('codecraft', await harmless());
    expect(res.status).toBe(409);
    expect(res.body.type).toBe('budget_blocked');
    expect(await getVersions('codecraft')).toHaveLength(1);
  });
});

describe('eval simulation', () => {
  const start = async (config?: AgentConfig, id = 'codecraft') => {
    const res = await save(id, config ?? (await harmless(id)));
    expect(res.status).toBe(201);
    return res.body.version;
  };
  const evalOf = async (version: number, id = 'codecraft') => (await getVersion(id, version)).evalRun!;

  it('advances through the 200 tickets in about forty seconds', async () => {
    const version = await start();
    advance(w, 20_000);
    const mid = await evalOf(version);
    expect(mid.status).toBe('running');
    expect(mid.ticketsDone).toBeGreaterThanOrEqual(90);
    expect(mid.ticketsDone).toBeLessThanOrEqual(110);

    advance(w, 21_000);
    expect((await evalOf(version)).ticketsDone).toBe(200);
  });

  it('streams progress at most every two seconds and then the verdict', async () => {
    const version = await start();
    advance(w, 45_000);
    const progress = w.ps.events.ring.filter((e) => e.event.type === 'agent.eval.progress');
    const times = progress.map((e) => Date.parse(e.ts));
    expect(progress.length).toBeGreaterThanOrEqual(15);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(2000);
    const ticks = progress.map((e) => (e.event as { ticketsDone: number }).ticketsDone);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    expect(progress[0]!.event).toMatchObject({ agentId: 'codecraft', version, ticketsDone: 0, ticketsTotal: 200 });

    const completed = w.ps.events.ring.filter((e) => e.event.type === 'agent.eval.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]!.event).toMatchObject({ agentId: 'codecraft', version, status: 'passed' });
  });

  it('bills about four cents a ticket to the project as eval spend', async () => {
    const before = (await budget()).spendUsdMicros;
    await start();
    advance(w, 45_000);
    expect((await budget()).spendUsdMicros - before).toBe(8_000_000);
    const bySource = (await w.call<Attribution>('GET', '/budget/attribution?by=source')).body.items;
    expect(bySource.find((i) => i.key === 'eval')?.usdMicros).toBe(8_000_000);
    const byAgent = (await w.call<Attribution>('GET', '/budget/attribution?by=agent')).body.items;
    expect(byAgent.find((i) => i.key === 'codecraft')?.usdMicros).toBe(8_000_000);
  });

  it.each<[string, (c: AgentConfig) => AgentConfig]>([
    ['a temperature of 0.7 or more', (c) => withModel(c, { temperature: 0.7 })],
    ['a system prompt under 40% of the baseline’s length', (c) => ({ ...c, systemPrompt: c.systemPrompt.slice(0, Math.floor(c.systemPrompt.length * 0.39)) })],
    ['a primary model changed to Haiku from a stronger one', (c) => withModel(c, { primary: 'anthropic/claude-haiku', fallbacks: ['anthropic/claude-sonnet', 'openai/gpt-4o'] })],
  ])('fails the gate for %s', async (_label, change) => {
    const version = await start(change(await configOf('codecraft')));
    advance(w, 45_000);
    const finished = await getVersion('codecraft', version);
    expect(finished.status).toBe('failed');
    expect(finished.evalRun).toMatchObject({ status: 'failed', ticketsDone: 200 });
    expect(finished.evalRun!.reasons.length).toBeGreaterThan(0);
    const { deltaFirstPassPts, deltaCostPct } = finished.evalRun!;
    expect(deltaFirstPassPts! <= -3 || deltaCostPct! >= 12).toBe(true);
    expect(finished.evalRun!.firstPassRate).not.toBeNull();
    expect(finished.evalRun!.finishedAt).not.toBeNull();
    expect((await getAgent('codecraft')).evaluatingVersion).toBeNull();
    const completed = w.ps.events.ring.filter((e) => e.event.type === 'agent.eval.completed');
    expect(completed[0]!.event).toMatchObject({ status: 'failed', deltaFirstPassPts, deltaCostPct });
  });

  it.each<[string, (c: AgentConfig) => AgentConfig]>([
    ['a skill taken away', (c) => ({ ...c, skills: c.skills.slice(1) })],
    ['a longer turn limit', (c) => withLimits(c, { maxTurns: c.limits.maxTurns + 8 })],
    ['a cooler temperature', (c) => withModel(c, { temperature: 0.1 })],
  ])('passes with a small improvement for %s', async (_label, change) => {
    const version = await start(change(await configOf('codecraft')));
    advance(w, 45_000);
    const finished = await getVersion('codecraft', version);
    expect(finished.status).toBe('passed');
    expect(finished.evalRun).toMatchObject({ status: 'passed', reasons: [] });
    expect(finished.evalRun!.deltaFirstPassPts).toBeGreaterThanOrEqual(0.3);
    expect(finished.evalRun!.deltaFirstPassPts).toBeLessThanOrEqual(2.5);
    expect(finished.evalRun!.deltaCostPct).toBeLessThanOrEqual(-0.5);
    expect(finished.evalRun!.deltaCostPct).toBeGreaterThanOrEqual(-8);
    expect(finished.evalRun!.firstPassRate).toBeCloseTo(0.86 + finished.evalRun!.deltaFirstPassPts! / 100, 3);
  });

  it('does not count a move from Haiku to a stronger model as a regression', async () => {
    const config = withModel(await configOf('docuforge'), { primary: 'anthropic/claude-sonnet', fallbacks: ['anthropic/claude-haiku', 'openai/gpt-4o'] });
    const version = await start(config, 'docuforge');
    advance(w, 45_000);
    expect((await getVersion('docuforge', version)).status).toBe('passed');
  });

  it('gives the same numbers for the same config, every time', async () => {
    const config = withModel(await configOf('gatekeeper'), { temperature: 0.05 });
    const version = await start(config, 'gatekeeper');
    advance(w, 45_000);
    const first = await evalOf(version, 'gatekeeper');

    w.close();
    w = createWorld();
    const again = await start(withModel(await configOf('gatekeeper'), { temperature: 0.05 }), 'gatekeeper');
    advance(w, 45_000);
    const second = await evalOf(again, 'gatekeeper');
    expect({ ...second, id: '', startedAt: '', finishedAt: '' }).toEqual({ ...first, id: '', startedAt: '', finishedAt: '' });
  });

  it('is judged against the baseline of the moment the eval began, and keeps the active version while it runs', async () => {
    const version = await start();
    advance(w, 45_000);
    const finished = await evalOf(version);
    expect(finished.baselineFirstPassRate).toBe(0.86);
    expect(await getAgent('codecraft')).toMatchObject({ activeVersion: 1, evaluatingVersion: null });
  });

  it('stops spending when the budget cap is reached, stays evaluating, and finishes once the cap is raised', async () => {
    setSpend(w.ps, w.ps.budget.capUsdMicros - 1_000_000);
    const version = await start();
    advance(w, 60_000);

    const stalled = await evalOf(version);
    expect(stalled.status).toBe('running');
    expect(stalled.ticketsDone).toBeGreaterThan(0);
    expect(stalled.ticketsDone).toBeLessThan(200);
    expect(await budget()).toMatchObject({ hardCapHit: true });
    expect((await getAgent('codecraft')).evaluatingVersion).toBe(version);

    advance(w, 10_000);
    expect((await evalOf(version)).ticketsDone).toBe(stalled.ticketsDone);
    expect((await budget()).spendUsdMicros).toBe(w.ps.budget.capUsdMicros);

    const raised = await w.call('PUT', '/budget', { role: 'admin', body: { monthlyCapUsd: 10_000, softLimitPercent: 80 } });
    expect(raised.status).toBe(200);
    advance(w, 45_000);
    expect(await evalOf(version)).toMatchObject({ status: 'passed', ticketsDone: 200 });
  });

  it('runs faster with the dev-panel speed: 4× finishes in about ten seconds', async () => {
    w.store.sim.speed = 4;
    const version = await start();
    advance(w, 11_000);
    expect((await evalOf(version)).status).toBe('passed');
  });

  it('also advances from the simulator tick, which only moves the clock', async () => {
    const version = await start();
    advanceClock(w.store, 20_000);
    tickPlatform(w.ps);
    const mid = await evalOf(version);
    expect(mid.ticketsDone).toBeGreaterThanOrEqual(95);
    expect(mid.ticketsDone).toBeLessThanOrEqual(105);

    advanceClock(w.store, 25_000);
    tickPlatform(w.ps);
    expect((await evalOf(version)).status).toBe('passed');
    expect((await budget()).spendUsdMicros).toBe(8_000_000);
  });

  it('shows the spend of an eval as the specialist’s 24 h cost and tokens, and lets it age out after a day', async () => {
    await start();
    advance(w, 45_000);
    const during = await getAgent('codecraft');
    expect(during.cost24hUsdMicros).toBe(8_000_000);
    expect(during.tokens24h).toBeGreaterThan(1_000_000);
    expect(during.cacheHitRatio).toBeGreaterThan(0.8);
    expect((await getAgent('gatekeeper'))).toMatchObject({ cost24hUsdMicros: 0, tokens24h: 0 });

    advance(w, 25 * 3_600_000, 3_600_000);
    expect(await getAgent('codecraft')).toMatchObject({ cost24hUsdMicros: 0, tokens24h: 0 });
  });

  it('keeps the same figures however often the tick runs', async () => {
    await start();
    advance(w, 45_000);
    const once = await getAgent('codecraft');
    tickPlatform(w.ps);
    tickPlatform(w.ps);
    expect(await getAgent('codecraft')).toEqual(once);
  });

  it('does not charge twice when the tick and the scheduled step both run', async () => {
    const version = await start();
    for (let i = 0; i < 50; i++) {
      advance(w, 1000);
      tickPlatform(w.ps);
    }
    expect((await evalOf(version)).ticketsDone).toBe(200);
    expect((await budget()).spendUsdMicros).toBe(8_000_000);
  });
});

describe('promoting and rolling back', () => {
  /** Save a harmless change, let its eval pass, and return its version number. */
  const passing = async (id = 'codecraft') => {
    const res = await save(id, await harmless(id));
    advance(w, 45_000);
    return res.body.version;
  };

  it('is for a maintainer', async () => {
    const version = await passing();
    for (const role of ROLE_ORDER.slice(0, 2)) {
      const denied = await promote('codecraft', version, role);
      expect(denied.status, role).toBe(403);
      expect(denied.body).toMatchObject({ type: 'forbidden', requiredRole: 'maintainer' });
    }
    expect((await promote('codecraft', version, 'maintainer')).status).toBe(200);
  });

  it('promotes a passed version: it becomes active, the old one superseded, and the agent runs its config', async () => {
    const version = await passing();
    const res = await promote('codecraft', version);
    expect(res.status).toBe(200);
    const agent = AgentSchema.parse(res.body);
    expect(agent).toMatchObject({ activeVersion: version, evaluatingVersion: null });
    expect(agent.config).toEqual((await getVersion('codecraft', version)).config);

    const versions = await getVersions('codecraft');
    expect(versions.map((v) => [v.version, v.status])).toEqual([
      [version, 'active'],
      [1, 'superseded'],
    ]);
    expect(versions[0]!.activatedAt).toBe(new Date(w.store.clock.fixedMs!).toISOString());
    expect(eventTypes(w.ps)).toContain('agent.version.activated');
    const activated = w.ps.events.ring.find((e) => e.event.type === 'agent.version.activated')!;
    expect(activated.event).toMatchObject({ agentId: 'codecraft', version, actor: 'Test maintainer' });
    const [entry] = await auditOf('agent.version_activated');
    expect(entry).toMatchObject({ target: { agentId: 'codecraft', version, previousVersion: 1 } });
  });

  it('stamps new runs with the version that is now active', async () => {
    const version = await passing();
    await promote('codecraft', version);
    const { activeVersionNumber } = await import('../backend/workpacks');
    expect(activeVersionNumber(w.ps, 'codecraft')).toBe(version);
  });

  it('can never promote a failed version, and says to save a new one', async () => {
    const res = await save('codecraft', withModel(await configOf('codecraft'), { temperature: 0.8 }));
    advance(w, 45_000);
    const promoted = await promote('codecraft', res.body.version);
    expect(promoted.status).toBe(409);
    expect(promoted.body.type).toBe('illegal_transition');
    expect(promoted.body.title).toBe('A failed version can never be promoted. Save a new version instead.');
    expect((await getAgent('codecraft')).activeVersion).toBe(1);
  });

  it('makes a version under evaluation wait', async () => {
    const res = await save('codecraft', await harmless());
    const promoted = await promote('codecraft', res.body.version);
    expect(promoted.status).toBe(409);
    expect(promoted.body.type).toBe('illegal_transition');
    expect(promoted.body.title).toBe('Wait for the evaluation to finish.');
  });

  it('rolls back to a previously active version with no new eval and no new spend', async () => {
    populate();
    const codecraftSpend = async () => (await w.call<Attribution>('GET', '/budget/attribution?by=agent')).body.items.find((i) => i.key === 'codecraft')?.usdMicros ?? 0;
    const res = await promote('codecraft', 2);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activeVersion: 2, evaluatingVersion: null });
    expect((await getVersions('codecraft')).map((v) => [v.version, v.status])).toEqual([
      [4, 'superseded'],
      [3, 'failed'],
      [2, 'active'],
      [1, 'superseded'],
    ]);
    advance(w, 60_000);
    expect(await codecraftSpend()).toBe(0);
    expect((await getVersions('codecraft')).map((v) => v.evalRun?.status ?? null)).toEqual(['passed', 'failed', 'passed', null]);
    const [entry] = await auditOf('agent.version_activated');
    expect(entry).toMatchObject({ target: { agentId: 'codecraft', version: 2, previousVersion: 4, rollback: true } });
  });

  it('treats promoting the version that is already active as done, and records nothing', async () => {
    populate();
    const res = await promote('codecraft', 4);
    expect(res.status).toBe(200);
    expect(res.body.activeVersion).toBe(4);
    expect(await auditOf('agent.version_activated')).toHaveLength(0);
  });

  it('answers 404 for a version or specialist that does not exist, and 422 for a bad body', async () => {
    expect((await promote('codecraft', 9)).status).toBe(404);
    expect((await promote('nobody', 1)).status).toBe(404);
    const bad = await w.call<Problem>('PUT', '/agents/codecraft/active-version', { role: 'maintainer', body: { version: 'two' } });
    expect(bad.status).toBe(422);
  });
});

describe('manual intake cycles', () => {
  const dsl = (title: string) => `---\ntitle: "${title}"\nmode: feature\npriority: P2\nareas: [billing]\nacceptance:\n  - "Works"\n---\n`;
  const issue = (title: string, labels?: string[]) => fileIssue(w.ps, { title, body: dsl(title), origin: 'github-ui', author: 'octocat', ...(labels ? { labels } : {}) });
  const intake = async () => (await w.call<Paged<IntakeEvent>>('GET', '/intake')).body.items;
  const epics = async () => (await w.call<Paged<Epic>>('GET', '/epics')).body.items;

  it('is for a maintainer', async () => {
    for (const role of ROLE_ORDER.slice(0, 2)) {
      const denied = await run('architect-prime', role);
      expect(denied.status, role).toBe(403);
      expect(denied.body).toMatchObject({ type: 'forbidden', requiredRole: 'maintainer' });
    }
    expect((await run('architect-prime', 'maintainer')).status).toBe(200);
    expect((await run('architect-prime', 'admin')).status).toBe(200);
  });

  it.each(['codecraft', 'gatekeeper', 'secops-vanguard', 'docuforge'])('refuses %s, which has no intake cycle', async (id) => {
    const res = await run(id);
    expect(res.status).toBe(409);
    expect(res.body.type).toBe('illegal_transition');
    expect(res.body.title).toMatch(/has no intake cycle/);
    expect(res.body.title).toContain((await getAgent(id)).name);
  });

  it('answers 404 for a specialist that does not exist', async () => {
    expect((await run('nobody')).status).toBe(404);
  });

  it('has Architect-Prime take every unprocessed labelled issue now, and ignore the rest', async () => {
    issue('Add retries');
    issue('Add backoff');
    issue('Unlabelled idea', ['question']);
    const res = await run('architect-prime');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ agentId: 'architect-prime', processed: 2, filed: 0 });
    expect((await epics()).map((e) => e.title).sort()).toEqual(['Add backoff', 'Add retries']);
    expect((await intake()).map((e) => e.outcome)).toEqual(['accepted', 'accepted']);

    expect((await run('architect-prime')).body).toMatchObject({ processed: 0, filed: 0 });
    expect(await epics()).toHaveLength(2);
  });

  it('does not process an issue twice when its webhook was already on the way', async () => {
    const filed = issue('Add retries');
    scheduleIntake(w.ps, filed.number);
    expect((await run('architect-prime')).body.processed).toBe(1);
    advance(w, 5_000);
    expect((await intake()).filter((e) => e.issueNumber === filed.number)).toHaveLength(1);
    expect(await epics()).toHaveLength(1);
  });

  it('refuses a cycle while GitHub is disabled, with 503 github_unavailable', async () => {
    w.ps.integrations.find((i) => i.id === 'github')!.enabled = false;
    for (const id of ['architect-prime', 'sentrywatch']) {
      const res = await run(id);
      expect(res.status, id).toBe(503);
      expect(res.body.type).toBe('github_unavailable');
    }
  });

  it('shows the specialist working for about four seconds, then idle', async () => {
    await run('architect-prime');
    expect((await getAgent('architect-prime')).status).toBe('working');
    advance(w, 3_000);
    expect((await getAgent('architect-prime')).status).toBe('working');
    advance(w, 2_000);
    expect((await getAgent('architect-prime')).status).toBe('idle');
    const statuses = w.ps.events.ring.filter((e) => e.event.type === 'agent.status').map((e) => (e.event as { status: string }).status);
    expect(statuses).toEqual(['working', 'idle']);
  });

  it('scales that time with the dev-panel speed', async () => {
    w.store.sim.speed = 4;
    await run('sentrywatch');
    advance(w, 2_000);
    expect((await getAgent('sentrywatch')).status).toBe('idle');
  });

  it('lets the simulator see that a cycle is in progress, so it does not reset the status early', async () => {
    expect(manualCycleActive(w.ps, 'architect-prime')).toBe(false);
    await run('architect-prime');
    expect(manualCycleActive(w.ps, 'architect-prime')).toBe(true);
    expect(manualCycleActive(w.ps, 'sentrywatch')).toBe(false);
    expect(manualCycleActive(w.ps, 'nobody')).toBe(false);
    advance(w, 3_000);
    expect(manualCycleActive(w.ps, 'architect-prime')).toBe(true);
    advance(w, 1_000);
    expect(manualCycleActive(w.ps, 'architect-prime')).toBe(false);
  });

  it('does not clear a degraded status: that is a provider problem, not a cycle', async () => {
    setAgentStatus(w.ps, 'sentrywatch', 'degraded');
    await run('sentrywatch');
    expect((await getAgent('sentrywatch')).status).toBe('degraded');
    advance(w, 6_000);
    expect((await getAgent('sentrywatch')).status).toBe('degraded');
  });

  it('keeps a specialist working until the latest cycle is done', async () => {
    await run('sentrywatch');
    advance(w, 3_000);
    await run('sentrywatch');
    advance(w, 2_000);
    expect((await getAgent('sentrywatch')).status).toBe('working');
    advance(w, 3_000);
    expect((await getAgent('sentrywatch')).status).toBe('idle');
  });

  it('leaves Architect-Prime working while it still has an Epic in stages 1–2', async () => {
    issue('Add retries');
    await run('architect-prime');
    advance(w, 4_500);
    expect((await epics())[0]!.status).toMatch(/stage-1|stage-2/);
    expect((await getAgent('architect-prime')).status).toBe('working');
  });

  it('records the cycle in the audit log', async () => {
    await run('architect-prime');
    const [entry] = await auditOf('agent.cycle_started');
    expect(entry).toMatchObject({ actorName: 'Test maintainer', target: { agentId: 'architect-prime' } });
  });

  describe('SentryWatch', () => {
    const sentryIssues = () => w.ps.issues.filter((i) => i.origin === 'sentry');

    it('files a Sentry issue with generated frontmatter, and intake accepts it as a bug Epic', async () => {
      const res = await run('sentrywatch');
      expect(res.body).toEqual({ agentId: 'sentrywatch', processed: 0, filed: 1 });

      const [filed] = sentryIssues();
      expect(filed).toMatchObject({ origin: 'sentry', labels: ['factory'], processed: false });
      expect(filed!.title).toMatch(/^Unhandled \w+ in src\/\S+$/);
      expect(filed!.fingerprint).toMatch(/^fp-[0-9a-f]{8}$/);

      advance(w, 2_000);
      const [event] = await intake();
      expect(event).toMatchObject({ origin: 'sentry', outcome: 'accepted' });
      const epic = (await w.call<Epic>('GET', `/epics/${event!.epicId}`)).body;
      expect(epic).toMatchObject({
        origin: 'sentry',
        source: 'sentry-via-github',
        mode: 'bug',
        title: filed!.title,
        acceptance: ['The error fingerprint stops recurring in production'],
      });
      expect(['P0 Blocker', 'P1 High', 'P2 Normal']).toContain(epic.priority);
      expect(epic.areas).toHaveLength(1);
      expect(filed!.title).toContain(`src/${epic.areas[0]}/`);
    });

    it('sets the priority from the severity: fatal P0, error P1, warning P2', async () => {
      const priorities = new Set<string>();
      for (let i = 0; i < 4; i++) {
        await run('sentrywatch');
        advance(w, 6_000);
      }
      for (const e of await epics()) priorities.add(e.priority);
      expect(priorities.size).toBeGreaterThanOrEqual(2);
      for (const issue of sentryIssues()) {
        const body = issue.body;
        const severity = /Severity: (fatal|error|warning)/.exec(body)?.[1];
        const priority = /priority: (P\d)/.exec(body)?.[1];
        expect(`${severity}->${priority}`).toMatch(/^(fatal->P0|error->P1|warning->P2)$/);
      }
    });

    it('reuses an open Epic’s fingerprint one time in three, so intake reports a duplicate', async () => {
      for (let i = 0; i < 3; i++) {
        expect((await run('sentrywatch')).body.filed).toBe(1);
        advance(w, 6_000);
      }
      const events = await intake();
      expect(events.map((e) => e.outcome)).toEqual(['duplicate', 'accepted', 'accepted']);
      expect(events[0]!.canonicalEpicId).toBe(events[2]!.epicId);
      expect(await epics()).toHaveLength(2);
      const [a, , c] = sentryIssues();
      expect(c!.fingerprint).toBe(a!.fingerprint);
    });

    it('finds nothing new on some sweeps: files 0 or 1, never more', async () => {
      const filed: number[] = [];
      for (let i = 0; i < 5; i++) {
        filed.push((await run('sentrywatch')).body.filed);
        advance(w, 6_000);
      }
      expect(filed).toEqual([1, 1, 1, 1, 0]);
    });
  });
});

describe('the platform seed', () => {
  const snapshot = async () =>
    JSON.stringify(
      await Promise.all(
        ['/agents', '/integrations', '/policies', '/tokens', '/vault/keys', '/notifications/slack', '/repository'].map(
          async (path) => (await w.call('GET', path, { role: 'maintainer' })).body,
        ),
      ),
    );

  it('replaces whatever the project held, so seeding twice gives the same state', async () => {
    populate();
    const first = await snapshot();
    seedPlatform(w.ps, { populated: true });
    expect(await snapshot()).toBe(first);

    seedPlatform(w.ps, { populated: false });
    expect((await getVersions('codecraft')).map((v) => v.id)).toEqual(['ver-2']);
  });

  it('never dates anything before the project existed', async () => {
    w.close();
    w = createWorld({ platform: false });
    const start = TEST_NOW_MS - 3 * 86_400_000;
    w.ps.project.createdAt = new Date(start).toISOString();
    seedPlatform(w.ps, { populated: true });

    const stamps: string[] = [];
    for (const id of AGENT_IDS) {
      for (const v of await getVersions(id)) stamps.push(v.createdAt, ...(v.activatedAt ? [v.activatedAt] : []));
    }
    const vault = (await w.call<VaultKey[]>('GET', '/vault/keys', { role: 'maintainer' })).body;
    stamps.push(...vault.flatMap((k) => [k.createdAt, ...(k.rotatedAt ? [k.rotatedAt] : [])]));
    stamps.push((await w.call<ProjectToken>('GET', '/tokens')).body.createdAt);
    expect(stamps.length).toBeGreaterThan(15);
    for (const stamp of stamps) expect(Date.parse(stamp), stamp).toBeGreaterThanOrEqual(start);
  });

  it('leaves a bare project with one factory-default version per specialist and nothing else to show', async () => {
    const versions = (await Promise.all(AGENT_IDS.map((id) => getVersions(id)))).flat();
    expect(versions).toHaveLength(6);
    expect(versions.every((v) => v.status === 'active' && v.createdBy === 'Factory' && v.evalRun === null && v.note === 'Factory defaults')).toBe(true);
    expect(new Set(versions.map((v) => v.id)).size).toBe(6);
  });
});
