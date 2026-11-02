import type { QueryClient } from '@tanstack/react-query';
import { isApiError, isNetworkError, request } from '../api/client';
import { createStore, serverNow, sessionStore, useStore } from '../api/state';
import { keys } from '../domain/queryKeys';
import { enqueue, replayQueue, type QueuedAction, type ReplayOutcome, type ReplayResult } from '../domain/offlineQueue';
import { toast } from './toast';

/** The persisted queue of steering and Kanban moves that were made while offline, per project (spec §16.2). */
const storageKey = (projectId: string) => `factory.offline.${projectId}`;

interface OfflineState {
  projectId: string | null;
  items: QueuedAction[];
}

export const offlineStore = createStore<OfflineState>({ projectId: null, items: [] });

function load(projectId: string): QueuedAction[] {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(projectId));
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function persist(state: OfflineState): void {
  if (!state.projectId) return;
  try {
    if (state.items.length === 0) globalThis.localStorage?.removeItem(storageKey(state.projectId));
    else globalThis.localStorage?.setItem(storageKey(state.projectId), JSON.stringify(state.items));
  } catch {
    // Storage full or unavailable: the queue still works until the tab closes.
  }
}

/** Switch the queue to a project's own persisted entries. */
export function selectOfflineProject(projectId: string | null): void {
  if (offlineStore.get().projectId === projectId) return;
  offlineStore.set({ projectId, items: projectId ? load(projectId) : [] });
}

export function enqueueOffline(action: QueuedAction): void {
  offlineStore.set((s) => {
    const next = { ...s, items: enqueue(s.items, action) };
    persist(next);
    return next;
  });
}

export function discardOffline(id: string): void {
  offlineStore.set((s) => {
    const next = { ...s, items: s.items.filter((a) => a.id !== id) };
    persist(next);
    return next;
  });
}

export const useOfflineQueue = (): QueuedAction[] => useStore(offlineStore).items;

const TOAST_FOR: Record<Exclude<ReplayOutcome, 'sent' | 'deferred'>, (label: string) => string> = {
  'dropped-conflict': (label) => `${label} was dropped: it changed while you were offline.`,
  'dropped-forbidden': (label) => `${label} was dropped: your role no longer allows it.`,
  'dropped-missing': (label) => `${label} was dropped: it no longer exists.`,
  'dropped-invalid': (label) => `${label} was dropped: the server rejected it.`,
  expired: (label) => `${label} was discarded: it waited more than 15 minutes.`,
};

let replaying = false;

/** Replay everything queued, first in first out, then refetch what it touched. Safe to call repeatedly. */
export async function replayOffline(client: QueryClient): Promise<ReplayResult[]> {
  const { projectId, items } = offlineStore.get();
  if (replaying || !projectId || items.length === 0) return [];
  replaying = true;
  try {
    const { remaining, results } = await replayQueue(
      items,
      async (action) => {
        try {
          await request(action.request.path, {
            method: action.request.method,
            project: projectId,
            idempotencyKey: action.idempotencyKey,
            ...(action.request.body === undefined ? {} : { body: action.request.body }),
            ...(action.request.ifMatch === undefined ? {} : { ifMatch: action.request.ifMatch }),
          });
          return 200;
        } catch (error) {
          if (isApiError(error)) return error.status;
          return isNetworkError(error) ? 'network-error' : 500;
        }
      },
      new Date(serverNow()),
    );
    offlineStore.set((s) => {
      const next = { ...s, items: remaining };
      persist(next);
      return next;
    });
    const sent = results.filter((r) => r.outcome === 'sent').length;
    for (const r of results) {
      if (r.outcome !== 'sent' && r.outcome !== 'deferred') toast.warning(TOAST_FOR[r.outcome](r.label));
    }
    if (sent > 0) toast.success(`Sent ${sent} queued action${sent === 1 ? '' : 's'}.`);
    // What the queue changed on the server is now fresher than what this tab holds.
    await client.invalidateQueries({ queryKey: keys.all(projectId) });
    return results;
  } finally {
    replaying = false;
  }
}

/** The current project, for call sites that are not React components. */
export const currentProject = (): string | null => sessionStore.get().projectId;
