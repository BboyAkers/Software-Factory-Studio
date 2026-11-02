import type {
  Agent,
  AgentConfig,
  AgentConfigVersion,
  CreateVersionRequest,
  EpicDsl,
  EvalRun,
  FieldError,
  FleetStats,
  ModelCatalogEntry,
  ModelId,
  Paged,
  ProviderStat,
  RoutingRow,
} from '../../contracts';
import { canonicalize } from '../../domain/auditChain';
import { monthPeriod } from '../../domain/budget';
import { toIssueBody } from '../../domain/dsl';
import { evaluateEval, gatedFieldsChanged } from '../../domain/evalGate';
import { ApiProblem, conflict, invalid, notFound } from '../http';
import { AGENT_SPECS, MODEL_CATALOG, MODEL_P50_MS, PROVIDERS, blendedPerMTok, tokensFor } from './agentCatalog';
import { enterHardCap, spendOrPause } from './budget';
import { hash32, hex8 } from './codegen';
import { evaluateIssue, fileIssue, intakeLabel, scheduleIntake } from './epics';
import { emit, isHardCapHit, nextId, nowIso, nowMs, pace, pageOf, recordAudit, schedule, setAgentStatus } from './runtime';
import type { Actor, AgentRecord, ProjectState } from './store';
import { SYSTEM_ACTOR, agentView } from './store';
import { integrationEnabled } from './workpacks';

const intParam = (query: URLSearchParams, name: string, fallback: number, max: number): number => {
  const n = Number(query.get(name));
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
};

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function agentById(ps: ProjectState, id: string): AgentRecord {
  const agent = ps.agents.find((a) => a.id === id);
  if (!agent) throw notFound('Agent', id);
  return agent;
}

export function activeVersionOf(agent: AgentRecord): AgentConfigVersion {
  return agent.versions.find((v) => v.status === 'active') ?? agent.versions[agent.versions.length - 1]!;
}

export function versionPage(agent: AgentRecord, query: URLSearchParams): Paged<AgentConfigVersion> {
  const newestFirst = [...agent.versions].sort((a, b) => b.version - a.version);
  return pageOf(newestFirst, intParam(query, 'limit', 50, 200), query.get('cursor'));
}

/** A version by its number (`3`) or its id (`ver-12`). */
export function versionOf(agent: AgentRecord, ref: string): AgentConfigVersion {
  const found = agent.versions.find((v) => String(v.version) === ref || v.id === ref);
  if (!found) throw notFound('Version', `${ref} of ${agent.name}`);
  return found;
}

export const modelCatalog = (): ModelCatalogEntry[] => MODEL_CATALOG.map((m) => ({ ...m }));

// ---------------------------------------------------------------------------
// Saving a version
// ---------------------------------------------------------------------------

function validateConfig(agent: AgentRecord, config: AgentConfig): FieldError[] {
  const errors: FieldError[] = [];
  if (config.id !== agent.id) {
    errors.push({ path: 'config.id', message: `This config belongs to ${config.id}, not ${agent.name}.`, code: 'id_mismatch' });
  }

  const { primary, fallbacks } = config.model;
  if (new Set(fallbacks).size !== fallbacks.length) {
    errors.push({ path: 'config.model.fallbacks', message: 'Each fallback can appear only once.', code: 'duplicate_fallback' });
  } else if (fallbacks.includes(primary)) {
    errors.push({ path: 'config.model.fallbacks', message: 'The primary model cannot also be a fallback.', code: 'primary_in_fallbacks' });
  }

  const unknown = config.skills.filter((name) => !agent.availableSkills.some((s) => s.name === name));
  if (unknown.length > 0) {
    errors.push({ path: 'config.skills', message: `${agent.name} does not offer: ${unknown.join(', ')}.`, code: 'unknown_skill' });
  }

  if (config.systemPrompt.trim() === '') {
    errors.push({ path: 'config.systemPrompt', message: 'The system prompt cannot be empty.', code: 'required' });
  }
  return errors;
}

function newVersion(
  ps: ProjectState,
  agent: AgentRecord,
  config: AgentConfig,
  note: string | undefined,
  actor: Actor,
  status: 'evaluating' | 'active',
  gated: boolean,
): AgentConfigVersion {
  const now = nowIso(ps.store);
  return {
    id: nextId(ps, 'version'),
    agentId: agent.id,
    version: Math.max(0, ...agent.versions.map((v) => v.version)) + 1,
    status,
    config,
    note: note ?? null,
    createdBy: actor.name,
    createdAt: now,
    activatedAt: status === 'active' ? now : null,
    evalRun: null,
    gated,
  };
}

/**
 * Save a new immutable version (spec §7.2). A behavioral change starts an eval and changes nothing that
 * runs; a change to the autonomy policy alone is audited and active at once.
 */
export function createVersion(ps: ProjectState, agent: AgentRecord, request: CreateVersionRequest, actor: Actor): AgentConfigVersion {
  const errors = validateConfig(agent, request.config);
  if (errors.length > 0) throw invalid(errors);

  const active = activeVersionOf(agent);
  // Identity is not editable: the specialist keeps its role and stage.
  const config: AgentConfig = { ...request.config, role: active.config.role, stage: active.config.stage };
  const change = gatedFieldsChanged(active.config, config);
  if (change.changed.length === 0) {
    throw invalid([{ path: 'config', message: 'This config is identical to the active version.', code: 'nothing_changed' }], 'Nothing changed');
  }

  if (change.auditOnly) {
    const version = newVersion(ps, agent, config, request.note, actor, 'active', false);
    active.status = 'superseded';
    agent.versions.push(version);
    recordAudit(ps, actor, 'agent.version_created', { agentId: agent.id, version: version.version, gated: false });
    recordAudit(ps, actor, 'agent.autonomy_changed', {
      agentId: agent.id,
      version: version.version,
      from: active.config.autonomyPolicy,
      to: config.autonomyPolicy,
    });
    emit(ps, { type: 'agent.version.activated', agentId: agent.id, version: version.version, actor: actor.name });
    return version;
  }

  if (agent.versions.some((v) => v.status === 'evaluating')) {
    throw conflict('eval_in_progress', `${agent.name} already has a version under evaluation. Wait for it to finish.`);
  }
  if (isHardCapHit(ps)) {
    throw conflict('budget_blocked', 'The budget hard cap is reached, so evaluations are paused. An Admin can raise the cap.');
  }

  const version = newVersion(ps, agent, config, request.note, actor, 'evaluating', true);
  agent.versions.push(version);
  const run = startEval(ps, agent, version, active);
  recordAudit(ps, actor, 'agent.version_created', { agentId: agent.id, version: version.version, gated: true, changed: change.changed });
  emit(ps, { type: 'agent.eval.progress', agentId: agent.id, version: version.version, ticketsDone: run.ticketsDone, ticketsTotal: run.ticketsTotal });
  return version;
}

/** Promote a passed version, or roll back to one that was active before. Never starts an eval. */
export function activateVersion(ps: ProjectState, agent: AgentRecord, versionNumber: number, actor: Actor): Agent {
  const target = agent.versions.find((v) => v.version === versionNumber);
  if (!target) throw notFound('Version', `${versionNumber} of ${agent.name}`);
  if (target.status === 'failed') throw conflict('illegal_transition', 'A failed version can never be promoted. Save a new version instead.');
  if (target.status === 'evaluating') throw conflict('illegal_transition', 'Wait for the evaluation to finish.');
  if (target.status === 'active') return agentViewOf(ps, agent);

  const previous = activeVersionOf(agent);
  const rollback = target.status === 'superseded';
  previous.status = 'superseded';
  target.status = 'active';
  target.activatedAt = nowIso(ps.store);
  recordAudit(ps, actor, 'agent.version_activated', { agentId: agent.id, version: target.version, previousVersion: previous.version, rollback });
  emit(ps, { type: 'agent.version.activated', agentId: agent.id, version: target.version, actor: actor.name });
  return agentViewOf(ps, agent);
}

// ---------------------------------------------------------------------------
// Eval simulation (spec §7.2): 200 historical tickets, about 40 s, billed as `eval` spend
// ---------------------------------------------------------------------------

const EVAL_TICKETS = 200;
const EVAL_DURATION_MS = 40_000;
const EVAL_STEP_MS = 1_000;
const EVAL_EMIT_MS = 2_000;
const TICKET_COST_USD_MICROS = 40_000;
/** Used when the active version has no eval of its own yet (spec §7.2: the baseline is the active version's run). */
const DEFAULT_BASELINE = { firstPassRate: 0.86, costPerPrUsdMicros: 2_100_000 };

/** Simulation scratch per eval run: how far it has really got, and what it was compared against. */
interface EvalTracker {
  /** Fractional tickets. Grows with the virtual clock, but not while the project is at its hard cap. */
  progress: number;
  lastMs: number;
  lastEmitMs: number;
  baselineConfig: AgentConfig;
}
const trackers = new WeakMap<EvalRun, EvalTracker>();

export function baselineOf(active: AgentConfigVersion): { firstPassRate: number; costPerPrUsdMicros: number } {
  const run = active.evalRun;
  return run && run.firstPassRate !== null && run.costPerPrUsdMicros !== null
    ? { firstPassRate: run.firstPassRate, costPerPrUsdMicros: run.costPerPrUsdMicros }
    : DEFAULT_BASELINE;
}

export interface StartEvalOptions {
  /** Seeding only: begin part-way through. */
  ticketsDone?: number;
  startedAt?: string;
}

/** Create the eval run for `version`, judged against the active version, and keep it moving. */
export function startEval(ps: ProjectState, agent: AgentRecord, version: AgentConfigVersion, baseline: AgentConfigVersion, options: StartEvalOptions = {}): EvalRun {
  const base = baselineOf(baseline);
  const now = nowMs(ps.store);
  const ticketsDone = options.ticketsDone ?? 0;
  const run: EvalRun = {
    id: nextId(ps, 'eval'),
    agentId: agent.id,
    version: version.version,
    trigger: 'on-change',
    status: 'running',
    ticketsTotal: EVAL_TICKETS,
    ticketsDone,
    firstPassRate: null,
    baselineFirstPassRate: base.firstPassRate,
    costPerPrUsdMicros: null,
    baselineCostPerPrUsdMicros: base.costPerPrUsdMicros,
    deltaFirstPassPts: null,
    deltaCostPct: null,
    reasons: [],
    startedAt: options.startedAt ?? new Date(now).toISOString(),
    finishedAt: null,
  };
  version.evalRun = run;
  trackers.set(run, { progress: ticketsDone, lastMs: now, lastEmitMs: now, baselineConfig: structuredClone(baseline.config) });
  scheduleEvalStep(ps, agent.id, version.version);
  return run;
}

/**
 * `advance()` in tests and the simulator tick both move the clock; this task makes an eval move with
 * the clock either way. Steps are idempotent, so running them from both places is harmless.
 */
function scheduleEvalStep(ps: ProjectState, agentId: string, versionNumber: number): void {
  schedule(ps, pace(ps.store, EVAL_STEP_MS), `eval ${agentId} v${versionNumber}`, () => {
    const agent = ps.agents.find((a) => a.id === agentId);
    const version = agent?.versions.find((v) => v.version === versionNumber);
    if (agent && version && stepEval(ps, agent, version)) scheduleEvalStep(ps, agentId, versionNumber);
  });
}

/** Advance every running eval to the current virtual time. Called from the simulator tick. */
export function stepEvals(ps: ProjectState): void {
  for (const agent of ps.agents) {
    for (const version of agent.versions) if (version.status === 'evaluating') stepEval(ps, agent, version);
  }
}

function trackerOf(ps: ProjectState, agent: AgentRecord, run: EvalRun): EvalTracker {
  let tracker = trackers.get(run);
  if (!tracker) {
    const now = nowMs(ps.store);
    tracker = { progress: run.ticketsDone, lastMs: now, lastEmitMs: now, baselineConfig: structuredClone(activeVersionOf(agent).config) };
    trackers.set(run, tracker);
  }
  return tracker;
}

/** Returns whether the eval is still running afterwards. */
function stepEval(ps: ProjectState, agent: AgentRecord, version: AgentConfigVersion): boolean {
  const run = version.evalRun;
  if (!run || run.status !== 'running') return false;
  const now = nowMs(ps.store);
  const tracker = trackerOf(ps, agent, run);
  const elapsed = Math.max(0, now - tracker.lastMs);
  tracker.lastMs = now;

  // At the hard cap an eval waits, stays `evaluating`, and does not bank the time it spent waiting.
  if (isHardCapHit(ps)) {
    if (!ps.budget.hardAnnounced) enterHardCap(ps);
    return true;
  }

  tracker.progress = Math.min(run.ticketsTotal, tracker.progress + (elapsed / pace(ps.store, EVAL_DURATION_MS)) * run.ticketsTotal);
  const target = Math.min(run.ticketsTotal, Math.floor(tracker.progress + 1e-6));
  const tickets = target - run.ticketsDone;
  if (tickets > 0) {
    const paid = spendOrPause(ps, { usdMicros: tickets * TICKET_COST_USD_MICROS, source: 'eval', epicId: null, workpackId: null, agentId: agent.id });
    if (!paid) return true;
    run.ticketsDone = target;
    if (target < run.ticketsTotal && now - tracker.lastEmitMs >= EVAL_EMIT_MS) {
      tracker.lastEmitMs = now;
      emit(ps, { type: 'agent.eval.progress', agentId: agent.id, version: version.version, ticketsDone: target, ticketsTotal: run.ticketsTotal });
    }
  }

  if (run.ticketsDone < run.ticketsTotal) return true;
  finishEval(ps, agent, version, run, tracker);
  return false;
}

const HAIKU: ModelId = 'anthropic/claude-haiku';

/** The three rules that make the demo's eval fail: a hot temperature, a gutted prompt, a primary model downgraded to Haiku. */
function regresses(next: AgentConfig, base: AgentConfig): boolean {
  const tooHot = next.model.temperature >= 0.7;
  const gutted = next.systemPrompt.length < base.systemPrompt.length * 0.4;
  const downgraded = next.model.primary === HAIKU && base.model.primary !== HAIKU;
  return tooHot || gutted || downgraded;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Deterministic result for a config: a small improvement, or a regression the gate will catch. */
function simulateOutcome(config: AgentConfig, baselineConfig: AgentConfig, run: EvalRun): { firstPassRate: number; costPerPrUsdMicros: number } {
  const h = hash32(canonicalize(config));
  const unit = (shift: number) => ((h >>> shift) & 0xff) / 255;
  let deltaPts: number;
  let costPct: number;
  if (regresses(config, baselineConfig)) {
    const drop = 3 + unit(8) * 3;
    const rise = 12 + unit(16) * 13;
    const mode = h % 3;
    // Fails on first-pass rate, on cost, or on both; the other measure stays inside its tolerance.
    deltaPts = mode === 2 ? unit(8) * 1.8 - 0.9 : -drop;
    costPct = mode === 1 ? unit(16) * 8 - 2 : rise;
  } else {
    deltaPts = 0.3 + unit(8) * 2.2;
    costPct = -(0.5 + unit(16) * 7.5);
  }
  return {
    firstPassRate: round3(clamp(run.baselineFirstPassRate + deltaPts / 100, 0.3, 0.995)),
    costPerPrUsdMicros: Math.round(run.baselineCostPerPrUsdMicros * (1 + costPct / 100)),
  };
}

function finishEval(ps: ProjectState, agent: AgentRecord, version: AgentConfigVersion, run: EvalRun, tracker: EvalTracker): void {
  const outcome = simulateOutcome(version.config, tracker.baselineConfig, run);
  const verdict = evaluateEval({
    ...outcome,
    baselineFirstPassRate: run.baselineFirstPassRate,
    baselineCostPerPrUsdMicros: run.baselineCostPerPrUsdMicros,
  });
  Object.assign(run, {
    status: verdict.status,
    firstPassRate: outcome.firstPassRate,
    costPerPrUsdMicros: outcome.costPerPrUsdMicros,
    deltaFirstPassPts: verdict.deltaFirstPassPts,
    deltaCostPct: verdict.deltaCostPct,
    reasons: verdict.reasons,
    finishedAt: nowIso(ps.store),
  });
  version.status = verdict.status;
  recordAudit(ps, SYSTEM_ACTOR, 'agent.eval_completed', {
    agentId: agent.id,
    version: version.version,
    status: verdict.status,
    deltaFirstPassPts: verdict.deltaFirstPassPts,
    deltaCostPct: verdict.deltaCostPct,
  });
  emit(ps, {
    type: 'agent.eval.completed',
    agentId: agent.id,
    version: version.version,
    status: verdict.status,
    deltaFirstPassPts: verdict.deltaFirstPassPts,
    deltaCostPct: verdict.deltaCostPct,
  });
}

// ---------------------------------------------------------------------------
// Live stats: the last 24 hours of the spend ledger, and the tokens that spend bought
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Seeded 24 h activity that is not in the ledger. Spend recorded for the specialist is added to it. */
const background = new WeakMap<AgentRecord, number>();

export function setBackgroundActivity(agent: AgentRecord, usdMicros: number): void {
  background.set(agent, usdMicros);
}

/**
 * Recompute each specialist's 24 h cost and tokens from the ledger entries of the trailing 24 hours of
 * virtual time, plus its seeded background. Derived rather than accumulated: replayed history older than
 * a day does not count, entries age out as the clock advances, and tokens always agree with spend.
 */
export function syncAgentActivity(ps: ProjectState): void {
  const now = nowMs(ps.store);
  const since = now - DAY_MS;
  const spent = new Map<string, number>();
  for (const entry of ps.spend) {
    const at = Date.parse(entry.at);
    if (entry.agentId && at >= since && at <= now) spent.set(entry.agentId, (spent.get(entry.agentId) ?? 0) + entry.usdMicros);
  }
  for (const agent of ps.agents) {
    const usdMicros = (background.get(agent) ?? 0) + (spent.get(agent.id) ?? 0);
    agent.cost24hUsdMicros = Math.round(usdMicros);
    agent.tokens24h = tokensFor(usdMicros, activeVersionOf(agent).config.model.primary);
    if (agent.cacheHitRatio === 0 && usdMicros > 0) agent.cacheHitRatio = AGENT_SPECS.find((s) => s.id === agent.id)?.activity.cacheHitRatio ?? 0.87;
  }
}

/** The specialists as the API shows them, with live stats brought up to the current virtual time. */
export function agentViews(ps: ProjectState): Agent[] {
  syncAgentActivity(ps);
  return ps.agents.map((agent) => agentView(agent));
}

export function agentViewOf(ps: ProjectState, agent: AgentRecord): Agent {
  syncAgentActivity(ps);
  return agentView(agent);
}

// ---------------------------------------------------------------------------
// Fleet stats
// ---------------------------------------------------------------------------

const BUCKET_MS = 600_000;
/** Average tokens per provider call, for turning daily tokens into a call count. */
const TOKENS_PER_CALL = 6_500;

/** A factor in [1 − spread, 1 + spread], stable for a key. */
const jitter = (key: string, spread: number): number => 1 + ((hash32(key) % 2001) / 1000 - 1) * spread;
const bucketOf = (ps: ProjectState): number => Math.floor(nowMs(ps.store) / BUCKET_MS);

/** A provider that is disabled or disconnected is offline; one that is degraded stays degraded. */
function providerStatus(ps: ProjectState, id: string): ProviderStat['status'] {
  const status = ps.integrations.find((i) => i.id === id)?.status ?? 'connected';
  if (status === 'connected') return 'online';
  return status === 'degraded' ? 'degraded' : 'offline';
}

/** Provider health. Latency moves a little every ten minutes; the status follows the provider's integration. */
export function providerStats(ps: ProjectState): ProviderStat[] {
  const bucket = bucketOf(ps);
  return PROVIDERS.map((p): ProviderStat => {
    const status = providerStatus(ps, p.id);
    if (status === 'offline') return { id: p.id, name: p.name, status, p50LatencyMs: 0, p95LatencyMs: 0, errorRate: 1 };
    return {
      id: p.id,
      name: p.name,
      status,
      p50LatencyMs: Math.round(p.p50 * jitter(`${p.id}:p50:${bucket}`, 0.08)),
      p95LatencyMs: Math.round(p.p95 * jitter(`${p.id}:p95:${bucket}`, 0.08)),
      errorRate: Math.round(p.errorRate * jitter(`${p.id}:err:${bucket}`, 0.15) * 10_000) / 10_000,
    };
  });
}

const modelOfAgent = (ps: ProjectState, agentId: string | null): ModelId => {
  const agent = agentId ? ps.agents.find((a) => a.id === agentId) : undefined;
  return agent ? activeVersionOf(agent).config.model.primary : 'anthropic/claude-sonnet';
};

export function fleetStats(ps: ProjectState): FleetStats {
  syncAgentActivity(ps);
  const bucket = bucketOf(ps);
  const tokens24h = ps.agents.reduce((sum, a) => sum + a.tokens24h, 0);
  const cacheHit = tokens24h > 0 ? ps.agents.reduce((sum, a) => sum + a.tokens24h * a.cacheHitRatio, 0) / tokens24h : 0;
  const failovers24h = ps.agents.reduce((sum, a) => sum + a.failovers24h, 0);
  const calls = tokens24h / TOKENS_PER_CALL;

  const monthStart = monthPeriod(new Date(nowMs(ps.store))).start.getTime();
  let tokensMonth = 0;
  let spendMonthUsdMicros = 0;
  for (const entry of ps.spend) {
    if (Date.parse(entry.at) < monthStart) continue;
    spendMonthUsdMicros += entry.usdMicros;
    tokensMonth += tokensFor(entry.usdMicros, modelOfAgent(ps, entry.agentId));
  }

  const routing = ps.agents.map((agent): RoutingRow => {
    const { primary, fallbacks } = activeVersionOf(agent).config.model;
    return {
      agentId: agent.id,
      agentName: agent.name,
      primary,
      fallbacks,
      p50LatencyMs: Math.round(MODEL_P50_MS[primary] * jitter(`${primary}:${bucket}`, 0.08)),
      costPerMTokUsdMicros: blendedPerMTok(primary),
      failovers24h: agent.failovers24h,
    };
  });

  return {
    providers: providerStats(ps),
    cacheHitRatio: Math.round(cacheHit * 1000) / 1000,
    cacheHitTarget: 0.85,
    failoverRate24h: calls > 0 ? Math.round((failovers24h / calls) * 10_000) / 10_000 : 0,
    failovers24h,
    tokensMonth: Math.round(tokensMonth),
    spendMonthUsdMicros: Math.round(spendMonthUsdMicros),
    routing,
  };
}

// ---------------------------------------------------------------------------
// Manual intake cycles (spec §10.2): Architect-Prime and SentryWatch only
// ---------------------------------------------------------------------------

export interface CycleResult {
  agentId: string;
  processed: number;
  filed: number;
}

const CYCLE_MS = 4_000;
/** When each specialist's latest manual cycle is done, so an earlier cycle's timer cannot cut a later one short. */
const workingUntil = new WeakMap<AgentRecord, number>();
const sweeps = new WeakMap<ProjectState, number>();

const architectBusy = (ps: ProjectState): boolean => ps.epics.some((e) => e.status === 'stage-1' || e.status === 'stage-2');

/**
 * True while a manual cycle is running. The simulator derives `working` from workpacks and Epics, which
 * knows nothing of a cycle started by hand, so it should count this too or it would end the cycle early.
 */
export function manualCycleActive(ps: ProjectState, agentId: string): boolean {
  const agent = ps.agents.find((a) => a.id === agentId);
  return agent !== undefined && nowMs(ps.store) < (workingUntil.get(agent) ?? 0);
}

/** Evaluate every labelled issue the webhook has not delivered yet. Returns how many became an outcome. */
function intakeCycle(ps: ProjectState): number {
  const label = intakeLabel(ps);
  let processed = 0;
  for (const issue of ps.issues.filter((i) => !i.processed && i.labels.includes(label))) {
    // The webhook for this issue may already be on its way; taking it now must not deliver it twice.
    ps.timers = ps.timers.filter((t) => t.label !== `intake issue #${issue.number}`);
    if (evaluateIssue(ps, issue.number)) processed++;
  }
  return processed;
}

const SENTRY_ERRORS = [
  { error: 'TypeError', path: 'src/billing/stripe.ts', severity: 'error' },
  { error: 'RangeError', path: 'src/webhooks/retry.ts', severity: 'warning' },
  { error: 'ReferenceError', path: 'src/auth/session.ts', severity: 'fatal' },
  { error: 'TypeError', path: 'src/search/indexer.ts', severity: 'error' },
  { error: 'SyntaxError', path: 'src/api/serialize.ts', severity: 'warning' },
  { error: 'TypeError', path: 'src/checkout/cart.ts', severity: 'error' },
] as const;
type SentryError = (typeof SENTRY_ERRORS)[number];

const SEVERITY_PRIORITY = { fatal: 'P0', error: 'P1', warning: 'P2' } as const;
const fingerprintOf = (e: SentryError): string => `fp-${hex8(hash32(`${e.error}:${e.path}`))}`;
const isClosed = (status: string): boolean => status === 'completed' || status === 'failed' || status === 'cancelled';

/** One telemetry sweep: files 0 or 1 issue. Every fifth sweep finds nothing new; every third issue repeats an open Epic's error. */
function sentrySweep(ps: ProjectState): number {
  const sweep = sweeps.get(ps) ?? 0;
  sweeps.set(ps, sweep + 1);
  if (sweep % 5 === 4) return 0;

  const earlier = ps.issues.filter((i) => i.origin === 'sentry');
  let error: SentryError | undefined;
  if (earlier.length % 3 === 2) {
    const open = ps.epics.find((e) => e.origin === 'sentry' && !isClosed(e.status));
    const fingerprint = open ? ps.issues.find((i) => i.url === open.sourceRef)?.fingerprint : null;
    error = SENTRY_ERRORS.find((e) => fingerprintOf(e) === fingerprint);
  }
  error ??= SENTRY_ERRORS[new Set(earlier.map((i) => i.fingerprint)).size % SENTRY_ERRORS.length]!;

  const fingerprint = fingerprintOf(error);
  const title = `Unhandled ${error.error} in ${error.path}`;
  const dsl: EpicDsl = {
    title,
    mode: 'bug',
    priority: SEVERITY_PRIORITY[error.severity],
    areas: [error.path.split('/')[1]!],
    acceptance: ['The error fingerprint stops recurring in production'],
  };
  const events = 3 + (hash32(fingerprint) % 120);
  const body = [
    `Sentry reported an unhandled ${error.error} in \`${error.path}\`.`,
    `Severity: ${error.severity} · ${events} events in the last hour.`,
    `Fingerprint: ${fingerprint}`,
  ].join('\n');
  const issue = fileIssue(ps, { title, body: toIssueBody(dsl, body), origin: 'sentry', author: 'sentrywatch[bot]', fingerprint });
  scheduleIntake(ps, issue.number);
  return 1;
}

export function runAgentCycle(ps: ProjectState, agent: AgentRecord, actor: Actor): CycleResult {
  if (!agent.canRunNow) throw conflict('illegal_transition', `${agent.name} has no intake cycle.`);
  if (!integrationEnabled(ps, 'github')) {
    throw new ApiProblem(503, 'github_unavailable', 'GitHub is disabled or unreachable, so the intake cycle could not run.');
  }

  const result: CycleResult =
    agent.id === 'architect-prime'
      ? { agentId: agent.id, processed: intakeCycle(ps), filed: 0 }
      : { agentId: agent.id, processed: 0, filed: sentrySweep(ps) };

  const duration = pace(ps.store, CYCLE_MS);
  workingUntil.set(agent, nowMs(ps.store) + duration);
  // A degraded specialist stays degraded: that is a provider problem, not something a cycle clears.
  if (agent.status !== 'degraded') setAgentStatus(ps, agent.id, 'working');
  schedule(ps, duration, `${agent.id} cycle done`, () => {
    if (manualCycleActive(ps, agent.id) || agent.status !== 'working') return;
    // Architect-Prime keeps working while an Epic is still in stage 1 or 2; the Epic pipeline settles it.
    if (agent.id === 'architect-prime' && architectBusy(ps)) return;
    setAgentStatus(ps, agent.id, 'idle');
  });
  recordAudit(ps, actor, 'agent.cycle_started', { agentId: agent.id, processed: result.processed, filed: result.filed });
  return result;
}
