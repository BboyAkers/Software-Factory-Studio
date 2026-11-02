import { z } from 'zod';
import type {
  EpicStatus,
  HintKind,
  LogLevel,
  Metric,
  PausedReason,
  QueuedReason,
  WorkpackStatus,
} from './common';
import type { RunStatus } from './workpack';
import type { GateSeverity, GateStatus } from './gate';
import type { AgentStatus } from './agent';

/** Spec §10.3. Types only: the envelope is validated at runtime, payloads are trusted per type. */
export type FactoryEvent =
  // epics & intake
  | { type: 'intake.processed'; intakeId: string; outcome: 'accepted' | 'duplicate' | 'rejected'; issueRef: string; epicId?: string; canonicalEpicId?: string }
  | { type: 'epic.updated'; epicId: string; status: EpicStatus; stage: 1 | 2 | 3 | 4 | null; paused: boolean }
  // workpack lifecycle
  | { type: 'workpack.created'; workpackId: string; epicId: string }
  | { type: 'workpack.status_changed'; workpackId: string; from: WorkpackStatus; to: WorkpackStatus; version: number }
  | { type: 'workpack.progress'; workpackId: string; completeness: number; linesAdded: number; linesRemoved: number; attempt: number }
  | { type: 'workpack.blocked'; workpackId: string; queuedReason: QueuedReason; blockedBy?: string }
  | { type: 'workpack.paused' | 'workpack.resumed'; workpackId: string; reasons: PausedReason[]; actor: string; version: number }
  | { type: 'workpack.archived'; workpackId: string; from: WorkpackStatus }
  | { type: 'workpack.sla_breached'; workpackId: string; priority: string; slaDueAt: string; pausedAtBreach: PausedReason[] }
  | { type: 'workpack.locks_changed'; workpackId: string; humanLockedFiles: string[] }
  // runs (run.started / run.ended travel on the project stream; the rest on the run stream)
  | { type: 'run.started' | 'run.ended'; runId: string; workpackId: string; status?: RunStatus }
  | { type: 'run.token_delta'; runId: string; tokens: number; text?: string }
  | { type: 'run.reasoning_step'; runId: string; step: number; title: string; status: 'active' | 'done' }
  | { type: 'run.tool_call'; runId: string; tool: string; ok: boolean; durationMs: number }
  | { type: 'run.log'; runId: string; level: LogLevel; tag: string; message: string }
  // steering
  | { type: 'steering.suggested'; runId: string; suggestionId: string; author: string }
  | { type: 'steering.approved' | 'steering.rejected' | 'steering.expired'; runId: string; suggestionId: string; approver?: string }
  | { type: 'steering.queued'; runId: string; hintId: string; kind: HintKind; queuedAt: string }
  | { type: 'steering.delivered'; runId: string; hintId: string; deliveredAt: string }
  | { type: 'steering.acknowledged'; runId: string; hintId: string }
  // gates, release, contracts, policy
  | { type: 'gate.updated'; workpackId: string; gate: string; severity: GateSeverity; status: GateStatus; metrics: Metric[] }
  | { type: 'deploy.status'; workpackId: string; environment: 'staging'; status: 'queued' | 'in-progress' | 'succeeded' | 'failed'; url?: string }
  | { type: 'contract.unlocked'; workpackId: string; contractId: string; by: string; reason: string }
  | { type: 'policy.violation'; runId: string; tool: string; path: string; reason: string }
  // agents
  | { type: 'agent.status'; agentId: string; status: AgentStatus }
  | { type: 'agent.eval.progress'; agentId: string; version: number; ticketsDone: number; ticketsTotal: number }
  | { type: 'agent.eval.completed'; agentId: string; version: number; status: 'passed' | 'failed'; deltaFirstPassPts: number; deltaCostPct: number }
  | { type: 'agent.version.activated'; agentId: string; version: number; actor: string }
  // money & platform
  | { type: 'budget.updated'; spendUsdMicros: number; softLimitHit: boolean; hardCapHit: boolean; runwayHours: number | null }
  | { type: 'budget.resumed'; actor: string; resumedRuns: number; reason: 'cap-raised' | 'period-rollover' }
  | { type: 'integration.updated'; integrationId: string; enabled: boolean; status: string }
  | { type: 'token.rotated'; actor: string }
  | { type: 'pipeline.paused' | 'pipeline.resumed'; actor: string; scope: 'project' | 'workpack' | 'epic'; reason: PausedReason }
  | { type: 'benchmark.completed'; benchmarkId: string; passed: number; total: number }
  | { type: 'audit.appended'; entryId: string }
  | { type: 'stream.resync' };

export type FactoryEventType = FactoryEvent['type'];

export interface Envelope<E extends FactoryEvent = FactoryEvent> {
  /** Monotonic per stream; used for Last-Event-ID resume. */
  id: string;
  /** Server time. */
  ts: string;
  projectId: string;
  event: E;
}

export const EnvelopeSchema = z.object({
  id: z.string(),
  ts: z.string(),
  projectId: z.string(),
  event: z.object({ type: z.string() }).passthrough(),
});

/** Events that travel on the per-run stream (spec §10.3) rather than the project stream. */
export const RUN_STREAM_EVENT_TYPES: readonly FactoryEventType[] = [
  'run.token_delta',
  'run.reasoning_step',
  'run.tool_call',
  'run.log',
];

export const STREAM_TOPICS = [
  'epic',
  'intake',
  'workpack',
  'run',
  'steering',
  'gate',
  'agent',
  'budget',
  'platform',
] as const;
export type StreamTopic = (typeof STREAM_TOPICS)[number];

/** Which stream topic an event belongs to, for the `?topics=` filter of the project stream. */
export function topicOf(type: FactoryEventType): StreamTopic {
  const family = type.split('.')[0];
  switch (family) {
    case 'epic':
      return 'epic';
    case 'intake':
      return 'intake';
    case 'workpack':
      return 'workpack';
    case 'run':
      return 'run';
    case 'steering':
      return 'steering';
    case 'gate':
    case 'deploy':
    case 'contract':
    case 'policy':
      return 'gate';
    case 'agent':
      return 'agent';
    case 'budget':
      return 'budget';
    default:
      return 'platform';
  }
}
