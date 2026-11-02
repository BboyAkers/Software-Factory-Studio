import type { Epic, PausedReason, Priority, Run, Workpack, WorkpackDetail, WorkpackStatus } from '../../contracts';
import { admit, slaDueAt, type QueueItem } from '../../domain/queue';
import { canTransition, isTerminal } from '../../domain/workpackMachine';
import { ApiProblem, conflict, notFound } from '../http';
import { ensureFiles } from './files';
import { emit, isHardCapHit, nextId, nowIso, nowMs, recordAudit } from './runtime';
import type { Actor, ProjectState } from './store';
import { SYSTEM_ACTOR } from './store';

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function workpackById(ps: ProjectState, id: string): Workpack {
  const wp = ps.workpacks.find((w) => w.id === id);
  if (!wp) throw notFound('Workpack', id);
  return wp;
}

export function epicById(ps: ProjectState, id: string): Epic {
  const epic = ps.epics.find((e) => e.id === id);
  if (!epic) throw notFound('Epic', id);
  return epic;
}

export function runById(ps: ProjectState, id: string): Run {
  const run = ps.runs.find((r) => r.id === id);
  if (!run) throw notFound('Run', id);
  return run;
}

export function workpackDetail(ps: ProjectState, wp: Workpack): WorkpackDetail {
  return {
    ...wp,
    runs: ps.runs.filter((r) => r.workpackId === wp.id),
    contractIds: ps.attached.get(wp.id) ?? [],
    epicTitle: ps.epics.find((e) => e.id === wp.epicId)?.title ?? wp.epicId,
    deployment: ps.deployments.get(wp.id) ?? null,
  };
}

export const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'workpack';

/** Current stage owner (spec §5.2): derived from status, never chosen by a user. */
const OWNER_BY_STATUS: Partial<Record<WorkpackStatus, string>> = {
  planning: 'architect-prime',
  'in-progress': 'codecraft',
  verification: 'gatekeeper',
  'awaiting-review': 'gatekeeper',
  done: 'docuforge',
};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export interface WorkpackInit {
  id?: string;
  epicId: string;
  title: string;
  description?: string;
  priority: Priority;
  category: string;
  targetFiles?: string[];
  dependsOn?: string[];
  holdForReview?: boolean;
  createdAt?: string;
  status?: WorkpackStatus;
}

export function makeWorkpack(ps: ProjectState, init: WorkpackInit): Workpack {
  const id = init.id ?? nextId(ps, 'wp');
  const createdAt = init.createdAt ?? nowIso(ps.store);
  const targetFiles = init.targetFiles ?? [];
  const wp: Workpack = {
    id,
    epicId: init.epicId,
    title: init.title,
    description: init.description ?? '',
    status: init.status ?? 'queued',
    priority: init.priority,
    category: init.category,
    language: 'typescript',
    assignedAgentId: null,
    branch: `factory/${id}-${slugify(init.title)}`,
    prNumber: null,
    commitSha: null,
    targetFiles,
    dependsOn: init.dependsOn ?? [],
    linesAdded: 0,
    linesRemoved: 0,
    filesCount: targetFiles.length,
    completeness: 0,
    tokensConsumed: 0,
    costUsdMicros: 0,
    attempt: 1,
    maxAttempts: 3,
    version: 0,
    queuedReason: null,
    queuedReasons: [],
    blockedBy: null,
    paused: false,
    pausedReasons: [],
    pausedBy: null,
    pausedAt: null,
    slaDueAt: slaDueAt(init.priority, createdAt),
    slaBreached: false,
    escalatedAt: null,
    forkOf: null,
    revertOf: null,
    invariants: [],
    humanLockedFiles: [],
    humanIntervened: false,
    autonomyOverride: init.holdForReview ? 'require-review' : null,
    proposal: false,
    failureReason: null,
    activeRunId: null,
    activeDiffStream: null,
    phaseName: null,
    gateSummary: null,
    createdAt,
    startedAt: null,
    endedAt: null,
    archived: false,
    archivedAt: null,
    mergedAt: null,
    completedAt: null,
  };
  wp.assignedAgentId = OWNER_BY_STATUS[wp.status] ?? null;
  ps.workpacks.push(wp);
  return wp;
}

/** Create a workpack as part of the running factory: applies project-wide holds and announces it. */
export function createWorkpack(ps: ProjectState, init: WorkpackInit, actor: Actor): Workpack {
  const wp = makeWorkpack(ps, init);
  if (ps.pipeline.manualGlobal) holdWith(ps, wp, 'manual-global', SYSTEM_ACTOR, false);
  const epic = epicById(ps, init.epicId);
  epic.workpackIds.push(wp.id);
  recordAudit(ps, actor, 'workpack.created', { workpackId: wp.id, epicId: epic.id });
  emit(ps, { type: 'workpack.created', workpackId: wp.id, epicId: epic.id });
  refreshQueue(ps);
  refreshEpic(ps, epic.id);
  return wp;
}

const touch = (wp: Workpack) => {
  wp.version += 1;
};

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export interface TransitionOptions {
  actor: Actor | 'orchestrator';
  failureReason?: string;
  /** Skip the state-machine check (seeding only). */
  force?: boolean;
}

/** Move a workpack through the §5.1 state machine, keeping timestamps, owner, epic, events and audit consistent. */
export function transition(ps: ProjectState, wp: Workpack, to: WorkpackStatus, options: TransitionOptions): Workpack {
  const from = wp.status;
  const who = options.actor === 'orchestrator' ? 'orchestrator' : options.actor.role;
  if (!options.force) {
    const result = canTransition(from, to, who);
    if (!result.ok) {
      if (result.code === 'forbidden') {
        throw new ApiProblem(403, 'forbidden', `Requires ${result.requiredRole}.`, { requiredRole: result.requiredRole });
      }
      throw conflict('illegal_transition', `A workpack cannot move from ${from} to ${to}.`, { allowed: result.allowed });
    }
  }

  const now = nowIso(ps.store);
  wp.status = to;
  wp.assignedAgentId = OWNER_BY_STATUS[to] ?? wp.assignedAgentId;
  if (from === 'queued') {
    wp.queuedReason = null;
    wp.queuedReasons = [];
    wp.blockedBy = null;
  }
  if (to === 'in-progress' && wp.startedAt === null) wp.startedAt = now;
  if (to === 'failed' || to === 'cancelled') {
    wp.endedAt = now;
    wp.failureReason = options.failureReason ?? wp.failureReason ?? (to === 'cancelled' ? 'Cancelled by a user.' : 'Failed.');
  }
  if (to === 'done') {
    wp.completedAt = now;
    wp.completeness = 100;
  }
  touch(wp);

  const actorForAudit = options.actor === 'orchestrator' ? SYSTEM_ACTOR : options.actor;
  recordAudit(ps, actorForAudit, `workpack.${to}`, { workpackId: wp.id, from, to });
  emit(ps, { type: 'workpack.status_changed', workpackId: wp.id, from, to, version: wp.version });
  refreshEpic(ps, wp.epicId);
  return wp;
}

/** Recompute an Epic's status from its workpacks (spec §5.1 rule 17) and announce a change. */
export function refreshEpic(ps: ProjectState, epicId: string): void {
  const epic = ps.epics.find((e) => e.id === epicId);
  if (!epic) return;
  // A failed or cancelled workpack that was forked is replaced by its fork, so it no longer counts against the Epic.
  const superseded = (w: Workpack) => (w.status === 'failed' || w.status === 'cancelled') && ps.workpacks.some((x) => x.forkOf === w.id);
  const own = ps.workpacks.filter((w) => w.epicId === epicId && !superseded(w));
  let status = epic.status;
  if (own.length > 0) {
    const inFlight = own.some((w) => !isTerminal(w.status));
    if (inFlight) status = 'executing';
    else if (own.every((w) => w.status === 'cancelled')) status = 'cancelled';
    else if (own.some((w) => w.status === 'failed')) status = 'failed';
    else status = 'completed';
  }
  const open = own.filter((w) => !isTerminal(w.status));
  // An Epic is paused when it has no workpacks yet and was paused by hand, or every open workpack is paused by hand.
  const paused = own.length === 0 ? epic.paused : open.length > 0 && open.every((w) => w.pausedReasons.includes('manual-workpack'));
  const completed = status === 'completed' || status === 'failed' || status === 'cancelled';
  if (status !== epic.status || paused !== epic.paused) {
    epic.status = status;
    epic.paused = paused;
    epic.completedAt = completed ? (epic.completedAt ?? nowIso(ps.store)) : null;
    emit(ps, { type: 'epic.updated', epicId, status, stage: stageOf(ps, epic), paused });
  }
}

export function stageOf(ps: ProjectState, epic: Epic): 1 | 2 | 3 | 4 | null {
  if (epic.status === 'intake' || epic.status === 'stage-1') return 1;
  if (epic.status === 'stage-2') return 2;
  const own = ps.workpacks.filter((w) => w.epicId === epic.id);
  if (own.some((w) => w.status === 'verification')) return 4;
  if (own.some((w) => w.status === 'in-progress' || w.status === 'planning')) return 3;
  return epic.status === 'executing' ? 3 : null;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

const AGENT_FOR_STAGE: Record<1 | 2 | 3 | 4, string> = { 1: 'architect-prime', 2: 'architect-prime', 3: 'codecraft', 4: 'gatekeeper' };

export function activeVersionNumber(ps: ProjectState, agentId: string): number {
  const agent = ps.agents.find((a) => a.id === agentId);
  return agent?.versions.find((v) => v.status === 'active')?.version ?? 1;
}

export function startRun(ps: ProjectState, wp: Workpack, stage: 1 | 2 | 3 | 4 = 3): Run {
  const agentId = AGENT_FOR_STAGE[stage];
  const run: Run = {
    id: nextId(ps, 'run'),
    workpackId: wp.id,
    stage,
    agentId,
    agentConfigVersion: activeVersionNumber(ps, agentId),
    attempt: wp.attempt,
    turn: 0,
    status: wp.paused ? 'paused' : 'running',
    startedAt: nowIso(ps.store),
    endedAt: null,
    tokens: 0,
    costUsdMicros: 0,
    transcriptUri: null,
  };
  run.transcriptUri = `s3://factory-transcripts/${ps.project.id}/${run.id}.jsonl`;
  ps.runs.push(run);
  wp.activeRunId = run.id;
  emit(ps, { type: 'run.started', runId: run.id, workpackId: wp.id });
  return run;
}

export function endRun(ps: ProjectState, run: Run, status: 'succeeded' | 'failed' | 'cancelled'): void {
  if (run.endedAt) return;
  run.status = status;
  run.endedAt = nowIso(ps.store);

  // Pending suggestions expire with the run; undelivered hints are shown as such (spec §7.4).
  for (const s of ps.suggestions.filter((x) => x.runId === run.id && x.status === 'pending')) {
    s.status = 'expired';
    s.decidedAt = run.endedAt;
    emit(ps, { type: 'steering.expired', runId: run.id, suggestionId: s.id });
  }
  for (const h of ps.hints.filter((x) => x.runId === run.id && x.deliveredAt === null)) h.undelivered = true;
  ps.inbox.delete(run.id);

  const wp = ps.workpacks.find((w) => w.id === run.workpackId);
  if (wp) {
    if (wp.activeRunId === run.id) wp.activeRunId = null;
    wp.activeDiffStream = null;
    releaseAllLocks(ps, wp);
  }
  emit(ps, { type: 'run.ended', runId: run.id, workpackId: run.workpackId, status });
}

// ---------------------------------------------------------------------------
// Pause and resume (a flag with reasons, not a status)
// ---------------------------------------------------------------------------

function holdWith(ps: ProjectState, wp: Workpack, reason: PausedReason, actor: Actor, announce = true): boolean {
  if (isTerminal(wp.status) || wp.pausedReasons.includes(reason)) return false;
  wp.pausedReasons.push(reason);
  wp.paused = true;
  wp.pausedBy = actor.name;
  wp.pausedAt = nowIso(ps.store);
  const run = wp.activeRunId ? ps.runs.find((r) => r.id === wp.activeRunId) : undefined;
  if (run && run.status === 'running') run.status = 'paused';
  touch(wp);
  if (announce) emit(ps, { type: 'workpack.paused', workpackId: wp.id, reasons: [...wp.pausedReasons], actor: actor.name, version: wp.version });
  return true;
}

function releaseHold(ps: ProjectState, wp: Workpack, reason: PausedReason, actor: Actor): boolean {
  if (!wp.pausedReasons.includes(reason)) return false;
  wp.pausedReasons = wp.pausedReasons.filter((r) => r !== reason);
  wp.paused = wp.pausedReasons.length > 0;
  if (!wp.paused) {
    wp.pausedBy = null;
    wp.pausedAt = null;
    const run = wp.activeRunId ? ps.runs.find((r) => r.id === wp.activeRunId) : undefined;
    if (run && run.status === 'paused') run.status = 'running';
  }
  touch(wp);
  emit(ps, { type: 'workpack.resumed', workpackId: wp.id, reasons: [...wp.pausedReasons], actor: actor.name, version: wp.version });
  return true;
}

export function pauseWorkpack(ps: ProjectState, wp: Workpack, actor: Actor): void {
  if (isTerminal(wp.status)) throw conflict('illegal_transition', `${wp.id} has ended and cannot be paused.`);
  if (holdWith(ps, wp, 'manual-workpack', actor)) {
    recordAudit(ps, actor, 'workpack.paused', { workpackId: wp.id, reason: 'manual-workpack' });
    emit(ps, { type: 'pipeline.paused', actor: actor.name, scope: 'workpack', reason: 'manual-workpack' });
  }
}

export function resumeWorkpack(ps: ProjectState, wp: Workpack, actor: Actor): void {
  if (!wp.pausedReasons.includes('manual-workpack')) {
    throw conflict('illegal_transition', `${wp.id} is not paused by hand.`, {
      detail: wp.paused ? `It is paused for: ${wp.pausedReasons.join(', ')}.` : 'It is not paused.',
    });
  }
  releaseHold(ps, wp, 'manual-workpack', actor);
  recordAudit(ps, actor, 'workpack.resumed', { workpackId: wp.id });
  emit(ps, { type: 'pipeline.resumed', actor: actor.name, scope: 'workpack', reason: 'manual-workpack' });
  refreshQueue(ps);
}

export function pauseEpic(ps: ProjectState, epic: Epic, actor: Actor): void {
  for (const wp of ps.workpacks.filter((w) => w.epicId === epic.id)) holdWith(ps, wp, 'manual-workpack', actor);
  epic.paused = true;
  recordAudit(ps, actor, 'epic.paused', { epicId: epic.id });
  emit(ps, { type: 'epic.updated', epicId: epic.id, status: epic.status, stage: stageOf(ps, epic), paused: true });
  emit(ps, { type: 'pipeline.paused', actor: actor.name, scope: 'epic', reason: 'manual-workpack' });
}

export function resumeEpic(ps: ProjectState, epic: Epic, actor: Actor): void {
  for (const wp of ps.workpacks.filter((w) => w.epicId === epic.id)) releaseHold(ps, wp, 'manual-workpack', actor);
  epic.paused = false;
  recordAudit(ps, actor, 'epic.resumed', { epicId: epic.id });
  emit(ps, { type: 'epic.updated', epicId: epic.id, status: epic.status, stage: stageOf(ps, epic), paused: false });
  emit(ps, { type: 'pipeline.resumed', actor: actor.name, scope: 'epic', reason: 'manual-workpack' });
  refreshQueue(ps);
}

export function pauseProject(ps: ProjectState, actor: Actor): number {
  ps.pipeline.manualGlobal = true;
  ps.pipeline.pausedBy = actor.name;
  ps.pipeline.pausedAt = nowIso(ps.store);
  let count = 0;
  for (const wp of ps.workpacks) if (holdWith(ps, wp, 'manual-global', actor)) count++;
  recordAudit(ps, actor, 'pipeline.paused', { scope: 'project', workpacks: count });
  emit(ps, { type: 'pipeline.paused', actor: actor.name, scope: 'project', reason: 'manual-global' });
  return count;
}

export function resumeProject(ps: ProjectState, actor: Actor): number {
  ps.pipeline.manualGlobal = false;
  ps.pipeline.pausedBy = null;
  ps.pipeline.pausedAt = null;
  let count = 0;
  for (const wp of ps.workpacks) if (releaseHold(ps, wp, 'manual-global', actor)) count++;
  recordAudit(ps, actor, 'pipeline.resumed', { scope: 'project', workpacks: count });
  emit(ps, { type: 'pipeline.resumed', actor: actor.name, scope: 'project', reason: 'manual-global' });
  refreshQueue(ps);
  return count;
}

/** Hold every open workpack for a project-wide reason (budget hard cap, GitHub disabled). */
export function holdAll(ps: ProjectState, reason: PausedReason, actor: Actor = SYSTEM_ACTOR): number {
  let count = 0;
  for (const wp of ps.workpacks) if (holdWith(ps, wp, reason, actor)) count++;
  return count;
}

/** Release a project-wide hold, resuming in priority order (P0 → P1 → P2, FIFO). Returns how many were resumed. */
export function releaseAll(ps: ProjectState, reason: PausedReason, actor: Actor = SYSTEM_ACTOR): number {
  const held = ps.workpacks
    .filter((w) => w.pausedReasons.includes(reason))
    .sort((a, b) => {
      const rank = (p: Priority) => (p === 'P0 Blocker' ? 0 : p === 'P1 High' ? 1 : 2);
      return rank(a.priority) - rank(b.priority) || Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });
  for (const wp of held) releaseHold(ps, wp, reason, actor);
  return held.length;
}

// ---------------------------------------------------------------------------
// Cancel, request changes, archive, fork, rollback, hold for review
// ---------------------------------------------------------------------------

export function cancelWorkpack(ps: ProjectState, wp: Workpack, actor: Actor): Workpack {
  const run = wp.activeRunId ? ps.runs.find((r) => r.id === wp.activeRunId) : undefined;
  transition(ps, wp, 'cancelled', { actor });
  if (run) endRun(ps, run, 'cancelled');
  return wp;
}

export function requestChanges(ps: ProjectState, wp: Workpack, text: string, actor: Actor): Workpack {
  transition(ps, wp, 'in-progress', { actor });
  wp.invariants.push(text);
  wp.attempt = 1;
  wp.completeness = 60;
  wp.gateSummary = null;
  touch(wp);
  const run = startRun(ps, wp, 3);
  recordAudit(ps, actor, 'workpack.changes_requested', { workpackId: wp.id, runId: run.id, text });
  return wp;
}

export function archiveWorkpack(ps: ProjectState, wp: Workpack, actor: Actor): Workpack {
  if (wp.status !== 'failed' && wp.status !== 'cancelled') {
    throw conflict('illegal_transition', `${wp.id} is ${wp.status}; only failed or cancelled workpacks can be archived.`);
  }
  if (wp.archived) return wp;
  wp.archived = true;
  wp.archivedAt = nowIso(ps.store);
  touch(wp);
  recordAudit(ps, actor, 'workpack.archived', { workpackId: wp.id });
  emit(ps, { type: 'workpack.archived', workpackId: wp.id, from: wp.status });
  return wp;
}

export function forkWorkpack(ps: ProjectState, wp: Workpack, actor: Actor): Workpack {
  if (wp.commitSha === null && wp.status !== 'failed' && wp.status !== 'cancelled') {
    throw conflict('illegal_transition', `${wp.id} has no commit to fork from yet.`);
  }
  const n = ps.workpacks.filter((w) => w.forkOf === wp.id).length + 1;
  const copy = createWorkpack(
    ps,
    {
      epicId: wp.epicId,
      title: wp.title,
      description: wp.description,
      priority: wp.priority,
      category: wp.category,
      targetFiles: [...wp.targetFiles],
      dependsOn: wp.dependsOn.filter((d) => d !== wp.id),
    },
    actor,
  );
  copy.forkOf = wp.id;
  copy.branch = `${wp.branch}-fork-${n}`;
  copy.commitSha = wp.commitSha;
  copy.invariants = [...wp.invariants];
  copy.autonomyOverride = wp.autonomyOverride;
  touch(copy);
  recordAudit(ps, actor, 'workpack.forked', { workpackId: wp.id, forkId: copy.id });
  return copy;
}

export function rollbackWorkpack(ps: ProjectState, wp: Workpack, actor: Actor): Workpack {
  if (wp.status !== 'done' || wp.mergedAt === null) {
    throw conflict('illegal_transition', `${wp.id} was not merged, so there is nothing to roll back.`);
  }
  const revert = createWorkpack(
    ps,
    {
      epicId: wp.epicId,
      title: `Revert: ${wp.title}`,
      description: `Reverts the merge of ${wp.id}${wp.prNumber ? ` (PR #${wp.prNumber})` : ''}.`,
      priority: wp.priority === 'P2 Normal' ? 'P1 High' : wp.priority,
      category: wp.category,
      targetFiles: [...wp.targetFiles],
    },
    actor,
  );
  revert.revertOf = wp.id;
  revert.branch = `factory/${revert.id}-revert-${slugify(wp.title)}`;
  touch(revert);
  recordAudit(ps, actor, 'workpack.rolled_back', { workpackId: wp.id, revertId: revert.id });
  return revert;
}

export function setHoldForReview(ps: ProjectState, wp: Workpack, hold: boolean, actor: Actor): Workpack {
  const next = hold ? 'require-review' : null;
  if (wp.autonomyOverride === next) return wp;
  wp.autonomyOverride = next;
  touch(wp);
  recordAudit(ps, actor, 'workpack.hold_for_review', { workpackId: wp.id, hold });
  return wp;
}

// ---------------------------------------------------------------------------
// Human file locks
// ---------------------------------------------------------------------------

export function acquireLock(ps: ProjectState, wp: Workpack, path: string, actor: Actor): void {
  const files = ensureFiles(ps, wp);
  const file = files.find((f) => f.path === path);
  if (!file) throw notFound('File', path);
  if (file.lockedBy && file.lockedBy !== actor.name) {
    throw conflict('locked_by_other', `${path} is already locked by ${file.lockedBy}.`);
  }
  file.lockedBy = actor.name;
  wp.humanLockedFiles = files.filter((f) => f.lockedBy).map((f) => f.path);
  touch(wp);
  recordAudit(ps, actor, 'workpack.file_locked', { workpackId: wp.id, path });
  emit(ps, { type: 'workpack.locks_changed', workpackId: wp.id, humanLockedFiles: [...wp.humanLockedFiles] });
}

export function releaseLock(ps: ProjectState, wp: Workpack, path: string, actor: Actor): void {
  const file = (ps.files.get(wp.id) ?? []).find((f) => f.path === path);
  if (!file || !file.lockedBy) return;
  file.lockedBy = null;
  wp.humanLockedFiles = (ps.files.get(wp.id) ?? []).filter((f) => f.lockedBy).map((f) => f.path);
  touch(wp);
  recordAudit(ps, actor, 'workpack.file_unlocked', { workpackId: wp.id, path });
  emit(ps, { type: 'workpack.locks_changed', workpackId: wp.id, humanLockedFiles: [...wp.humanLockedFiles] });
}

function releaseAllLocks(ps: ProjectState, wp: Workpack): void {
  const files = ps.files.get(wp.id) ?? [];
  if (!files.some((f) => f.lockedBy)) return;
  for (const f of files) f.lockedBy = null;
  wp.humanLockedFiles = [];
  touch(wp);
  emit(ps, { type: 'workpack.locks_changed', workpackId: wp.id, humanLockedFiles: [] });
}

// ---------------------------------------------------------------------------
// Queue (admission pass)
// ---------------------------------------------------------------------------

export function integrationEnabled(ps: ProjectState, id: string): boolean {
  return ps.integrations.find((i) => i.id === id)?.enabled ?? true;
}

/**
 * One scheduling pass (spec §5.1 rules 8–10, 15). Records why each queued workpack waits and,
 * when `admitNow` is set, moves the ones that may start to `planning`. Returns the admitted ids.
 */
export function refreshQueue(ps: ProjectState, options: { admitNow?: boolean } = {}): string[] {
  const queued = ps.workpacks.filter((w) => w.status === 'queued');
  const active = ps.workpacks.filter((w) => w.status === 'planning' || w.status === 'in-progress' || w.status === 'verification');
  const items: QueueItem[] = queued.map((w) => ({
    id: w.id,
    priority: w.priority,
    createdAt: w.createdAt,
    escalatedAt: w.escalatedAt,
    targetFiles: w.targetFiles,
    dependsOn: w.dependsOn,
    pausedReasons: w.pausedReasons,
  }));
  const result = admit({
    queued: items,
    active: active.map((w) => ({ id: w.id, targetFiles: w.targetFiles })),
    doneIds: new Set(ps.workpacks.filter((w) => w.status === 'done').map((w) => w.id)),
    hardCapHit: isHardCapHit(ps),
    integrationEnabled: integrationEnabled(ps, 'github'),
    projectPaused: ps.pipeline.manualGlobal,
  });

  for (const wp of queued) {
    const reasons = result.reasons[wp.id] ?? [];
    const blockedBy = result.blockedBy[wp.id] ?? null;
    const top = reasons[0] ?? null;
    const changed = wp.queuedReason !== top || wp.blockedBy !== blockedBy || wp.queuedReasons.join() !== reasons.join();
    wp.queuedReasons = reasons;
    wp.queuedReason = top;
    wp.blockedBy = blockedBy;
    if (changed && top) emit(ps, { type: 'workpack.blocked', workpackId: wp.id, queuedReason: top, blockedBy: blockedBy ?? undefined });
  }

  if (!options.admitNow) return [];
  for (const id of result.admitted) {
    const wp = ps.workpacks.find((w) => w.id === id)!;
    transition(ps, wp, 'planning', { actor: 'orchestrator' });
    wp.phaseName = 'Attaching and locking contracts';
  }
  return result.admitted;
}

export function nowOf(ps: ProjectState): number {
  return nowMs(ps.store);
}
