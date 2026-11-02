import type { AgentConfig, AgentConfigVersion, EvalRun, Integration, Repository, VaultKey } from '../../contracts';
import { REQUIRED_PAT_PERMISSIONS } from '../../contracts';
import { evaluateEval } from '../../domain/evalGate';
import { AGENT_SPECS, skillsOffered, type AgentSpec } from '../backend/agentCatalog';
import { baselineOf, setBackgroundActivity, startEval, syncAgentActivity } from '../backend/agents';
import { hash32, longHash } from '../backend/codegen';
import { nextId, nowMs } from '../backend/runtime';
import { maskWebhook } from '../backend/settings';
import type { AgentRecord, ProjectState } from '../backend/store';
import { PERSONAS } from '../personas';

export interface PlatformSeedOptions {
  /** `true` for the dogfood project: version history, vault keys, last-used times. `false` for a bare project. */
  populated: boolean;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const ADMIN = PERSONAS.admin.name;
const MAINTAINER = PERSONAS.maintainer.name;

// ---------------------------------------------------------------------------
// Agents and their version history
// ---------------------------------------------------------------------------

interface Step {
  /** When it took effect; for a version that never did, when it was saved. */
  daysAgo: number;
  note: string;
  author: string;
  /** The config of the version that is active when this one is saved. */
  config: (active: AgentConfig) => AgentConfig;
  /** What its eval measured. Absent for the first version, which has no baseline to beat. */
  outcome?: { firstPassRate: number; costPerPrUsdMicros: number };
  /** Promoted half an hour after it was saved, once it had passed. */
  activate?: boolean;
  /** Still being evaluated, this many tickets in. */
  runningAt?: number;
}

const withSkills = (c: AgentConfig, skills: string[]): AgentConfig => ({ ...c, skills });
const withTurns = (c: AgentConfig, maxTurns: number): AgentConfig => ({ ...c, limits: { ...c.limits, maxTurns } });

/** Matches what the dogfood audit trail says: CodeCraft v4 went live two days ago, saved by the maintainer. */
const HISTORIES: Record<string, Step[]> = {
  'architect-prime': [
    { daysAgo: 60, note: 'Initial configuration', author: ADMIN, config: (c) => withSkills(c, ['contract-first-review']) },
    {
      daysAgo: 2,
      note: 'Add DAG sizing guidance for large Epics',
      author: ADMIN,
      config: (c) => withSkills(c, ['contract-first-review', 'dag-sizing']),
      outcome: { firstPassRate: 0.879, costPerPrUsdMicros: 2_020_000 },
      activate: true,
    },
  ],
  codecraft: [
    { daysAgo: 60, note: 'Initial configuration', author: ADMIN, config: (c) => withSkills(c, []) },
    {
      daysAgo: 9,
      note: 'Allow more turns for multi-file workpacks and add idempotency guidance',
      author: ADMIN,
      config: (c) => withTurns(withSkills(c, ['idempotency-patterns']), 48),
      outcome: { firstPassRate: 0.862, costPerPrUsdMicros: 2_080_000 },
      activate: true,
    },
    {
      daysAgo: 3,
      note: 'Try a looser temperature for more varied refactors',
      author: MAINTAINER,
      config: (c) => ({ ...c, model: { ...c.model, temperature: 0.7 } }),
      outcome: { firstPassRate: 0.828, costPerPrUsdMicros: 2_130_000 },
    },
    {
      daysAgo: 2,
      note: 'Test-first guidance and the migration-safety skill',
      author: MAINTAINER,
      config: (c) => ({
        ...withSkills(c, ['idempotency-patterns', 'migration-safety']),
        systemPrompt: `${c.systemPrompt}\nWrite the failing test first, then the change that makes it pass.`,
      }),
      outcome: { firstPassRate: 0.874, costPerPrUsdMicros: 2_040_000 },
      activate: true,
    },
  ],
  gatekeeper: [
    { daysAgo: 60, note: 'Initial configuration', author: ADMIN, config: (c) => c },
    {
      daysAgo: 0,
      note: 'Add the migration-safety skill and a longer turn limit',
      author: MAINTAINER,
      config: (c) => withTurns(withSkills(c, [...c.skills, 'migration-safety']), 36),
      runningAt: 110,
    },
  ],
  'secops-vanguard': [
    { daysAgo: 60, note: 'Initial configuration', author: ADMIN, config: (c) => withSkills(c, ['secrets-hygiene']) },
    {
      daysAgo: 14,
      note: 'Enable the license policy skill',
      author: MAINTAINER,
      config: (c) => withSkills(c, ['secrets-hygiene', 'license-policy']),
      outcome: { firstPassRate: 0.871, costPerPrUsdMicros: 2_060_000 },
      activate: true,
    },
  ],
  docuforge: [{ daysAgo: 60, note: 'Initial configuration', author: ADMIN, config: (c) => c }],
  sentrywatch: [{ daysAgo: 60, note: 'Initial configuration', author: ADMIN, config: (c) => c }],
};

const EVAL_MS = 41_000;
const PROMOTE_AFTER_MS = 30 * MIN;
/** The time a simulated eval takes, which fixes how long ago a running one must have started. */
const FULL_EVAL_MS = 40_000;

/** How long before the step's `daysAgo` the version was saved. */
function savedBefore(step: Step): number {
  if (step.activate) return PROMOTE_AFTER_MS;
  if (step.runningAt !== undefined) return (step.runningAt / 200) * FULL_EVAL_MS;
  return 0;
}

/** The eval a finished version carries: judged by the same gate the live evals use. */
function finishedRun(
  ps: ProjectState,
  agentId: string,
  version: AgentConfigVersion,
  baseline: AgentConfigVersion,
  outcome: NonNullable<Step['outcome']>,
): EvalRun & { status: 'passed' | 'failed' } {
  const base = baselineOf(baseline);
  const verdict = evaluateEval({ ...outcome, baselineFirstPassRate: base.firstPassRate, baselineCostPerPrUsdMicros: base.costPerPrUsdMicros });
  const startedAt = Date.parse(version.createdAt);
  return {
    id: nextId(ps, 'eval'),
    agentId,
    version: version.version,
    trigger: 'on-change',
    status: verdict.status,
    ticketsTotal: 200,
    ticketsDone: 200,
    firstPassRate: outcome.firstPassRate,
    baselineFirstPassRate: base.firstPassRate,
    costPerPrUsdMicros: outcome.costPerPrUsdMicros,
    baselineCostPerPrUsdMicros: base.costPerPrUsdMicros,
    deltaFirstPassPts: verdict.deltaFirstPassPts,
    deltaCostPct: verdict.deltaCostPct,
    reasons: verdict.reasons,
    startedAt: iso(startedAt),
    finishedAt: iso(startedAt + EVAL_MS),
  };
}

function seedVersions(ps: ProjectState, record: AgentRecord, spec: AgentSpec, populated: boolean, now: number): void {
  const projectStart = Date.parse(ps.project.createdAt);
  const base = structuredClone(spec.config);

  if (!populated) {
    record.versions.push({
      id: nextId(ps, 'version'),
      agentId: spec.id,
      version: 1,
      status: 'active',
      config: base,
      note: 'Factory defaults',
      createdBy: 'Factory',
      createdAt: iso(projectStart),
      activatedAt: iso(projectStart),
      evalRun: null,
      gated: true,
    });
    return;
  }

  let active: AgentConfigVersion | null = null;
  (HISTORIES[spec.id] ?? []).forEach((step, index) => {
    // Nothing is older than the project.
    const savedAt = Math.max(projectStart, now - step.daysAgo * DAY - savedBefore(step));
    const version: AgentConfigVersion = {
      id: nextId(ps, 'version'),
      agentId: spec.id,
      version: index + 1,
      status: 'superseded',
      config: structuredClone(step.config(active ? active.config : base)),
      note: step.note,
      createdBy: step.author,
      createdAt: iso(savedAt),
      activatedAt: null,
      evalRun: null,
      gated: true,
    };
    if (!active) {
      version.status = 'active';
      version.activatedAt = version.createdAt;
      active = version;
    } else if (step.runningAt !== undefined) {
      version.status = 'evaluating';
      startEval(ps, record, version, active, { ticketsDone: step.runningAt, startedAt: version.createdAt });
    } else {
      const run = finishedRun(ps, spec.id, version, active, step.outcome!);
      version.evalRun = run;
      version.status = run.status;
      if (step.activate && run.status === 'passed') {
        active.status = 'superseded';
        version.status = 'active';
        version.activatedAt = iso(Math.max(savedAt + PROMOTE_AFTER_MS, projectStart));
        active = version;
      }
    }
    record.versions.push(version);
  });
}

function seedAgent(ps: ProjectState, spec: AgentSpec, populated: boolean, now: number): AgentRecord {
  const record: AgentRecord = {
    id: spec.id,
    name: spec.name,
    role: spec.role,
    initials: spec.initials,
    color: spec.color,
    stage: spec.stage,
    stageLabel: spec.stageLabel,
    responsibilities: [...spec.responsibilities],
    canRunNow: spec.canRunNow,
    availableSkills: skillsOffered(spec).map((s) => ({ ...s, tools: [...s.tools] })),
    status: 'idle',
    tokens24h: 0,
    cost24hUsdMicros: 0,
    cacheHitRatio: 0,
    failovers24h: 0,
    versions: [],
  };
  seedVersions(ps, record, spec, populated, now);
  if (populated) {
    // Cost and tokens are derived from the ledger plus this background (see `syncAgentActivity`).
    setBackgroundActivity(record, spec.activity.costUsdMicros);
    record.cacheHitRatio = spec.activity.cacheHitRatio;
    record.failovers24h = spec.activity.failovers;
  }
  return record;
}

// ---------------------------------------------------------------------------
// Repository, integrations, Slack, token and vault
// ---------------------------------------------------------------------------

function seedRepository(ps: ProjectState, populated: boolean, now: number): Repository {
  return {
    fullName: ps.project.repo,
    defaultBranch: ps.project.defaultBranch,
    language: 'TypeScript',
    languageSupported: true,
    webhookActive: true,
    permissions: REQUIRED_PAT_PERMISSIONS.map((name) => ({ name, granted: true })),
    lastSyncAt: populated ? iso(now - 4 * MIN) : null,
    intakeLabel: 'factory',
  };
}

function seedIntegrations(ps: ProjectState, populated: boolean, now: number): Integration[] {
  const hook = (id: string) => `https://studio.factory.dev/api/v1/hooks/${id}/${ps.project.id}`;
  const verified = iso(populated ? now - 4 * MIN : now);
  const provider = (id: Integration['id'], name: string, details: string): Integration => ({
    id,
    name,
    category: 'Model provider',
    status: 'connected',
    enabled: true,
    details,
    lastVerifiedAt: verified,
    webhookUrl: null,
  });
  const alertSource = (id: Integration['id'], name: string, connected: boolean): Integration => ({
    id,
    name,
    category: 'Alert source',
    status: connected ? 'connected' : 'disconnected',
    enabled: connected,
    details: connected ? 'Alerts reach SentryWatch through the webhook below.' : 'Add the webhook below to an alert rule to connect.',
    lastVerifiedAt: connected ? iso(now - 26 * MIN) : null,
    webhookUrl: hook(id),
  });
  const slackConnected = ps.slack.webhookConfigured;
  return [
    {
      id: 'github',
      name: 'GitHub',
      category: 'Source control',
      status: 'connected',
      enabled: true,
      details: `${ps.project.repo} · fine-grained token · webhook active`,
      lastVerifiedAt: verified,
      webhookUrl: null,
    },
    {
      id: 'slack',
      name: 'Slack',
      category: 'Notifications',
      status: slackConnected ? 'connected' : 'disconnected',
      enabled: slackConnected,
      details: slackConnected ? `Posting to ${ps.slack.channel}` : 'Add an incoming webhook under Notifications to connect.',
      lastVerifiedAt: slackConnected ? iso(now - 2 * HOUR) : null,
      webhookUrl: null,
    },
    provider('anthropic', 'Anthropic', 'Claude Opus, Sonnet and Haiku · pinned releases'),
    provider('openai', 'OpenAI', 'GPT-4o · pinned release'),
    provider('deepseek', 'DeepSeek', 'DeepSeek-V3 · pinned release'),
    {
      id: 'semgrep',
      name: 'Semgrep',
      category: 'Security scanner',
      status: 'connected',
      enabled: true,
      details: 'Rule pack v1.88.0 pinned · runs in the security gate',
      lastVerifiedAt: verified,
      webhookUrl: null,
    },
    alertSource('sentry', 'Sentry', populated),
    alertSource('datadog', 'Datadog', false),
  ];
}

/** Not a real hook: the shape of one, so the mask can be shown. */
const FAKE_WEBHOOK = 'https://hooks.slack.com/services/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';

function seedSlack(populated: boolean): ProjectState['slack'] {
  return {
    webhookConfigured: populated,
    webhookMasked: populated ? maskWebhook(FAKE_WEBHOOK) : null,
    channel: '#factory-alerts',
    oncallHandle: populated ? '@studio-oncall' : '',
    routing: { budget: true, review: true, failure: true, sla: true },
    rawWebhook: populated ? FAKE_WEBHOOK : null,
  };
}

/** Rotated six days ago by the admin, as the dogfood audit trail records (never older than the project). */
function seedToken(ps: ProjectState, populated: boolean, now: number): ProjectState['token'] {
  const projectStart = Date.parse(ps.project.createdAt);
  const last4 = (hash32(`token:${ps.project.id}`) % 36 ** 4).toString(36).padStart(4, '0');
  return {
    info: {
      prefix: 'fct_',
      last4,
      createdAt: iso(populated ? Math.max(projectStart, now - 6 * DAY) : projectStart),
      createdBy: populated ? ADMIN : 'Factory',
      lastUsedAt: populated ? iso(now - 12 * MIN) : null,
      lastUsedBy: populated ? 'factory CLI' : null,
      lastUsedClient: populated ? 'cli' : null,
      revoked: false,
    },
    hash: longHash(`fct:${ps.project.id}:${last4}`),
  };
}

function seedVault(ps: ProjectState, now: number): VaultKey[] {
  const projectStart = Date.parse(ps.project.createdAt);
  const at = (daysAgo: number) => iso(Math.max(projectStart, now - daysAgo * DAY));
  return [
    { name: 'PLAYWRIGHT_TEST_TOKEN', allowedGates: ['tests.e2e_viewports'], createdBy: MAINTAINER, createdAt: at(9), rotatedAt: at(3), lastUsedAt: iso(now - 2 * HOUR) },
    { name: 'STAGING_BASIC_AUTH', allowedGates: ['tests.e2e_viewports'], createdBy: MAINTAINER, createdAt: at(8), rotatedAt: null, lastUsedAt: iso(now - 2 * HOUR) },
    { name: 'SENTRY_AUTH_TOKEN', allowedGates: [], createdBy: ADMIN, createdAt: at(5), rotatedAt: null, lastUsedAt: null },
  ];
}

/**
 * Agents, integrations, policies, token, vault, Slack and the repository. Replaces whatever the project
 * held, so seeding twice gives the same state. Spend and budget belong to the main seed.
 */
export function seedPlatform(ps: ProjectState, options: PlatformSeedOptions): void {
  const { populated } = options;
  const now = nowMs(ps.store);
  ps.counters.version = 0;
  ps.counters.eval = 0;

  ps.repository = seedRepository(ps, populated, now);
  ps.agents = [];
  for (const spec of AGENT_SPECS) ps.agents.push(seedAgent(ps, spec, populated, now));
  ps.slack = seedSlack(populated);
  ps.integrations = seedIntegrations(ps, populated, now);
  ps.policies = { autoMergeVerifiedPRs: false, humanSignoffP0P1Schema: true, sastStrictness: 'strict', slaEscalation: true, hardBudgetTripwire: true };
  ps.token = seedToken(ps, populated, now);
  ps.vault = populated ? seedVault(ps, now) : [];
  syncAgentActivity(ps);
}
