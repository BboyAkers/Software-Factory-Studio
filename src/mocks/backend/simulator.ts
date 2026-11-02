import { GATE_CATALOG, gateEntry, type Run, type Workpack } from '../../contracts';
import { escalate, needsEscalation } from '../../domain/queue';
import { publishBudget, rolloverIfNeeded, spendOrPause } from './budget';
import { manualCycleActive } from './agents';
import { evaluateIssue } from './epics';
import { ensureFiles, writeProgress } from './files';
import { longHash } from './codegen';
import { startGateRun, type GateRunSummary } from './gates';
import { simulateIntakeTick } from './intakeSim';
import { tickPlatform } from './platform';
import { assignPr, mergeWorkpack, signoffRequired } from './quality';
import { emit, emitLog, emitReasoning, nowIso, nowMs, pace, recordAudit, rngOf, runDueTasks, schedule, setAgentStatus } from './runtime';
import { logLinesFor, narration, reasoningPlan, toolCallsFor } from './scripts';
import { deliverAtTurnBoundary } from './steering';
import { SYSTEM_ACTOR, type Actor, type ProjectState, type RunScratch, type Store } from './store';
import { archiveWorkpack, endRun, refreshQueue, startRun, transition } from './workpacks';

const MINUTE_MS = 60_000;
/** Failed and cancelled workpacks stay in the Recently ended tray this long (spec §5.1 rule 6). */
export const ARCHIVE_AFTER_MS = 5 * MINUTE_MS;
/** A pending steering suggestion expires after an hour (spec §7.4). */
const SUGGESTION_TTL_MS = 60 * MINUTE_MS;
/** Blended price used for agent turns: $4 per million tokens. */
const MICROS_PER_TOKEN = 4;

const agentActor = (ps: ProjectState, id: string): Actor => ({ id, name: ps.agents.find((a) => a.id === id)?.name ?? id, role: 'admin', type: 'agent' });

function codecraftAutonomy(ps: ProjectState): 'fully-autonomous' | 'draft-and-queue' | 'propose-only' {
  const agent = ps.agents.find((a) => a.id === 'codecraft');
  return agent?.versions.find((v) => v.status === 'active')?.config.autonomyPolicy ?? 'draft-and-queue';
}

const commitSha = (wp: Workpack, salt: number | string): string => longHash(`${wp.id}|${wp.attempt}|${salt}`).slice(0, 40);

// ---------------------------------------------------------------------------
// Planning → synthesis
// ---------------------------------------------------------------------------

/** Attach the Epic's shared contracts to a workpack that was created by hand or forked. */
function attachContracts(ps: ProjectState, wp: Workpack): void {
  if (ps.attached.has(wp.id)) return;
  ps.attached.set(wp.id, ps.contracts.filter((c) => c.epicId === wp.epicId && (c.kind === 'ts-types' || c.kind === 'invariant')).map((c) => c.id));
}

/** A workpack admitted to `planning` starts synthesizing once its contracts are attached and its branch exists. */
export function scheduleSynthesisStart(ps: ProjectState, wp: Workpack, delayMs?: number): void {
  wp.phaseName = 'Attaching and locking contracts';
  schedule(ps, delayMs ?? pace(ps.store, ps.store.tuning.planningMs), `${wp.id} planning`, () => beginSynthesis(ps, wp.id));
}

export function beginSynthesis(ps: ProjectState, workpackId: string): void {
  const wp = ps.workpacks.find((w) => w.id === workpackId);
  if (!wp || wp.status !== 'planning') return;
  if (wp.paused) {
    schedule(ps, pace(ps.store, 2_000), `${wp.id} planning (held)`, () => beginSynthesis(ps, workpackId));
    return;
  }
  attachContracts(ps, wp);
  transition(ps, wp, 'in-progress', { actor: 'orchestrator' });
  wp.phaseName = 'Synthesizing';
  const run = startRun(ps, wp, 3);
  beginRunScratch(ps, wp, run);
}

const turnLength = (store: Store): number => {
  const rng = rngOf(store);
  return Math.max(200, Math.round(pace(store, store.tuning.turnMs) * (0.8 + rng.next() * 0.45)));
};

export interface ScratchOptions {
  progress?: number;
  turn?: number;
  turnsTotal?: number;
}

/** Give a synthesis run its pacing state, files and opening reasoning step. */
export function beginRunScratch(ps: ProjectState, wp: Workpack, run: Run, options: ScratchOptions = {}): RunScratch {
  const store = ps.store;
  const rng = rngOf(store);
  const now = nowMs(store);
  const steps = reasoningPlan(wp);
  const startProgress = options.progress ?? wp.completeness;
  const duration = turnLength(store);
  const turnsTotal = options.turnsTotal ?? rng.int(9, 14);
  const turn = options.turn ?? 0;
  const stepIndex = Math.min(steps.length - 1, Math.floor((turn / turnsTotal) * steps.length));
  const scratch: RunScratch = {
    nextTurnAtMs: now + duration,
    turnStartedMs: now,
    turnDurationMs: duration,
    turnTokens: rng.int(22_000, 60_000),
    emittedThisTurn: 0,
    lastTickMs: now,
    turnsTotal,
    startProgress,
    steps,
    stepIndex,
    violations: [],
    lastCommitProgress: startProgress,
  };
  ps.scratch.set(run.id, scratch);
  run.turn = turn;
  ensureFiles(ps, wp);
  emitLog(ps, run.id, 'agent', '[CODECRAFT]', `Starting attempt ${run.attempt}/${wp.maxAttempts} on ${wp.branch}`);
  for (let i = 0; i < stepIndex; i++) emitReasoning(ps, run.id, i + 1, steps[i]!, 'done');
  emitReasoning(ps, run.id, stepIndex + 1, steps[stepIndex]!, 'active');
  return scratch;
}

// ---------------------------------------------------------------------------
// Synthesis turns
// ---------------------------------------------------------------------------

function streamTokens(ps: ProjectState, wp: Workpack, run: Run, scratch: RunScratch, now: number): void {
  const elapsed = now - scratch.lastTickMs;
  scratch.lastTickMs = now;
  if (elapsed <= 0 || scratch.emittedThisTurn >= scratch.turnTokens) return;
  const share = Math.round(scratch.turnTokens * (elapsed / scratch.turnDurationMs));
  const delta = Math.min(scratch.turnTokens - scratch.emittedThisTurn, share);
  if (delta <= 0) return;
  scratch.emittedThisTurn += delta;
  run.tokens += delta;
  wp.tokensConsumed += delta;
  const agent = ps.agents.find((a) => a.id === 'codecraft');
  if (agent) agent.tokens24h += delta;
  const rng = rngOf(ps.store);
  emit(ps, { type: 'run.token_delta', runId: run.id, tokens: delta, ...(rng.chance(0.3) ? { text: narration(rng) } : {}) });
}

function reportViolation(ps: ProjectState, wp: Workpack, run: Run, scratch: RunScratch, path: string): void {
  if (scratch.violations.includes(path)) return;
  scratch.violations.push(path);
  const holder = (ps.files.get(wp.id) ?? []).find((f) => f.path === path)?.lockedBy ?? 'a person';
  const reason = `File is locked by ${holder} until the run ends or they release it.`;
  emit(ps, { type: 'policy.violation', runId: run.id, tool: 'fs.write', path, reason });
  emitLog(ps, run.id, 'warn', '[POLICY]', `Blocked fs.write to ${path}: ${reason}`);
  recordAudit(ps, agentActor(ps, 'codecraft'), 'policy.violation', { workpackId: wp.id, runId: run.id, tool: 'fs.write', path, reason });
}

/** One agent turn: pay for it, read the steering inbox, make progress, narrate. Exported so seeds can replay past turns. */
export function runTurn(ps: ProjectState, wp: Workpack, run: Run, scratch: RunScratch): void {
  const store = ps.store;
  const rng = rngOf(store);

  // Pay for the turn that just ended. A denied reservation is the hard cap: everything pauses and this turn waits.
  const cost = scratch.turnTokens * MICROS_PER_TOKEN;
  const paid = spendOrPause(ps, { usdMicros: cost, source: 'workpack', epicId: wp.epicId, workpackId: wp.id, agentId: 'codecraft' });
  if (!paid) {
    emitLog(ps, run.id, 'warn', '[BUDGET]', 'Hard cap reached. The run pauses until the cap is raised or the month rolls over.');
    return;
  }
  run.costUsdMicros += cost;
  run.turn += 1;

  // Whatever the live token counter has not shown yet still counts toward the turn.
  const unseen = scratch.turnTokens - scratch.emittedThisTurn;
  if (unseen > 0) {
    run.tokens += unseen;
    wp.tokensConsumed += unseen;
    const codecraft = ps.agents.find((a) => a.id === 'codecraft');
    if (codecraft) codecraft.tokens24h += unseen;
  }

  // The agent reads its steering inbox at the turn boundary (spec §7.4).
  const incoming = (ps.inbox.get(run.id) ?? []).map((id) => ps.hints.find((h) => h.id === id)).filter((h) => h !== undefined);
  deliverAtTurnBoundary(ps, run.id, () => rng.chance(0.85));
  const vetoed = incoming.some((h) => h.kind === 'veto');

  const planned = scratch.startProgress + (100 - scratch.startProgress) * (run.turn / scratch.turnsTotal);
  wp.completeness = Math.max(0, Math.min(99, Math.round(vetoed ? planned - 8 : planned)));

  const step = Math.min(scratch.steps.length - 1, Math.floor((run.turn / scratch.turnsTotal) * scratch.steps.length));
  if (step !== scratch.stepIndex) {
    emitReasoning(ps, run.id, scratch.stepIndex + 1, scratch.steps[scratch.stepIndex]!, 'done');
    scratch.stepIndex = step;
    emitReasoning(ps, run.id, step + 1, scratch.steps[step]!, 'active');
  }

  writeProgress(ps, wp, wp.completeness / 100, run.id, (path) => reportViolation(ps, wp, run, scratch, path));

  const proposing = codecraftAutonomy(ps) === 'propose-only';
  let committed: string | null = null;
  if (wp.completeness - scratch.lastCommitProgress >= 18 || (wp.commitSha === null && wp.completeness >= 10)) {
    committed = commitSha(wp, run.turn);
    wp.commitSha = committed;
    scratch.lastCommitProgress = wp.completeness;
    if (!proposing) assignPr(ps, wp);
  }

  const title = scratch.steps[scratch.stepIndex]!;
  for (const line of logLinesFor(wp, title, rng, committed)) emitLog(ps, run.id, line.level, line.tag, line.message);
  for (const call of toolCallsFor(title, rng)) emit(ps, { type: 'run.tool_call', runId: run.id, tool: call.tool, ok: call.ok, durationMs: call.durationMs });
  if (rng.chance(0.03)) {
    const codecraft = ps.agents.find((a) => a.id === 'codecraft');
    if (codecraft) codecraft.failovers24h += 1;
    emitLog(ps, run.id, 'warn', '[LLM]', 'anthropic/claude-sonnet exceeded the 60 s first-token window; failing over to deepseek/deepseek-v3.');
  }
  emit(ps, { type: 'workpack.progress', workpackId: wp.id, completeness: wp.completeness, linesAdded: wp.linesAdded, linesRemoved: wp.linesRemoved, attempt: wp.attempt });

  const now = nowMs(store);
  const duration = turnLength(store);
  scratch.turnStartedMs = now;
  scratch.turnDurationMs = duration;
  scratch.nextTurnAtMs = now + duration;
  scratch.turnTokens = rng.int(22_000, 60_000);
  scratch.emittedThisTurn = 0;
  scratch.lastTickMs = now;

  if (run.turn >= scratch.turnsTotal) finishSynthesis(ps, wp, run);
}

// ---------------------------------------------------------------------------
// Synthesis → verification → review, merge or retry
// ---------------------------------------------------------------------------

/** The diff is complete: close the run, move to verification and start the gates under GateKeeper. */
export function finishSynthesis(ps: ProjectState, wp: Workpack, run: Run): void {
  const scratch = ps.scratch.get(run.id);
  if (scratch) for (let i = scratch.stepIndex; i < scratch.steps.length; i++) emitReasoning(ps, run.id, i + 1, scratch.steps[i]!, 'done');
  ps.scratch.delete(run.id);

  wp.completeness = 100;
  wp.commitSha ??= commitSha(wp, 'final');
  if (codecraftAutonomy(ps) !== 'propose-only') assignPr(ps, wp);
  endRun(ps, run, 'succeeded');
  transition(ps, wp, 'verification', { actor: 'orchestrator' });
  wp.phaseName = 'Running gates';

  const gateRun = startRun(ps, wp, 4);
  emitLog(ps, gateRun.id, 'info', '[GATEKEEPER]', `Starting ${GATE_CATALOG.length} gates on ${wp.commitSha.slice(0, 7)}.`);
  startGateRun(ps, wp, gateRun, (summary) => completeVerification(ps, wp.id, gateRun.id, summary));
}

function notifySlack(ps: ProjectState, kind: 'review' | 'failure' | 'sla', wp: Workpack, text: string): void {
  if (!ps.slack.webhookConfigured || !ps.slack.routing[kind]) return;
  recordAudit(ps, SYSTEM_ACTOR, 'notification.slack_sent', { kind, workpackId: wp.id, channel: ps.slack.channel, text });
}

function failWorkpack(ps: ProjectState, wp: Workpack, reason: string): void {
  transition(ps, wp, 'failed', { actor: 'orchestrator', failureReason: reason });
  wp.phaseName = null;
  notifySlack(ps, 'failure', wp, `${wp.id} failed: ${reason}`);
}

function completeVerification(ps: ProjectState, workpackId: string, gateRunId: string, summary: GateRunSummary): void {
  const wp = ps.workpacks.find((w) => w.id === workpackId);
  const gateRun = ps.runs.find((r) => r.id === gateRunId);
  if (!wp || !gateRun || wp.status !== 'verification') return;
  if (wp.paused) {
    schedule(ps, pace(ps.store, 2_000), `${wp.id} verification (held)`, () => completeVerification(ps, workpackId, gateRunId, summary));
    return;
  }
  const rng = rngOf(ps.store);
  const failed = summary.blockingFailures;
  endRun(ps, gateRun, failed.length > 0 ? 'failed' : 'succeeded');

  if (failed.length > 0) {
    const titles = failed.map((g) => gateEntry(g).title).join(', ');
    if (failed.includes('security.sast_sbom') && rng.chance(0.2)) {
      ps.vetoed.add(wp.id);
      failWorkpack(ps, wp, `SecOps-Vanguard veto: ${titles}.`);
      return;
    }
    if (wp.attempt >= wp.maxAttempts) {
      failWorkpack(ps, wp, `Blocking gates failed after ${wp.maxAttempts} attempts: ${titles}.`);
      return;
    }
    wp.attempt += 1;
    transition(ps, wp, 'in-progress', { actor: 'orchestrator' });
    wp.gateSummary = null;
    wp.phaseName = 'Synthesizing';
    wp.completeness = 55;
    const run = startRun(ps, wp, 3);
    beginRunScratch(ps, wp, run, { progress: 55, turnsTotal: rng.int(4, 7) });
    emitLog(ps, run.id, 'warn', '[GATEKEEPER]', `Gates failed on attempt ${wp.attempt - 1}: ${titles}. Retrying with the failure output.`);
    return;
  }

  wp.phaseName = null;
  if (codecraftAutonomy(ps) === 'propose-only') {
    wp.proposal = true;
    transition(ps, wp, 'awaiting-review', { actor: 'orchestrator' });
    wp.phaseName = 'Proposal stored, no PR opened';
    notifySlack(ps, 'review', wp, `${wp.id} has a proposal ready for review.`);
    return;
  }
  // Auto-merge needs every condition of spec §5.1 rule 18 at once.
  const autoMerge =
    ps.policies.autoMergeVerifiedPRs && codecraftAutonomy(ps) === 'fully-autonomous' && !signoffRequired(ps, wp) && wp.autonomyOverride === null;
  if (autoMerge) {
    mergeWorkpack(ps, wp, 'orchestrator');
    return;
  }
  transition(ps, wp, 'awaiting-review', { actor: 'orchestrator' });
  wp.phaseName = 'Awaiting human review';
  notifySlack(ps, 'review', wp, `${wp.id} is ready for review.`);
}

// ---------------------------------------------------------------------------
// Housekeeping: SLA, archive, suggestion expiry, retries, agent status
// ---------------------------------------------------------------------------

function escalateSlas(ps: ProjectState): void {
  const now = new Date(nowMs(ps.store));
  for (const wp of ps.workpacks) {
    if (!needsEscalation(wp, now)) continue;
    const patch = escalate(now);
    wp.slaBreached = true;
    // Turning the policy off suppresses the page and the queue-band move, never the badge (spec §5.1 rule 7).
    if (ps.policies.slaEscalation) wp.escalatedAt = patch.escalatedAt;
    wp.version += 1;
    recordAudit(ps, SYSTEM_ACTOR, 'workpack.sla_breached', { workpackId: wp.id, priority: wp.priority, slaDueAt: wp.slaDueAt, escalated: ps.policies.slaEscalation });
    emit(ps, { type: 'workpack.sla_breached', workpackId: wp.id, priority: wp.priority, slaDueAt: wp.slaDueAt!, pausedAtBreach: [...wp.pausedReasons] });
    if (ps.policies.slaEscalation) notifySlack(ps, 'sla', wp, `${wp.id} (${wp.priority}) breached its SLA. ${ps.slack.oncallHandle}`.trim());
    refreshQueue(ps);
  }
}

function archiveEnded(ps: ProjectState): void {
  const now = nowMs(ps.store);
  for (const wp of ps.workpacks) {
    if ((wp.status === 'failed' || wp.status === 'cancelled') && !wp.archived && wp.endedAt && now - Date.parse(wp.endedAt) >= ARCHIVE_AFTER_MS) {
      archiveWorkpack(ps, wp, SYSTEM_ACTOR);
    }
  }
}

function expireSuggestions(ps: ProjectState): void {
  const now = nowMs(ps.store);
  for (const s of ps.suggestions) {
    if (s.status === 'pending' && now - Date.parse(s.createdAt) >= SUGGESTION_TTL_MS) {
      s.status = 'expired';
      s.decidedAt = nowIso(ps.store);
      emit(ps, { type: 'steering.expired', runId: s.runId, suggestionId: s.id });
    }
  }
}

/** Issues that arrived while GitHub was disabled are evaluated once it is back. */
function retryUnprocessedIssues(ps: ProjectState): void {
  const now = nowMs(ps.store);
  for (const issue of ps.issues) {
    if (!issue.processed && now - Date.parse(issue.createdAt) > 10_000) evaluateIssue(ps, issue.number);
  }
}

function syncAgentStatus(ps: ProjectState): void {
  const working = (id: string, busy: boolean) => {
    const agent = ps.agents.find((a) => a.id === id);
    if (!agent || agent.status === 'degraded') return;
    // A cycle started by hand (Run now) keeps the agent working even when no workpack or Epic needs it.
    setAgentStatus(ps, id, busy || manualCycleActive(ps, id) ? 'working' : 'idle');
  };
  const live = (status: Workpack['status']) => ps.workpacks.some((w) => w.status === status && !w.paused);
  working('codecraft', live('in-progress'));
  working('gatekeeper', live('verification'));
  working('secops-vanguard', live('verification'));
  working('architect-prime', live('planning') || ps.epics.some((e) => e.status === 'stage-1' || e.status === 'stage-2'));
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

function admitAndStart(ps: ProjectState): void {
  for (const id of refreshQueue(ps, { admitNow: true })) {
    const wp = ps.workpacks.find((w) => w.id === id);
    if (wp) scheduleSynthesisStart(ps, wp);
  }
}

function tickRuns(ps: ProjectState): void {
  const now = nowMs(ps.store);
  for (const wp of ps.workpacks) {
    if (wp.status !== 'in-progress' || wp.paused || !wp.activeRunId) continue;
    const run = ps.runs.find((r) => r.id === wp.activeRunId);
    if (!run || run.endedAt || run.stage !== 3) continue;
    const scratch = ps.scratch.get(run.id) ?? beginRunScratch(ps, wp, run);
    streamTokens(ps, wp, run, scratch, now);
    if (now >= scratch.nextTurnAtMs) runTurn(ps, wp, run, scratch);
  }
}

/** Advance one project by whatever has become due. Safe to call at any rate; the virtual clock decides what happens. */
export function tickProject(ps: ProjectState): void {
  runDueTasks(ps);
  rolloverIfNeeded(ps);
  retryUnprocessedIssues(ps);
  escalateSlas(ps);
  archiveEnded(ps);
  expireSuggestions(ps);
  admitAndStart(ps);
  tickRuns(ps);
  simulateIntakeTick(ps);
  tickPlatform(ps);
  syncAgentStatus(ps);
  publishBudget(ps);
}

export function tickStore(store: Store): void {
  for (const ps of store.projects.values()) tickProject(ps);
}

/** Run the simulator on a timer. Returns a function that stops it. */
export function startSimulator(store: Store, intervalMs = 500): () => void {
  store.sim.running = true;
  const handle = setInterval(() => tickStore(store), intervalMs);
  return () => {
    clearInterval(handle);
    store.sim.running = false;
  };
}
