/** Replay is discarded after this long (spec §16.2). */
export const MAX_AGE_MS = 15 * 60 * 1000;

/** Only steering and Kanban moves may be queued; everything that spends, merges or configures is blocked offline. */
export const QUEUEABLE_KINDS = [
  'steering.suggest',
  'steering.inject',
  'steering.approve',
  'steering.reject',
  'workpack.cancel',
  'workpack.requestChanges',
] as const;
export type QueueableKind = (typeof QUEUEABLE_KINDS)[number];

export function isQueueable(kind: string): kind is QueueableKind {
  return (QUEUEABLE_KINDS as readonly string[]).includes(kind);
}

export interface QueuedAction {
  id: string;
  kind: QueueableKind;
  /** Human-readable, for toasts and the queue popover. */
  label: string;
  request: { method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; path: string; body?: unknown; ifMatch?: string };
  idempotencyKey: string;
  queuedAt: string;
}

/** Append in FIFO order. A repeated idempotency key is the same user action and is ignored. */
export function enqueue(queue: readonly QueuedAction[], action: QueuedAction): QueuedAction[] {
  if (queue.some((a) => a.idempotencyKey === action.idempotencyKey)) return [...queue];
  return [...queue, action];
}

export type ReplayOutcome =
  | 'sent'
  | 'dropped-conflict'
  | 'dropped-forbidden'
  | 'dropped-missing'
  | 'dropped-invalid'
  | 'expired'
  | 'deferred';

export interface ReplayResult {
  id: string;
  label: string;
  outcome: ReplayOutcome;
}

/** HTTP status, or `'network-error'` when the request never reached the server. */
export type Sender = (action: QueuedAction) => Promise<number | 'network-error'>;

function classify(status: number): ReplayOutcome {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 409) return 'dropped-conflict';
  if (status === 401 || status === 403) return 'dropped-forbidden';
  if (status === 404) return 'dropped-missing';
  return 'dropped-invalid';
}

/**
 * Replay the queue in order. Conflicts and rejections drop only their own entry; a network or
 * server error stops the replay and keeps that entry and everything after it for the next reconnect.
 */
export async function replayQueue(
  queue: readonly QueuedAction[],
  send: Sender,
  now: Date,
): Promise<{ remaining: QueuedAction[]; results: ReplayResult[] }> {
  const results: ReplayResult[] = [];
  const remaining: QueuedAction[] = [];

  for (let i = 0; i < queue.length; i++) {
    const action = queue[i]!;
    const summary = { id: action.id, label: action.label };

    if (now.getTime() - Date.parse(action.queuedAt) > MAX_AGE_MS) {
      results.push({ ...summary, outcome: 'expired' });
      continue;
    }

    const response = await send(action);
    if (response === 'network-error' || response >= 500) {
      for (const rest of queue.slice(i)) {
        results.push({ id: rest.id, label: rest.label, outcome: 'deferred' });
        remaining.push(rest);
      }
      break;
    }
    results.push({ ...summary, outcome: classify(response) });
  }
  return { remaining, results };
}
