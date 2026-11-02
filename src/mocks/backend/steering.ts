import type { HintKind, SteeringHint, SteeringState, SteeringSuggestion } from '../../contracts';
import { ApiProblem, conflict, notFound, requireCapability } from '../http';
import { emit, emitLog, nextId, nowIso, nowMs, recordAudit } from './runtime';
import type { Actor, ProjectState } from './store';
import { runById, workpackById } from './workpacks';

function activeRun(ps: ProjectState, runId: string) {
  const run = runById(ps, runId);
  if (run.endedAt) throw conflict('run_not_active', `Run ${runId} has ended, so it can no longer be steered.`);
  return run;
}

export function steeringState(ps: ProjectState, runId: string): SteeringState {
  runById(ps, runId);
  const scratch = ps.scratch.get(runId);
  const run = ps.runs.find((r) => r.id === runId);
  const nextTurnInSec = scratch && run && !run.endedAt && run.status === 'running' ? Math.max(0, Math.round((scratch.nextTurnAtMs - nowMs(ps.store)) / 1000)) : null;
  return {
    suggestions: ps.suggestions.filter((s) => s.runId === runId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    hints: ps.hints.filter((h) => h.runId === runId).sort((a, b) => Date.parse(b.approvedAt) - Date.parse(a.approvedAt)),
    nextTurnInSec,
  };
}

/** Commit an approved hint to the run's steering inbox (G4 clock stops here). */
function commitHint(
  ps: ProjectState,
  runId: string,
  input: { text: string; kind: HintKind; authorId: string; authorName: string; suggestionId: string | null },
  actor: Actor,
): SteeringHint {
  const now = nowIso(ps.store);
  const hint: SteeringHint = {
    id: nextId(ps, 'hint'),
    runId,
    authorId: input.authorId,
    authorName: input.authorName,
    text: input.text,
    kind: input.kind,
    suggestionId: input.suggestionId,
    approvedAt: now,
    queuedAt: now,
    deliveredAt: null,
    acknowledgedAt: null,
    turnsSinceDelivery: 0,
    undelivered: false,
  };
  ps.hints.push(hint);
  const inbox = ps.inbox.get(runId) ?? [];
  inbox.push(hint.id);
  ps.inbox.set(runId, inbox);

  if (input.kind === 'constraint') {
    const run = runById(ps, runId);
    const wp = workpackById(ps, run.workpackId);
    wp.invariants.push(input.text);
    wp.version += 1;
  }
  recordAudit(ps, actor, 'steering.injected', { runId, hintId: hint.id, kind: input.kind });
  emit(ps, { type: 'steering.queued', runId, hintId: hint.id, kind: input.kind, queuedAt: now });
  return hint;
}

export function suggest(ps: ProjectState, runId: string, text: string, actor: Actor): SteeringSuggestion {
  const run = activeRun(ps, runId);
  const suggestion: SteeringSuggestion = {
    id: nextId(ps, 'suggestion'),
    runId,
    workpackId: run.workpackId,
    authorId: actor.id,
    authorName: actor.name,
    text,
    kind: 'hint',
    status: 'pending',
    approverId: null,
    approverName: null,
    rejectReason: null,
    createdAt: nowIso(ps.store),
    decidedAt: null,
  };
  ps.suggestions.push(suggestion);
  recordAudit(ps, actor, 'steering.suggested', { runId, suggestionId: suggestion.id });
  emit(ps, { type: 'steering.suggested', runId, suggestionId: suggestion.id, author: actor.name });
  return suggestion;
}

/** An Engineer+ posts a hint directly: approved at submission, no suggestion involved. */
export function inject(ps: ProjectState, runId: string, text: string, kind: HintKind, actor: Actor): SteeringHint {
  activeRun(ps, runId);
  requireCapability(actor, kind === 'veto' ? 'steering.veto' : 'steering.inject');
  return commitHint(ps, runId, { text, kind, authorId: actor.id, authorName: actor.name, suggestionId: null }, actor);
}

function pendingSuggestion(ps: ProjectState, id: string): SteeringSuggestion {
  const suggestion = ps.suggestions.find((s) => s.id === id);
  if (!suggestion) throw notFound('Suggestion', id);
  if (suggestion.status !== 'pending') {
    throw new ApiProblem(409, 'illegal_transition', `Suggestion ${id} is already ${suggestion.status}.`);
  }
  return suggestion;
}

export function approveSuggestion(ps: ProjectState, id: string, kind: HintKind | undefined, actor: Actor): { suggestion: SteeringSuggestion; hint: SteeringHint } {
  const suggestion = pendingSuggestion(ps, id);
  activeRun(ps, suggestion.runId);
  const chosen = kind ?? suggestion.kind;
  requireCapability(actor, chosen === 'veto' ? 'steering.veto' : 'steering.approve');
  suggestion.kind = chosen;
  suggestion.status = 'approved';
  suggestion.approverId = actor.id;
  suggestion.approverName = actor.name;
  suggestion.decidedAt = nowIso(ps.store);
  emit(ps, { type: 'steering.approved', runId: suggestion.runId, suggestionId: id, approver: actor.name });
  const hint = commitHint(ps, suggestion.runId, { text: suggestion.text, kind: chosen, authorId: suggestion.authorId, authorName: suggestion.authorName, suggestionId: id }, actor);
  return { suggestion, hint };
}

export function rejectSuggestion(ps: ProjectState, id: string, reason: string | undefined, actor: Actor): SteeringSuggestion {
  const suggestion = pendingSuggestion(ps, id);
  suggestion.status = 'rejected';
  suggestion.approverId = actor.id;
  suggestion.approverName = actor.name;
  suggestion.rejectReason = reason ?? null;
  suggestion.decidedAt = nowIso(ps.store);
  recordAudit(ps, actor, 'steering.rejected', { runId: suggestion.runId, suggestionId: id });
  emit(ps, { type: 'steering.rejected', runId: suggestion.runId, suggestionId: id, approver: actor.name });
  return suggestion;
}

/**
 * Called by the simulator at a run's turn boundary: the agent reads its steering inbox, applies each
 * hint, and acknowledges earlier ones (spec §7.4). `acknowledge` decides which delivered hints answer.
 */
export function deliverAtTurnBoundary(ps: ProjectState, runId: string, acknowledge: (hint: SteeringHint) => boolean): void {
  const now = nowIso(ps.store);

  for (const hint of ps.hints.filter((h) => h.runId === runId && h.deliveredAt !== null && h.acknowledgedAt === null)) {
    hint.turnsSinceDelivery += 1;
    if (acknowledge(hint)) {
      hint.acknowledgedAt = now;
      emitLog(ps, runId, 'agent', '[STEERING]', `Acknowledged human steering: "${hint.text}"`);
      emit(ps, { type: 'steering.acknowledged', runId, hintId: hint.id });
    }
  }

  const queued = ps.inbox.get(runId) ?? [];
  ps.inbox.set(runId, []);
  for (const hintId of queued) {
    const hint = ps.hints.find((h) => h.id === hintId);
    if (!hint) continue;
    hint.deliveredAt = now;
    emit(ps, { type: 'steering.delivered', runId, hintId, deliveredAt: now });
    emitLog(ps, runId, 'agent', '[STEERING]', `Applying human steering (${hint.kind}) at turn boundary: "${hint.text}"`);
    if (hint.kind === 'veto') {
      emitLog(ps, runId, 'warn', '[POLICY]', 'Veto received: rolled back the current turn’s tool calls.');
    }
  }
}
