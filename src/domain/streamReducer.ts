import type { Envelope } from '../contracts';
import { keys } from './queryKeys';

/** The slice of the query client the reducer needs, so it can be tested without React. */
export interface CacheOps {
  /** Apply `updater` to the data of every cached query whose key starts with `prefix`. Queries with no data are skipped. */
  update(prefix: readonly unknown[], updater: (old: unknown) => unknown): void;
  invalidate(prefix: readonly unknown[]): void;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPaged = (v: unknown): v is Obj & { items: unknown[] } => isObj(v) && Array.isArray(v.items);

const RUN_LOG_LIMIT = 1000;

function mapMatching(list: unknown[], id: string, patch: Obj): { items: unknown[]; changed: boolean } {
  let changed = false;
  const items = list.map((entry) => {
    if (isObj(entry) && entry.id === id) {
      changed = true;
      return { ...entry, ...patch };
    }
    return entry;
  });
  return { items, changed };
}

/** Patch the entity with `id` wherever it appears: a detail object, a list, or a paged list. */
export function patchById(old: unknown, id: string, patch: Obj): unknown {
  if (isPaged(old)) {
    const { items, changed } = mapMatching(old.items, id, patch);
    return changed ? { ...old, items } : old;
  }
  if (Array.isArray(old)) {
    const { items, changed } = mapMatching(old, id, patch);
    return changed ? items : old;
  }
  if (isObj(old) && old.id === id) return { ...old, ...patch };
  return old;
}

/**
 * Apply one stream envelope to the cache (spec §10.3). Where the payload is complete the cache is
 * patched in place; where membership or derived values can change, the affected queries are invalidated.
 */
export function applyFactoryEvent(ops: CacheOps, projectId: string, envelope: Envelope): void {
  if (envelope.projectId !== projectId) return;
  const p = projectId;
  const event = envelope.event;

  const patchWorkpack = (id: string, patch: Obj) => ops.update(keys.workpacks(p), (old) => patchById(old, id, patch));

  switch (event.type) {
    // --- workpacks ---------------------------------------------------------
    case 'workpack.created':
      ops.invalidate(keys.workpackLists(p));
      ops.invalidate(keys.epics(p));
      return;
    case 'workpack.status_changed':
      patchWorkpack(event.workpackId, { status: event.to, version: event.version });
      ops.invalidate(keys.workpackLists(p));
      ops.invalidate(keys.pipeline(p));
      ops.invalidate(keys.epics(p));
      return;
    case 'workpack.progress':
      patchWorkpack(event.workpackId, {
        completeness: event.completeness,
        linesAdded: event.linesAdded,
        linesRemoved: event.linesRemoved,
        attempt: event.attempt,
      });
      return;
    case 'workpack.blocked':
      patchWorkpack(event.workpackId, { queuedReason: event.queuedReason, blockedBy: event.blockedBy ?? null });
      return;
    case 'workpack.paused':
    case 'workpack.resumed':
      patchWorkpack(event.workpackId, {
        paused: event.reasons.length > 0,
        pausedReasons: event.reasons,
        version: event.version,
      });
      ops.invalidate(keys.pipelineStatus(p));
      return;
    case 'workpack.archived':
      patchWorkpack(event.workpackId, { archived: true });
      ops.invalidate(keys.workpackLists(p));
      return;
    case 'workpack.sla_breached':
      patchWorkpack(event.workpackId, { slaBreached: true, escalatedAt: envelope.ts });
      return;
    case 'workpack.locks_changed':
      patchWorkpack(event.workpackId, { humanLockedFiles: event.humanLockedFiles });
      ops.invalidate(keys.workpackDiffs(p, event.workpackId));
      ops.invalidate(keys.workpackFiles(p, event.workpackId));
      return;

    // --- epics and intake --------------------------------------------------
    case 'epic.updated':
      ops.update(keys.epics(p), (old) => patchById(old, event.epicId, { status: event.status, paused: event.paused }));
      ops.invalidate(keys.pipeline(p));
      return;
    case 'intake.processed':
      ops.invalidate(keys.intake(p));
      ops.invalidate(keys.epics(p));
      return;

    // --- runs --------------------------------------------------------------
    case 'run.started':
    case 'run.ended':
      ops.invalidate(keys.workpack(p, event.workpackId));
      ops.invalidate(keys.run(p, event.runId));
      return;
    case 'run.token_delta':
      ops.update(keys.runs(p), (old) =>
        isObj(old) && old.id === event.runId && typeof old.tokens === 'number' ? { ...old, tokens: old.tokens + event.tokens } : old,
      );
      return;
    case 'run.log':
      ops.update(keys.runLogs(p, event.runId, 'all'), (old) => {
        if (!isPaged(old)) return old;
        const entry = { id: `log-${envelope.id}`, runId: event.runId, ts: envelope.ts, level: event.level, tag: event.tag, message: event.message };
        return { ...old, items: [...old.items.slice(-(RUN_LOG_LIMIT - 1)), entry] };
      });
      return;
    case 'run.reasoning_step':
      ops.update(keys.runReasoning(p, event.runId), (old) => {
        if (!Array.isArray(old)) return old;
        const step = { step: event.step, title: event.title, status: event.status, ts: envelope.ts };
        const exists = old.some((s) => isObj(s) && s.step === event.step);
        return exists ? old.map((s) => (isObj(s) && s.step === event.step ? { ...s, ...step } : s)) : [...old, step];
      });
      return;
    case 'run.tool_call':
      return;

    // --- steering ----------------------------------------------------------
    case 'steering.suggested':
    case 'steering.approved':
    case 'steering.rejected':
    case 'steering.expired':
    case 'steering.queued':
    case 'steering.delivered':
    case 'steering.acknowledged':
      ops.invalidate(keys.steering(p, event.runId));
      return;

    // --- gates, release, contracts ----------------------------------------
    case 'gate.updated':
      ops.invalidate(keys.gates(p, event.workpackId));
      ops.invalidate(keys.release(p, event.workpackId));
      ops.invalidate(keys.workpack(p, event.workpackId));
      return;
    case 'deploy.status':
      ops.invalidate(keys.release(p, event.workpackId));
      ops.invalidate(keys.workpack(p, event.workpackId));
      return;
    case 'contract.unlocked':
      ops.invalidate(keys.contracts(p, event.workpackId));
      return;
    case 'policy.violation':
      return;

    // --- agents ------------------------------------------------------------
    case 'agent.status':
      ops.update(keys.agents(p), (old) => patchById(old, event.agentId, { status: event.status }));
      return;
    case 'agent.eval.progress':
      ops.invalidate(keys.versions(p, event.agentId));
      return;
    case 'agent.eval.completed':
    case 'agent.version.activated':
      ops.invalidate(keys.agents(p));
      return;

    // --- money and platform -----------------------------------------------
    case 'budget.updated':
      ops.update(keys.budget(p), (old) =>
        isObj(old) && 'spendUsdMicros' in old
          ? { ...old, spendUsdMicros: event.spendUsdMicros, softLimitHit: event.softLimitHit, hardCapHit: event.hardCapHit }
          : old,
      );
      ops.invalidate(keys.budget(p));
      return;
    case 'budget.resumed':
      ops.invalidate(keys.budget(p));
      ops.invalidate(keys.workpackLists(p));
      ops.invalidate(keys.pipeline(p));
      return;
    case 'pipeline.paused':
    case 'pipeline.resumed':
      ops.invalidate(keys.pipeline(p));
      ops.invalidate(keys.workpackLists(p));
      return;
    case 'integration.updated':
      ops.invalidate(keys.integrations(p));
      ops.invalidate(keys.pipelineStatus(p));
      return;
    case 'token.rotated':
      ops.invalidate(keys.token(p));
      return;
    case 'audit.appended':
      ops.invalidate(keys.auditAll(p));
      return;
    case 'benchmark.completed':
      ops.invalidate(keys.overview(p));
      return;
    case 'stream.resync':
      ops.invalidate(keys.all(p));
      return;
    default:
      // Unknown event types from a newer server are ignored, never fatal.
      return;
  }
}
