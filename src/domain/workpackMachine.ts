import type { PausedReason, Role, WorkpackStatus } from '../contracts';
import { ROLE_LABEL, can, requiredRole, type Capability } from './rbac';

export type Actor = 'orchestrator' | Role;

export const TERMINAL_STATUSES: readonly WorkpackStatus[] = ['done', 'failed', 'cancelled'];
/** Statuses a human may cancel from (spec §5.1 manual transitions). */
export const CANCELLABLE_STATUSES: readonly WorkpackStatus[] = [
  'queued',
  'planning',
  'in-progress',
  'verification',
  'awaiting-review',
];

export function isTerminal(status: WorkpackStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Every edge of the §5.1 state diagram: what the orchestrator may do. */
const ORCHESTRATOR_EDGES: Record<WorkpackStatus, readonly WorkpackStatus[]> = {
  queued: ['planning', 'cancelled'],
  planning: ['in-progress', 'failed', 'cancelled'],
  'in-progress': ['verification', 'failed', 'cancelled'],
  verification: ['in-progress', 'awaiting-review', 'done', 'failed', 'cancelled'],
  'awaiting-review': ['done', 'in-progress', 'cancelled'],
  done: [],
  failed: [],
  cancelled: [],
};

export function legalTransitions(from: WorkpackStatus): WorkpackStatus[] {
  return [...ORCHESTRATOR_EDGES[from]];
}

interface ManualEdge {
  from: readonly WorkpackStatus[];
  to: WorkpackStatus;
  capability: Capability;
}

/** The only status changes a human can request from Studio. */
const MANUAL_EDGES: readonly ManualEdge[] = [
  { from: CANCELLABLE_STATUSES, to: 'cancelled', capability: 'workpack.cancel' },
  { from: ['awaiting-review'], to: 'in-progress', capability: 'workpack.requestChanges' },
  { from: ['awaiting-review'], to: 'done', capability: 'workpack.promote' },
];

/** Targets a role may move a workpack to by hand. */
export function manualTargets(from: WorkpackStatus, role: Role): WorkpackStatus[] {
  return MANUAL_EDGES.filter((e) => e.from.includes(from) && can(role, e.capability)).map((e) => e.to);
}

export type TransitionResult =
  | { ok: true }
  | { ok: false; code: 'illegal_transition'; allowed: WorkpackStatus[] }
  | { ok: false; code: 'forbidden'; requiredRole: Role };

export function canTransition(from: WorkpackStatus, to: WorkpackStatus, actor: Actor): TransitionResult {
  if (actor === 'orchestrator') {
    return ORCHESTRATOR_EDGES[from].includes(to) ? { ok: true } : { ok: false, code: 'illegal_transition', allowed: legalTransitions(from) };
  }
  const edge = MANUAL_EDGES.find((e) => e.from.includes(from) && e.to === to);
  if (!edge) {
    return { ok: false, code: 'illegal_transition', allowed: manualTargets(from, actor) };
  }
  if (!can(actor, edge.capability)) {
    return { ok: false, code: 'forbidden', requiredRole: requiredRole(edge.capability) };
  }
  return { ok: true };
}

export type ManualAction =
  | 'cancel'
  | 'requestChanges'
  | 'promote'
  | 'pause'
  | 'resume'
  | 'archive'
  | 'fork'
  | 'rollback'
  | 'holdForReview';

export interface ManualActionState {
  action: ManualAction;
  enabled: boolean;
  requiredRole: Role;
  /** Why the action is disabled, or `null` when enabled. */
  reason: string | null;
}

export interface ActionSubject {
  status: WorkpackStatus;
  commitSha: string | null;
  mergedAt: string | null;
  archived: boolean;
  pausedReasons: readonly PausedReason[];
}

const ACTION_CAPABILITY: Record<ManualAction, Capability> = {
  cancel: 'workpack.cancel',
  requestChanges: 'workpack.requestChanges',
  promote: 'workpack.promote',
  pause: 'workpack.pause',
  resume: 'workpack.pause',
  archive: 'workpack.archive',
  fork: 'workpack.fork',
  rollback: 'workpack.rollback',
  holdForReview: 'workpack.holdForReview',
};

function describePauseBlock(reasons: readonly PausedReason[]): string {
  if (reasons.includes('budget-hard-cap')) return 'Paused by the budget hard cap. Raise the cap or wait for the next period.';
  if (reasons.includes('integration-disabled')) return 'Paused because the GitHub integration is disabled. Re-enable it.';
  if (reasons.includes('manual-global')) return 'Paused for the whole project. Use Resume pipeline.';
  return 'Not paused.';
}

/**
 * Actions that apply to a workpack in its current state, each with whether the role may
 * use it right now. Inapplicable actions are omitted; applicable-but-unavailable ones are
 * returned disabled with a reason so the UI can explain them.
 */
export function manualActions(wp: ActionSubject, role: Role): ManualActionState[] {
  const out: ManualActionState[] = [];
  const terminal = isTerminal(wp.status);

  const push = (action: ManualAction, stateOk: boolean, stateReason: string) => {
    const capability = ACTION_CAPABILITY[action];
    const roleOk = can(role, capability);
    const needed = requiredRole(capability);
    out.push({
      action,
      enabled: roleOk && stateOk,
      requiredRole: needed,
      reason: !roleOk ? `Requires ${ROLE_LABEL[needed]}` : stateOk ? null : stateReason,
    });
  };

  if (CANCELLABLE_STATUSES.includes(wp.status)) push('cancel', true, '');
  if (wp.status === 'awaiting-review') {
    push('requestChanges', true, '');
    push('promote', true, '');
  }
  if (!terminal) {
    const manualPaused = wp.pausedReasons.includes('manual-workpack');
    push('pause', !manualPaused, 'Already paused by hand.');
    push('resume', manualPaused, describePauseBlock(wp.pausedReasons));
    push('holdForReview', wp.status !== 'awaiting-review', 'Already awaiting review.');
  }
  if ((wp.status === 'failed' || wp.status === 'cancelled') && !wp.archived) push('archive', true, '');
  if (wp.commitSha !== null || wp.status === 'failed' || wp.status === 'cancelled') {
    push('fork', wp.commitSha !== null, 'Nothing to fork yet: no commit exists.');
  }
  if (wp.status === 'done' && wp.mergedAt !== null) push('rollback', true, '');
  return out;
}
