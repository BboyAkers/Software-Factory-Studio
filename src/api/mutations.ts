import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  type ApproveResult,
  type Budget,
  type Contract,
  type CreateWorkpackRequest,
  type Epic,
  type HintKind,
  type PipelineToggle,
  type SteeringHint,
  type SteeringSuggestion,
  type UpdateBudgetResponse,
  type Workpack,
} from '../contracts';
import { keys } from '../domain/queryKeys';
import type { QueueableKind } from '../domain/offlineQueue';
import { enqueueOffline } from '../app/offline';
import { toast } from '../app/toast';
import { isApiError, newIdempotencyKey, type ApiError } from './client';
import { OfflineBlockedError, describeError } from './errors';
import { send, write, type Call } from './endpoints';
import { connectionStore, deriveConnection, serverNow, sessionStore } from './state';

/** What a mutation resolves to when it was queued instead of sent. */
export const QUEUED = { queued: true } as const;
export type Queued = typeof QUEUED;
export const isQueued = (value: unknown): value is Queued => typeof value === 'object' && value !== null && (value as { queued?: unknown }).queued === true;

export { OfflineBlockedError, describeError } from './errors';

export interface ApiMutationConfig<TVars, TData> {
  /** Describe the request. Nothing is sent until the mutation runs. */
  call: (vars: TVars) => Call<TData>;
  /** Set for actions that may wait in the offline queue: steering and Kanban moves only. */
  queueable?: { kind: QueueableKind; label: (vars: TVars) => string };
  /** Patch cached data as if the action had already succeeded. Return the function that undoes it. */
  optimistic?: (client: QueryClient, projectId: string, vars: TVars) => (() => void) | void;
  /** Extra queries to refetch on success. The stream usually has updated them already. */
  invalidate?: (projectId: string, vars: TVars, data: TData) => readonly (readonly unknown[])[];
  /** Toast for success. `null` or omitted: say nothing. */
  success?: (data: TData, vars: TVars) => string | null;
  /** How to name the thing in a "changed while you were acting" message. */
  subject?: (vars: TVars) => string;
  /** Forms show errors inline: turn the toast off for them. */
  errorToast?: boolean;
}

interface MutationContext {
  projectId: string;
  rollback: (() => void) | undefined;
}

const isOffline = () => deriveConnection(connectionStore.get(), serverNow()) === 'offline';

/**
 * Every write goes through here: a fresh `Idempotency-Key` per user action, `If-Match` from the call,
 * optimistic patching with rollback, the offline queue for queueable actions, and the right toast for
 * each failure: 403 names the role, 409 refetches, a dropped network says so.
 */
export function useApiMutation<TVars, TData>(config: ApiMutationConfig<TVars, TData>) {
  const client = useQueryClient();
  return useMutation<TData | Queued, Error, TVars, MutationContext>({
    mutationFn: async (vars) => {
      const projectId = sessionStore.get().projectId;
      const call = config.call(vars);
      const idempotencyKey = newIdempotencyKey();
      if (isOffline()) {
        if (!config.queueable) throw new OfflineBlockedError();
        enqueueOffline({
          id: idempotencyKey,
          kind: config.queueable.kind,
          label: config.queueable.label(vars),
          request: { method: call.method, path: call.path, ...(call.body === undefined ? {} : { body: call.body }), ...(call.ifMatch === undefined ? {} : { ifMatch: String(call.ifMatch) }) },
          idempotencyKey,
          queuedAt: new Date(serverNow()).toISOString(),
        });
        return QUEUED;
      }
      return send(call, { idempotencyKey, project: projectId });
    },
    onMutate: (vars) => {
      const projectId = sessionStore.get().projectId ?? '';
      // A blocked action never happens, so it must not look as if it did.
      const blocked = isOffline() && !config.queueable;
      return { projectId, rollback: blocked ? undefined : (config.optimistic?.(client, projectId, vars) ?? undefined) };
    },
    onError: (error, vars, context) => {
      context?.rollback?.();
      if (isApiError(error) && error.type === 'stale_version' && context) void client.invalidateQueries({ queryKey: keys.all(context.projectId) });
      if (config.errorToast === false) return;
      const { title, detail } = describeError(error, config.subject?.(vars));
      toast.error(title, detail ? { detail } : undefined);
    },
    onSuccess: (data, vars, context) => {
      if (isQueued(data)) {
        const label = config.queueable?.label(vars) ?? 'Action';
        toast.info(`Queued: ${label}`, { detail: 'It will be sent when you reconnect.' });
        return;
      }
      const message = config.success?.(data, vars);
      if (message) toast.success(message);
      for (const key of config.invalidate?.(context.projectId, vars, data) ?? []) void client.invalidateQueries({ queryKey: key });
    },
  });
}

// ---------------------------------------------------------------------------
// Optimistic patching of cached workpacks
// ---------------------------------------------------------------------------

type Patch = Partial<Workpack> | ((current: Workpack) => Partial<Workpack>);

function applyPatch(data: unknown, id: string, patch: Patch): unknown {
  const patched = (entry: unknown): unknown => {
    if (typeof entry !== 'object' || entry === null || (entry as { id?: unknown }).id !== id) return entry;
    const current = entry as Workpack;
    return { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
  };
  if (Array.isArray(data)) return data.map(patched);
  if (typeof data === 'object' && data !== null && Array.isArray((data as { items?: unknown }).items)) {
    const paged = data as { items: unknown[] };
    return { ...paged, items: paged.items.map(patched) };
  }
  return patched(data);
}

/** Patch one workpack everywhere it is cached (lists, detail). Returns the function that restores what was there. */
export function patchWorkpackCaches(client: QueryClient, projectId: string, id: string, patch: Patch): () => void {
  const before = client.getQueriesData({ queryKey: keys.workpacks(projectId) });
  for (const [key, data] of before) if (data !== undefined) client.setQueryData(key, applyPatch(data, id, patch));
  return () => {
    for (const [key, data] of before) client.setQueryData(key, data);
  };
}

const nowIso = () => new Date(serverNow()).toISOString();

/** The slice of a workpack a write needs: which one, and the version the person acted on. */
export type VersionedWorkpack = Pick<Workpack, 'id' | 'version'>;

// ---------------------------------------------------------------------------
// Workpack actions (Task Matrix, Mission Control, Live Workspace, Quality)
// ---------------------------------------------------------------------------

export const useCancelWorkpack = () =>
  useApiMutation<VersionedWorkpack, Workpack>({
    call: (wp) => write.workpack.cancel(wp),
    queueable: { kind: 'workpack.cancel', label: (wp) => `Cancel ${wp.id}` },
    optimistic: (client, p, wp) => patchWorkpackCaches(client, p, wp.id, { status: 'cancelled', endedAt: nowIso(), failureReason: 'Cancelled by a user.' }),
    success: (wp) => `Cancelled ${wp.id}. Its branch and PR stay open.`,
    subject: (wp) => wp.id,
  });

export const useRequestChanges = () =>
  useApiMutation<{ workpack: VersionedWorkpack; text: string }, Workpack>({
    call: ({ workpack, text }) => write.workpack.requestChanges(workpack, text),
    queueable: { kind: 'workpack.requestChanges', label: ({ workpack }) => `Request changes on ${workpack.id}` },
    optimistic: (client, p, { workpack }) => patchWorkpackCaches(client, p, workpack.id, { status: 'in-progress', attempt: 1 }),
    success: (wp) => `Requested changes on ${wp.id}. The agent is working again.`,
    subject: ({ workpack }) => workpack.id,
  });

export const usePauseWorkpack = () =>
  useApiMutation<VersionedWorkpack, Workpack>({
    call: (wp) => write.workpack.pause(wp),
    optimistic: (client, p, wp) =>
      patchWorkpackCaches(client, p, wp.id, (c) => ({ paused: true, pausedReasons: c.pausedReasons.includes('manual-workpack') ? c.pausedReasons : [...c.pausedReasons, 'manual-workpack'] })),
    success: (wp) => `Paused ${wp.id}.`,
    subject: (wp) => wp.id,
  });

export const useResumeWorkpack = () =>
  useApiMutation<VersionedWorkpack, Workpack>({
    call: (wp) => write.workpack.resume(wp),
    optimistic: (client, p, wp) =>
      patchWorkpackCaches(client, p, wp.id, (c) => {
        const reasons = c.pausedReasons.filter((r) => r !== 'manual-workpack');
        return { paused: reasons.length > 0, pausedReasons: reasons };
      }),
    success: (wp) => `Resumed ${wp.id}.`,
    subject: (wp) => wp.id,
  });

export const useArchiveWorkpack = () =>
  useApiMutation<VersionedWorkpack, Workpack>({
    call: (wp) => write.workpack.archive(wp),
    optimistic: (client, p, wp) => patchWorkpackCaches(client, p, wp.id, { archived: true, archivedAt: nowIso() }),
    invalidate: (p) => [keys.workpackLists(p)],
    success: (wp) => `Archived ${wp.id}.`,
    subject: (wp) => wp.id,
  });

/** Retry: clones a failed or cancelled workpack. The new workpack is in the result. */
export const useForkWorkpack = () =>
  useApiMutation<VersionedWorkpack, Workpack>({
    call: (wp) => write.workpack.fork(wp),
    invalidate: (p) => [keys.workpackLists(p), keys.epics(p)],
    success: (wp) => `Forked into ${wp.id}.`,
    subject: (wp) => wp.id,
  });

export const usePromoteWorkpack = () =>
  useApiMutation<VersionedWorkpack, Workpack>({
    call: (wp) => write.workpack.promote(wp),
    invalidate: (p, wp) => [keys.release(p, wp.id), keys.gates(p, wp.id), keys.workpackLists(p)],
    success: (wp) => `Merged ${wp.id}. Staging deploys automatically.`,
    subject: (wp) => wp.id,
  });

/** Opens a revert workpack; the original stays `done`. The revert is in the result. */
export const useRollbackWorkpack = () =>
  useApiMutation<VersionedWorkpack, Workpack>({
    call: (wp) => write.workpack.rollback(wp),
    invalidate: (p) => [keys.workpackLists(p), keys.epics(p)],
    success: (wp) => `Opened ${wp.id} to revert the merge.`,
    subject: (wp) => wp.id,
  });

export const useHoldForReview = () =>
  useApiMutation<{ workpack: VersionedWorkpack; hold: boolean }, Workpack>({
    call: ({ workpack, hold }) => write.workpack.holdForReview(workpack, hold),
    optimistic: (client, p, { workpack, hold }) => patchWorkpackCaches(client, p, workpack.id, { autonomyOverride: hold ? 'require-review' : null }),
    success: (wp) => (wp.autonomyOverride ? `${wp.id} will wait for a person to merge it.` : `${wp.id} follows the project merge policy again.`),
    subject: ({ workpack }) => workpack.id,
  });

export const useCreateWorkpack = () =>
  useApiMutation<CreateWorkpackRequest, Workpack>({
    call: (body) => write.workpack.create(body),
    invalidate: (p) => [keys.workpackLists(p), keys.epics(p), keys.pipeline(p)],
    success: (wp) => `Created ${wp.id}.`,
    errorToast: false,
  });

export const useUnlockContract = () =>
  useApiMutation<{ contractId: string; workpackId: string; reason: string }, Contract>({
    call: ({ contractId, reason }) => write.contract.unlock(contractId, reason),
    invalidate: (p, { workpackId }) => [keys.contracts(p, workpackId), keys.release(p, workpackId)],
    success: (c) => `Unlocked ${c.path}. The change is recorded in the audit log.`,
    errorToast: false,
  });

// ---------------------------------------------------------------------------
// Epics and the whole pipeline
// ---------------------------------------------------------------------------

export const usePauseEpic = () =>
  useApiMutation<string, Epic>({
    call: (id) => write.epic.pause(id),
    invalidate: (p) => [keys.epics(p), keys.workpackLists(p), keys.pipeline(p)],
    success: (epic) => `Paused ${epic.id}.`,
  });

export const useResumeEpic = () =>
  useApiMutation<string, Epic>({
    call: (id) => write.epic.resume(id),
    invalidate: (p) => [keys.epics(p), keys.workpackLists(p), keys.pipeline(p)],
    success: (epic) => `Resumed ${epic.id}.`,
  });

export const usePausePipeline = () =>
  useApiMutation<void, PipelineToggle>({
    call: () => write.pipeline.pause(),
    invalidate: (p) => [keys.pipeline(p), keys.workpackLists(p)],
    success: ({ affected }) => `Paused ${affected} workpack${affected === 1 ? '' : 's'}.`,
  });

export const useResumePipeline = () =>
  useApiMutation<void, PipelineToggle>({
    call: () => write.pipeline.resume(),
    invalidate: (p) => [keys.pipeline(p), keys.workpackLists(p)],
    success: ({ affected }) => `Resumed ${affected} workpack${affected === 1 ? '' : 's'}.`,
  });

// ---------------------------------------------------------------------------
// Steering (Mission Control, Live Workspace)
// ---------------------------------------------------------------------------

export const useSuggest = () =>
  useApiMutation<{ runId: string; text: string }, SteeringSuggestion>({
    call: ({ runId, text }) => write.steering.suggest(runId, text),
    queueable: { kind: 'steering.suggest', label: ({ text }) => `Suggestion “${text.slice(0, 40)}”` },
    invalidate: (p, { runId }) => [keys.steering(p, runId)],
    success: () => 'Suggestion sent. An engineer will review it.',
    errorToast: false,
  });

export const useInject = () =>
  useApiMutation<{ runId: string; text: string; kind: HintKind }, SteeringHint>({
    call: ({ runId, text, kind }) => write.steering.inject(runId, text, kind),
    queueable: { kind: 'steering.inject', label: ({ text, kind }) => `${kind === 'hint' ? 'Hint' : kind === 'constraint' ? 'Constraint' : 'Veto'} “${text.slice(0, 40)}”` },
    invalidate: (p, { runId }) => [keys.steering(p, runId)],
    errorToast: false,
  });

export const useApproveSuggestion = () =>
  useApiMutation<{ runId: string; suggestionId: string; kind?: HintKind }, ApproveResult>({
    call: ({ suggestionId, kind }) => write.steering.approve(suggestionId, kind),
    queueable: { kind: 'steering.approve', label: () => 'Approve a suggestion' },
    invalidate: (p, { runId }) => [keys.steering(p, runId)],
    subject: () => 'This suggestion',
  });

export const useRejectSuggestion = () =>
  useApiMutation<{ runId: string; suggestionId: string; reason?: string }, SteeringSuggestion>({
    call: ({ suggestionId, reason }) => write.steering.reject(suggestionId, reason),
    queueable: { kind: 'steering.reject', label: () => 'Reject a suggestion' },
    invalidate: (p, { runId }) => [keys.steering(p, runId)],
    subject: () => 'This suggestion',
  });

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

/** Raising the cap during a hard cap resumes the paused workpacks, P0 first; the result says how many. */
export const useUpdateBudget = () =>
  useApiMutation<{ monthlyCapUsd: number; softLimitPercent: number }, UpdateBudgetResponse>({
    call: ({ monthlyCapUsd, softLimitPercent }) => write.budget.update(monthlyCapUsd, softLimitPercent),
    invalidate: (p) => [keys.budget(p), [...keys.budget(p), 'attribution'], keys.pipeline(p), keys.workpackLists(p)],
    success: ({ resumedRuns }) => (resumedRuns > 0 ? `Cap raised. Resumed ${resumedRuns} workpack${resumedRuns === 1 ? '' : 's'}, P0 first.` : 'Budget saved.'),
    errorToast: false,
  });

export type { ApiError, Budget };
