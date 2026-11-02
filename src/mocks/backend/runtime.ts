import { RUN_STREAM_EVENT_TYPES, type AgentStatus, type Budget, type Envelope, type FactoryEvent, type LogEntry, type Paged } from '../../contracts';
import { GENESIS_HASH, buildEntry } from '../../domain/auditChain';
import { budgetFlags, monthPeriod, projectedSpend, runway } from '../../domain/budget';
import type { Actor, ProjectState, RingBuffer, SpendEntry, Store } from './store';

// ---------------------------------------------------------------------------
// Clock (virtual: real time plus a manual offset, or a fixed instant in tests)
// ---------------------------------------------------------------------------

export const nowMs = (store: Store): number => store.clock.fixedMs ?? Date.now() + store.clock.offsetMs;
export const nowIso = (store: Store): string => new Date(nowMs(store)).toISOString();

export function advanceClock(store: Store, ms: number): void {
  if (store.clock.fixedMs !== null) store.clock.fixedMs += ms;
  else store.clock.offsetMs += ms;
}

// ---------------------------------------------------------------------------
// Seeded randomness (mulberry32)
// ---------------------------------------------------------------------------

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    chance: (p) => next() < p,
  };
}

const rngs = new WeakMap<Store, Rng>();
export function rngOf(store: Store): Rng {
  let rng = rngs.get(store);
  if (!rng) {
    rng = makeRng(store.sim.seed);
    rngs.set(store, rng);
  }
  return rng;
}
export function reseed(store: Store, seed: number): void {
  store.sim.seed = seed;
  rngs.set(store, makeRng(seed));
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

const ID_FORMAT = {
  epic: (n: number) => `EPIC-${1000 + n}`,
  wp: (n: number) => `WP-${2800 + n}`,
  run: (n: number) => `run-${n}`,
  suggestion: (n: number) => `sug-${n}`,
  hint: (n: number) => `hint-${n}`,
  intake: (n: number) => `intake-${n}`,
  audit: (n: number) => `aud-${n}`,
  contract: (n: number) => `ctr-${n}`,
  gate: (n: number) => `gate-${n}`,
  shot: (n: number) => `shot-${n}`,
  version: (n: number) => `ver-${n}`,
  eval: (n: number) => `eval-${n}`,
  bench: (n: number) => `bench-${n}`,
  issue: (n: number) => String(n),
} as const;
export type IdKind = keyof typeof ID_FORMAT;

export function nextId(ps: ProjectState, kind: IdKind): string {
  const n = (ps.counters[kind] = (ps.counters[kind] ?? (kind === 'issue' ? 100 : 0)) + 1);
  return ID_FORMAT[kind](n);
}

export function nextIssueNumber(ps: ProjectState): number {
  return Number(nextId(ps, 'issue'));
}

/** Make sure the counter for `kind` is at least `n`, so seeded explicit ids never collide with generated ones. */
export function bumpCounter(ps: ProjectState, kind: IdKind, n: number): void {
  ps.counters[kind] = Math.max(ps.counters[kind] ?? 0, n);
}

// ---------------------------------------------------------------------------
// Ordering and pagination
// ---------------------------------------------------------------------------

const numericSuffix = (id: string): number => Number(/(\d+)$/.exec(id)?.[1] ?? 0);

/** Newest first. Ties (same timestamp) fall back to the id counter, so order never depends on insertion luck. */
export const newestFirst = (a: { id: string; createdAt: string }, b: { id: string; createdAt: string }): number =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || numericSuffix(b.id) - numericSuffix(a.id);

export function pageOf<T>(items: readonly T[], limit: number, cursor: string | null): Paged<T> {
  const start = cursor ? Math.max(0, Number(cursor) || 0) : 0;
  const slice = items.slice(start, start + limit);
  const end = start + slice.length;
  return { items: slice, nextCursor: end < items.length ? String(end) : null };
}

// ---------------------------------------------------------------------------
// Event bus (project stream, per-run streams, replay rings)
// ---------------------------------------------------------------------------

const PROJECT_RING_LIMIT = 10_000;
const RUN_RING_LIMIT = 500;

function push(buffer: RingBuffer, envelope: Envelope, limit: number): void {
  buffer.ring.push(envelope);
  if (buffer.ring.length > limit) buffer.ring.splice(0, buffer.ring.length - limit);
}

function runBuffer(ps: ProjectState, runId: string): RingBuffer {
  let buffer = ps.runStreams.get(runId);
  if (!buffer) {
    buffer = { seq: 0, ring: [] };
    ps.runStreams.set(runId, buffer);
  }
  return buffer;
}

const isRunStreamEvent = (type: string) => (RUN_STREAM_EVENT_TYPES as readonly string[]).includes(type);

/** Publish an event. High-volume run events go to the run stream, everything else to the project stream. */
export function emit(ps: ProjectState, event: FactoryEvent): Envelope {
  const store = ps.store;
  if (isRunStreamEvent(event.type)) {
    const runId = (event as { runId: string }).runId;
    const buffer = runBuffer(ps, runId);
    const envelope: Envelope = { id: String(++buffer.seq), ts: nowIso(store), projectId: ps.project.id, event };
    push(buffer, envelope, RUN_RING_LIMIT);
    for (const client of store.streams) {
      if (client.projectId === ps.project.id && client.runId === runId) safeSend(client.send, envelope);
    }
    return envelope;
  }
  const envelope: Envelope = { id: String(++ps.events.seq), ts: nowIso(store), projectId: ps.project.id, event };
  push(ps.events, envelope, PROJECT_RING_LIMIT);
  for (const client of store.streams) {
    if (client.projectId === ps.project.id && client.runId === null) safeSend(client.send, envelope);
  }
  return envelope;
}

function safeSend(send: (e: Envelope) => void, envelope: Envelope): void {
  try {
    send(envelope);
  } catch {
    // A closed client must never break the simulation.
  }
}

/** Events after `lastEventId`, or `null` when the ring no longer holds that range (client must resync). */
export function eventsSince(buffer: RingBuffer, lastEventId: string | null): Envelope[] | null {
  if (lastEventId === null) return [];
  const last = Number(lastEventId);
  if (!Number.isFinite(last)) return null;
  if (last > buffer.seq) return null;
  const first = buffer.ring[0];
  if (first && Number(first.id) > last + 1) return null;
  return buffer.ring.filter((e) => Number(e.id) > last);
}

export function runStreamBuffer(ps: ProjectState, runId: string): RingBuffer {
  return runBuffer(ps, runId);
}

const LOG_LIMIT = 2000;

/** Emit a run log line and keep it for `GET /runs/:id/logs` history. */
export function emitLog(ps: ProjectState, runId: string, level: LogEntry['level'], tag: string, message: string): LogEntry {
  const envelope = emit(ps, { type: 'run.log', runId, level, tag, message });
  const entry: LogEntry = { id: `log-${envelope.id}`, runId, ts: envelope.ts, level, tag, message };
  const list = ps.logs.get(runId) ?? [];
  list.push(entry);
  if (list.length > LOG_LIMIT) list.splice(0, list.length - LOG_LIMIT);
  ps.logs.set(runId, list);
  return entry;
}

export function emitReasoning(ps: ProjectState, runId: string, step: number, title: string, status: 'active' | 'done'): void {
  const envelope = emit(ps, { type: 'run.reasoning_step', runId, step, title, status });
  const list = ps.reasoning.get(runId) ?? [];
  const entry = { step, title, status, ts: envelope.ts };
  const at = list.findIndex((s) => s.step === step);
  if (at === -1) list.push(entry);
  else list[at] = entry;
  ps.reasoning.set(runId, list);
}

// ---------------------------------------------------------------------------
// Scheduled tasks (virtual-clock aware; the simulator, or a test, runs them)
// ---------------------------------------------------------------------------

/** Scale a simulation delay by the dev-panel speed (1×, 4×, 16×). The clock itself stays real-time. */
export const pace = (store: Store, ms: number): number => Math.max(1, Math.round(ms / Math.max(1, store.sim.speed)));

export function schedule(ps: ProjectState, delayMs: number, label: string, run: () => void): void {
  ps.timers.push({ dueMs: nowMs(ps.store) + delayMs, label, run });
}

export function runDueTasks(ps: ProjectState): number {
  const now = nowMs(ps.store);
  const due = ps.timers.filter((t) => t.dueMs <= now).sort((a, b) => a.dueMs - b.dueMs);
  if (due.length === 0) return 0;
  ps.timers = ps.timers.filter((t) => t.dueMs > now);
  for (const task of due) task.run();
  return due.length;
}

// ---------------------------------------------------------------------------
// Audit (hash-chained; appends are serialized so callers stay synchronous)
// ---------------------------------------------------------------------------

export function recordAudit(ps: ProjectState, actor: Actor, action: string, target: Record<string, unknown> = {}, atIso?: string): void {
  const input = {
    id: nextId(ps, 'audit'),
    projectId: ps.project.id,
    actor: actor.id,
    actorType: actor.type,
    actorName: actor.name,
    action,
    target,
    createdAt: atIso ?? nowIso(ps.store),
  };
  ps.auditQueue = ps.auditQueue.then(async () => {
    const previous = ps.audit.length > 0 ? ps.audit[ps.audit.length - 1]!.hash : GENESIS_HASH;
    const entry = await buildEntry(previous, input);
    ps.audit.push(entry);
    emit(ps, { type: 'audit.appended', entryId: entry.id });
  });
}

export async function flushAudit(ps: ProjectState): Promise<void> {
  await ps.auditQueue;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export function setAgentStatus(ps: ProjectState, agentId: string, status: AgentStatus): void {
  const agent = ps.agents.find((a) => a.id === agentId);
  if (!agent || agent.status === status) return;
  agent.status = status;
  emit(ps, { type: 'agent.status', agentId, status });
}

// ---------------------------------------------------------------------------
// Spend and budget
// ---------------------------------------------------------------------------

const HOUR_MS = 3_600_000;

/** Trailing 6 h burn rate in micros per hour. */
export function burnRate(ps: ProjectState): number {
  const now = nowMs(ps.store);
  const since = now - 6 * HOUR_MS;
  const total = ps.spend.filter((s) => Date.parse(s.at) >= since && Date.parse(s.at) <= now).reduce((sum, s) => sum + s.usdMicros, 0);
  return total / 6;
}

export function isHardCapHit(ps: ProjectState): boolean {
  return budgetFlags(ps.budget.capUsdMicros, ps.budget.ledger.committed, ps.budget.softLimitPercent).hardCapHit;
}

export function budgetView(ps: ProjectState): Budget {
  const now = new Date(nowMs(ps.store));
  const period = monthPeriod(now);
  const spend = ps.budget.ledger.committed;
  const flags = budgetFlags(ps.budget.capUsdMicros, spend, ps.budget.softLimitPercent);
  const burn = burnRate(ps);
  const hoursLeft = Math.max(0, (period.end.getTime() - now.getTime()) / HOUR_MS);
  return {
    monthlyCapUsdMicros: ps.budget.capUsdMicros,
    spendUsdMicros: spend,
    softLimitPercent: ps.budget.softLimitPercent,
    hardCapPercent: 100,
    softLimitHit: flags.softLimitHit,
    hardCapHit: flags.hardCapHit,
    percentUsed: flags.percentUsed,
    projectedSpendUsdMicros: projectedSpend(spend, burn, hoursLeft),
    runway: runway(ps.budget.capUsdMicros, spend, burn),
    burnUsdMicrosPerHour: Math.round(burn),
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    pausedRuns: ps.workpacks.filter((w) => w.pausedReasons.includes('budget-hard-cap')).length,
    slackChannel: ps.budget.slackChannel,
  };
}

export type ChargeInput = Omit<SpendEntry, 'at'> & { at?: string };

/**
 * Spend through the reservation ledger. Returns false (and records nothing) when the hard cap
 * would be crossed. Attribution counters on the epic, workpack, and agent are kept in step.
 */
export function chargeSpend(ps: ProjectState, input: ChargeInput): boolean {
  const reservation = ps.budget.ledger.reserve(input.usdMicros);
  if (!reservation.ok) return false;
  ps.budget.ledger.settle(reservation.id, input.usdMicros);
  recordSpendEntry(ps, input);
  return true;
}

/** Record spend that is already committed to the ledger (seeding) or just settled. */
export function recordSpendEntry(ps: ProjectState, input: ChargeInput): void {
  ps.spend.push({ ...input, at: input.at ?? nowIso(ps.store) });
  if (input.epicId) {
    const epic = ps.epics.find((e) => e.id === input.epicId);
    if (epic) epic.spendUsdMicros += input.usdMicros;
  }
  if (input.workpackId) {
    const wp = ps.workpacks.find((w) => w.id === input.workpackId);
    if (wp) wp.costUsdMicros += input.usdMicros;
  }
  // The agent's 24 h figure only counts spend from the last 24 hours, so backfilled history does not inflate it.
  if (input.agentId && nowMs(ps.store) - Date.parse(input.at ?? nowIso(ps.store)) < 24 * HOUR_MS) {
    const agent = ps.agents.find((a) => a.id === input.agentId);
    if (agent) agent.cost24hUsdMicros += input.usdMicros;
  }
}
